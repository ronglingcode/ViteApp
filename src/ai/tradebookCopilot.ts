/**
 * Tradebook Copilot - Event-driven AI assistant for trade execution
 *
 * Replaces the every-1-minute LLM call with intelligent, event-driven triggers.
 * Provides: Playbook Strip, Smart Button Colors, Event-Driven AI Nudges,
 * Trade Management Checklist, and On-Demand AI Check.
 */

import * as Chatgpt from './chatgpt';
import * as Models from '../models/models';
import * as TradingState from '../models/tradingState';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as TradebooksManager from '../tradebooks/tradebooksManager';
import * as GoogleDocsApi from '../api/googleDocs/googleDocsApi';
import * as Helper from '../utils/helper';
import * as TimeHelper from '../utils/timeHelper';
import * as Firestore from '../firestore';
import * as Chart from '../ui/chart';
import * as Agent from './agent';
import type { Tradebook } from '../tradebooks/baseTradebook';

declare let window: Models.MyWindow;

// ============================================================
// Types
// ============================================================

export type CopilotEventType =
    | 'price_near_key_level'
    | 'position_opened'
    | 'state_transition'
    | 'condition_to_fail_triggered'
    | 'manual_ai_check';

interface CopilotEvent {
    type: CopilotEventType;
    symbol: string;
    detail: string;
}

// Track last nudge time per symbol+eventType to avoid spamming
const lastNudgeTime: Map<string, number> = new Map();
const NUDGE_COOLDOWN_MS = 60_000; // 1 minute minimum between nudges per symbol

// Track last known position state per symbol (to detect position_opened)
const lastPositionState: Map<string, number> = new Map(); // symbol -> netQuantity

// Track last known tradebook state per symbol (to detect state transitions)
const lastTradebookStates: Map<string, string> = new Map(); // tradebookId -> state

// ============================================================
// Playbook Strip
// ============================================================

/**
 * Create the playbook strip HTML element for a chart container
 */
export const createTradebookStrip = (tabIndex: number): HTMLElement => {
    let container = document.getElementById("chartContainer" + tabIndex);
    if (!container) {
        return document.createElement('div');
    }

    let strip = document.createElement('div');
    strip.className = 'playbookStrip';
    strip.id = 'playbookStrip' + tabIndex;

    let label = document.createElement('span');
    label.className = 'playbookStripLabel';
    label.textContent = '';
    strip.appendChild(label);

    let content = document.createElement('span');
    content.className = 'playbookStripContent';
    content.textContent = 'No active tradebook';
    strip.appendChild(content);

    // Insert after quantityBar
    let quantityBar = container.getElementsByClassName("quantityBar")[0];
    if (quantityBar && quantityBar.nextSibling) {
        quantityBar.parentNode?.insertBefore(strip, quantityBar.nextSibling);
    } else if (quantityBar) {
        quantityBar.parentNode?.appendChild(strip);
    }

    return strip;
};

/**
 * Update the playbook strip content for a symbol
 */
export const updatePlaybookStrip = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) return;

    let strip = document.getElementById('playbookStrip' + widget.tabIndex);
    if (!strip) return;

    let label = strip.getElementsByClassName('playbookStripLabel')[0] as HTMLElement;
    let content = strip.getElementsByClassName('playbookStripContent')[0] as HTMLElement;

    if (!label || !content) return;

    let netQuantity = Models.getPositionNetQuantity(symbol);

    if (netQuantity !== 0) {
        // In-position: show management rules
        let isLong = netQuantity > 0;
        let breakoutState = TradingState.getBreakoutTradeState(symbol, isLong);
        if (breakoutState) {
            let tradebookId = breakoutState.submitEntryResult.tradeBookID;
            let tradebook = TradebooksManager.getTradebookByID(symbol, tradebookId);
            if (tradebook) {
                let instructions = tradebook.getTradeManagementInstructions();
                let dirTag = isLong ? 'LONG' : 'SHORT';
                label.textContent = `${tradebook.name}`;
                label.className = isLong ? 'playbookStripLabel playbookStripLong' : 'playbookStripLabel playbookStripShort';

                // Build condensed management summary
                let parts: string[] = [];
                let condFail = instructions.conditionsToFail;
                if (condFail.length > 0) {
                    parts.push(`Fail: ${condFail[0]}`);
                }
                instructions.mapData.forEach((items, section) => {
                    if (items.length > 0) {
                        parts.push(`${section}: ${items[0]}`);
                    }
                });
                let contentText = parts.join(' | ');
                if (contentText.length > 50) {
                    contentText = contentText.slice(0, 47) + '...';
                }
                content.textContent = contentText;
                strip.style.display = 'block';
                return;
            }
        }
    }

    // Pre-entry: show enabled tradebooks summary
    let enabledBooks: string[] = [];
    if (widget.tradebooks) {
        widget.tradebooks.forEach(tradebook => {
            if (tradebook.isEnabled()) {
                let dir = tradebook.isLong ? 'L' : 'S';
                enabledBooks.push(`${dir}:${tradebook.buttonLabel}`);
            }
        });
    }

    if (enabledBooks.length > 0) {
        label.textContent = 'Active Setups';
        label.className = 'playbookStripLabel';
        content.textContent = enabledBooks.join(' | ');
        strip.style.display = 'block';
    } else {
        strip.style.display = 'none';
    }
};

/**
 * Update playbook strip for a specific tradebook on hover
 */
export const showTradebookInStrip = (symbol: string, tradebook: Tradebook) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) return;

    let strip = document.getElementById('playbookStrip' + widget.tabIndex);
    if (!strip) return;

    let label = strip.getElementsByClassName('playbookStripLabel')[0] as HTMLElement;
    let content = strip.getElementsByClassName('playbookStripContent')[0] as HTMLElement;
    if (!label || !content) return;

    let dir = tradebook.isLong ? 'LONG' : 'SHORT';
    label.textContent = `${tradebook.name} ${dir}`;
    label.className = tradebook.isLong ? 'playbookStripLabel playbookStripLong' : 'playbookStripLabel playbookStripShort';

    // Show condensed tradebook doc
    let doc = tradebook.getTradebookDoc();
    let instructions = tradebook.getTradeManagementInstructions();
    let parts: string[] = [];

    // Extract key info from doc
    let stopMatch = doc.match(/Stop Loss:[\s\S]*?- (.*?)(?:\n|$)/);
    if (stopMatch) parts.push(`Stop: ${stopMatch[1].trim()}`);

    let failMatch = doc.match(/Conditions to fail:[\s\S]*?- (.*?)(?:\n|$)/);
    if (failMatch) parts.push(`Fail: ${failMatch[1].trim()}`);

    if (instructions.conditionsToFail.length > 0) {
        parts.push(`Fail: ${instructions.conditionsToFail[0]}`);
    }

    content.textContent = parts.length > 0 ? parts.join(' | ') : doc.split('\n').slice(0, 2).join(' - ');
    strip.style.display = 'block';
};

// ============================================================
// Event Detection & AI Nudges
// ============================================================

/**
 * Check if price is near a key level and should trigger an AI nudge
 */
export const checkPriceNearKeyLevel = (symbol: string) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    if (!TradingPlans.hasSingleMomentumLevel(plan)) return;

    let currentPrice = Models.getCurrentPrice(symbol);
    if (!currentPrice || currentPrice === 0) return;

    let keyLevel = TradingPlans.getSingleMomentumLevel(plan).high;
    let vwap = Models.getCurrentVwap(symbol);
    let atr = plan.atr.average;
    let threshold = atr * 0.03; // 3% of ATR as proximity threshold

    let levels = [
        { name: 'key level', price: keyLevel },
        { name: 'VWAP', price: vwap },
    ];

    // Also check entry/stop levels if in position
    let netQuantity = Models.getPositionNetQuantity(symbol);
    if (netQuantity !== 0) {
        let isLong = netQuantity > 0;
        let state = TradingState.getBreakoutTradeState(symbol, isLong);
        if (state) {
            levels.push({ name: 'entry', price: state.entryPrice });
            levels.push({ name: 'stop loss', price: state.stopLossPrice });
        }
    }

    for (let level of levels) {
        if (level.price && Math.abs(currentPrice - level.price) <= threshold) {
            triggerEvent({
                type: 'price_near_key_level',
                symbol: symbol,
                detail: `Price ${currentPrice} is near ${level.name} at ${level.price}`
            });
            return; // Only one nudge per check
        }
    }
};

/**
 * Check if a position was just opened (transition from 0 to non-zero)
 */
export const checkPositionChange = (symbol: string) => {
    let currentQuantity = Models.getPositionNetQuantity(symbol);
    let previousQuantity = lastPositionState.get(symbol) || 0;
    lastPositionState.set(symbol, currentQuantity);

    if (previousQuantity === 0 && currentQuantity !== 0) {
        triggerEvent({
            type: 'position_opened',
            symbol: symbol,
            detail: `Position opened: ${currentQuantity > 0 ? 'LONG' : 'SHORT'} ${Math.abs(currentQuantity)} shares`
        });
    }
};

/**
 * Check conditions-to-fail for active positions
 */
export const checkConditionsToFail = (symbol: string) => {
    let netQuantity = Models.getPositionNetQuantity(symbol);
    if (netQuantity === 0) return;

    let isLong = netQuantity > 0;
    let breakoutState = TradingState.getBreakoutTradeState(symbol, isLong);
    if (!breakoutState) return;

    let tradebookId = breakoutState.submitEntryResult.tradeBookID;
    let tradebook = TradebooksManager.getTradebookByID(symbol, tradebookId);
    if (!tradebook) return;

    let currentPrice = Models.getCurrentPrice(symbol);
    let vwap = Models.getCurrentVwap(symbol);
    let plan = TradingPlans.getTradingPlans(symbol);
    if (!TradingPlans.hasSingleMomentumLevel(plan)) return;
    let keyLevel = TradingPlans.getSingleMomentumLevel(plan).high;

    // Check common failure conditions
    let failed = false;
    let failReason = '';

    if (isLong) {
        if (currentPrice < vwap) {
            failed = true;
            failReason = `Price ${currentPrice} lost VWAP ${Helper.roundPrice(symbol, vwap)}`;
        } else if (currentPrice < keyLevel) {
            failed = true;
            failReason = `Price ${currentPrice} lost key level ${keyLevel}`;
        }
    } else {
        if (currentPrice > vwap) {
            failed = true;
            failReason = `Price ${currentPrice} reclaimed VWAP ${Helper.roundPrice(symbol, vwap)}`;
        } else if (currentPrice > keyLevel) {
            failed = true;
            failReason = `Price ${currentPrice} reclaimed key level ${keyLevel}`;
        }
    }

    if (failed) {
        triggerEvent({
            type: 'condition_to_fail_triggered',
            symbol: symbol,
            detail: failReason
        });
    }
};

/**
 * Core event trigger - decides whether to make an LLM call
 */
const triggerEvent = (event: CopilotEvent) => {
    let now = Date.now();
    let cooldownKey = `${event.symbol}:${event.type}`;
    let lastTime = lastNudgeTime.get(cooldownKey) || 0;

    // Enforce cooldown (except for manual checks)
    if (event.type !== 'manual_ai_check' && now - lastTime < NUDGE_COOLDOWN_MS) {
        return;
    }

    // Only trigger AI for positions or manual checks
    let netQuantity = Models.getPositionNetQuantity(event.symbol);
    if (netQuantity === 0 && event.type !== 'manual_ai_check') {
        return;
    }

    lastNudgeTime.set(cooldownKey, now);
    Firestore.logInfo(`[Copilot] ${event.type}: ${event.detail}`);

    // Fire the AI analysis
    runCopilotAnalysis(event);
};

/**
 * Run a focused AI analysis based on the triggering event
 */
const runCopilotAnalysis = async (event: CopilotEvent) => {
    let symbol = event.symbol;
    let netQuantity = Models.getPositionNetQuantity(symbol);
    if (netQuantity === 0 && event.type !== 'manual_ai_check') return;

    let isLong = netQuantity > 0;
    let breakoutState = TradingState.getBreakoutTradeState(symbol, isLong);
    if (!breakoutState && event.type !== 'manual_ai_check') return;

    let tradebookId = breakoutState?.submitEntryResult.tradeBookID || '';
    let tradebook = tradebookId ? TradebooksManager.getTradebookByID(symbol, tradebookId) : null;
    let tradebookDoc = tradebook ? tradebook.getTradebookDoc() : 'No active tradebook';
    let managementInstructions = tradebook ? tradebook.getTradeManagementInstructions() : null;

    let eventContext = '';
    switch (event.type) {
        case 'price_near_key_level':
            eventContext = `ALERT: ${event.detail}. Evaluate whether this level interaction is significant for my tradebook strategy. Should I act?`;
            break;
        case 'position_opened':
            eventContext = `I just opened a position. Confirm this entry aligns with my tradebook. Flag any red flags. What should I watch for immediately?`;
            break;
        case 'condition_to_fail_triggered':
            eventContext = `WARNING: ${event.detail}. My tradebook says this is a failure condition. Is this a true failure or a potential shakeout? What should I do?`;
            break;
        case 'manual_ai_check':
            eventContext = `I want a full tradebook compliance check. Am I following my strategy? What should I be doing right now based on the tradebook?`;
            break;
        default:
            eventContext = event.detail;
    }

    let managementText = '';
    if (managementInstructions) {
        managementInstructions.mapData.forEach((items, section) => {
            managementText += `${section}: ${items.join(', ')}. `;
        });
        if (managementInstructions.conditionsToFail.length > 0) {
            managementText += `Conditions to fail: ${managementInstructions.conditionsToFail.join(', ')}. `;
        }
    }

    let systemPrompt = `You are a concise day trading copilot. You help me follow my tradebook during live trading.

Here is my trading strategy (tradebook):
${tradebookDoc}

Trade management rules:
${managementText}

Your response must be valid JSON with two fields:
- "short_answer": 4-6 words max, the key action or insight
- "full_answer": 1-3 bullet points, each under 100 characters. Start each with a key phrase.

Example:
{
  "short_answer": "hold above vwap",
  "full_answer": "- [support holding]: price bounced off vwap, confirming support\\n- [action]: maintain position, trail stop to last bar low"
}

Return ONLY valid JSON.`;

    let marketData = Agent.getMarketDataText(symbol, isLong);

    let userMessage = `Event: ${eventContext}

Position: ${isLong ? 'LONG' : 'SHORT'} ${symbol}
Entry: $${breakoutState?.entryPrice || 'N/A'} | Stop: $${breakoutState?.stopLossPrice || 'N/A'} | Qty: ${Math.abs(netQuantity)}

${marketData}`;

    let messages: Chatgpt.ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
    ];

    // Use existing chat UI from agent.ts
    try {
        let eventLabel = event.type.replace(/_/g, ' ');
        let div = startCopilotMessage(symbol, `[${eventLabel}] ${event.detail}`);
        let fullResponse = '';

        await Chatgpt.streamChat(messages, (chunk) => {
            fullResponse += chunk;
            try {
                let partialMatch = fullResponse.match(/"full_answer":\s*"([^"]*)/);
                let shortMatch = fullResponse.match(/"short_answer":\s*"([^"]*)/);
                if (div) {
                    if (partialMatch) setTextToDiv(div.content, partialMatch[1]);
                    if (shortMatch) setTextToDiv(div.title, shortMatch[1]);
                }
            } catch { /* partial JSON, continue */ }
        }, { response_format: { type: 'json_object' } });

        try {
            let parsed = JSON.parse(fullResponse);
            if (parsed.short_answer) {
                Helper.speak(parsed.short_answer);
                Chart.showToolTips(symbol, parsed.short_answer);
            }
        } catch {
            Firestore.logError(`[Copilot] Failed to parse response for ${symbol}`);
        }
    } catch (error) {
        Firestore.logError(`[Copilot] AI error for ${symbol}: ${error}`);
    }
};

// ============================================================
// Manual AI Check
// ============================================================

/**
 * Trigger a manual AI check for the given symbol
 */
export const manualAiCheck = (symbol: string) => {
    triggerEvent({
        type: 'manual_ai_check',
        symbol: symbol,
        detail: 'Manual tradebook compliance check'
    });
};

// ============================================================
// Price Update Hook (called on every time-and-sales tick)
// ============================================================

/**
 * Called on every price update from time-and-sales data.
 * Checks for key events that may warrant AI nudges in real time.
 */
export const onPriceUpdate = (symbol: string) => {
    checkPositionChange(symbol);
    checkPriceNearKeyLevel(symbol);
    checkConditionsToFail(symbol);
};

// ============================================================
// Candle Close Hook
// ============================================================

/**
 * Called on each 1-minute candle close.
 * Updates UI components (playbook strip, checklist) that don't need tick-level updates.
 */
export const onCandleClose = (symbol: string) => {
    updatePlaybookStrip(symbol);
    updateTradeManagementChecklist(symbol);
};

// ============================================================
// Trade Management Checklist
// ============================================================

/**
 * Update the trade management checklist in the left pane
 */
export const updateTradeManagementChecklist = (symbol: string) => {
    let container = document.getElementById("traderFocusInstructionsContent");
    if (!container) return;

    let positions = Models.getOpenPositions();
    if (positions.length === 0) {
        container.innerHTML = '<div style="color: #999; padding: 10px;">No open positions</div>';
        return;
    }

    container.innerHTML = '';
    positions.forEach(position => {
        if (position.netQuantity === 0) return;
        buildChecklistForPosition(position, container!);
    });
};

const buildChecklistForPosition = (position: Models.Position, root: HTMLElement) => {
    let symbol = position.symbol;
    let isLong = position.netQuantity > 0;
    let breakoutState = TradingState.getBreakoutTradeState(symbol, isLong);
    if (!breakoutState) return;

    let tradebookId = breakoutState.submitEntryResult.tradeBookID;
    let tradebook = TradebooksManager.getTradebookByID(symbol, tradebookId);
    if (!tradebook) return;

    let instructions = tradebook.getTradeManagementInstructions();
    let currentPrice = Models.getCurrentPrice(symbol);
    let vwap = Models.getCurrentVwap(symbol);
    let plan = TradingPlans.getTradingPlans(symbol);
    let keyLevel = 0;
    if (TradingPlans.hasSingleMomentumLevel(plan)) {
        keyLevel = TradingPlans.getSingleMomentumLevel(plan).high;
    }
    let minutesSinceOpen = Helper.getMinutesSinceMarketOpen(new Date());
    let symbolData = Models.getSymbolData(symbol);

    let wrapper = document.createElement('div');
    wrapper.className = 'copilotChecklist';

    // Header
    let header = document.createElement('div');
    header.className = 'checklistHeader';
    let dirTag = isLong ? 'LONG' : 'SHORT';
    let dirClass = isLong ? 'tag tag-long' : 'tag tag-short';
    header.innerHTML = `<span style="font-weight:700;font-size:16px;">${symbol}</span> <span class="${dirClass}">${tradebook.name} ${dirTag}</span>`;
    wrapper.appendChild(header);

    // Conditions to fail section
    let conditionsToFail = instructions.conditionsToFail;
    if (conditionsToFail.length > 0) {
        let failSection = document.createElement('div');
        failSection.className = 'checklistFailSection';

        let failTitle = document.createElement('div');
        failTitle.className = 'checklistFailTitle';
        failTitle.textContent = 'CONDITIONS TO FAIL';
        failSection.appendChild(failTitle);

        // Evaluate common conditions
        let vwapOk = isLong ? currentPrice >= vwap : currentPrice <= vwap;
        let keyLevelOk = keyLevel > 0 ? (isLong ? currentPrice >= keyLevel : currentPrice <= keyLevel) : true;

        let vwapItem = createChecklistItem(
            `Price ${vwapOk ? 'above' : 'below'} VWAP`,
            `current: ${Helper.roundPrice(symbol, currentPrice)}, VWAP: ${Helper.roundPrice(symbol, vwap)}`,
            vwapOk,
            isLong ? vwapOk : !vwapOk
        );
        failSection.appendChild(vwapItem);

        if (keyLevel > 0) {
            let levelOk = isLong ? currentPrice >= keyLevel : currentPrice <= keyLevel;
            let levelItem = createChecklistItem(
                `Price ${levelOk ? (isLong ? 'above' : 'below') : (isLong ? 'below' : 'above')} key level`,
                `current: ${Helper.roundPrice(symbol, currentPrice)}, level: ${keyLevel}`,
                levelOk,
                isLong ? levelOk : !levelOk
            );
            failSection.appendChild(levelItem);
        }

        wrapper.appendChild(failSection);
    }

    // Management instructions
    instructions.mapData.forEach((items, sectionName) => {
        let section = document.createElement('div');
        section.className = 'checklistSection';

        let sectionTitle = document.createElement('div');
        sectionTitle.className = 'checklistSectionTitle';
        sectionTitle.textContent = sectionName;
        section.appendChild(sectionTitle);

        items.forEach(item => {
            let isActive = isRuleCurrentlyActive(item, minutesSinceOpen, currentPrice, vwap, keyLevel, isLong, breakoutState);
            let itemEl = document.createElement('div');
            itemEl.className = isActive ? 'checklistItem checklistItemActive' : 'checklistItem';
            itemEl.textContent = item;
            if (isActive) {
                itemEl.textContent = '→ ' + item;
            }
            section.appendChild(itemEl);
        });

        wrapper.appendChild(section);
    });

    // Position info
    let posInfo = document.createElement('div');
    posInfo.className = 'checklistPositionInfo';
    let entryPrice = breakoutState.entryPrice;
    let stopPrice = breakoutState.stopLossPrice;
    let pnlPerShare = isLong ? currentPrice - entryPrice : entryPrice - currentPrice;
    let rMultiple = stopPrice !== entryPrice ? pnlPerShare / Math.abs(entryPrice - stopPrice) : 0;
    posInfo.innerHTML = `Entry: ${entryPrice} | Stop: ${stopPrice} | P&L/sh: ${Helper.roundPrice(symbol, pnlPerShare)} | R: ${rMultiple.toFixed(1)}`;
    wrapper.appendChild(posInfo);

    root.appendChild(wrapper);
};

const createChecklistItem = (label: string, detail: string, isOk: boolean, isGood: boolean): HTMLElement => {
    let item = document.createElement('div');
    item.className = 'checklistFailItem';
    let icon = isOk ? '✅' : '⚠️';
    let color = isGood ? '#16a34a' : '#dc2626';
    item.innerHTML = `<span>${icon}</span> <span style="color:${color};font-weight:600;">${label}</span> <span style="color:#666;font-size:12px;">(${detail})</span>`;
    return item;
};

/**
 * Simple heuristic to determine if a management rule is currently relevant
 */
const isRuleCurrentlyActive = (
    rule: string,
    minutesSinceOpen: number,
    currentPrice: number,
    vwap: number,
    keyLevel: number,
    isLong: boolean,
    state: any
): boolean => {
    let ruleLower = rule.toLowerCase();

    // Time-based rules
    if (ruleLower.includes('after 5 min') && minutesSinceOpen >= 5) return true;
    if (ruleLower.includes('after 10 min') && minutesSinceOpen >= 10) return true;
    if (ruleLower.includes('after 15 min') && minutesSinceOpen >= 15) return true;
    if (ruleLower.includes('first 5 min') && minutesSinceOpen <= 5) return true;
    if (ruleLower.includes('first 10 min') && minutesSinceOpen <= 10) return true;

    // VWAP-based rules
    if (ruleLower.includes('vwap') && Math.abs(currentPrice - vwap) < Math.abs(state.entryPrice - state.stopLossPrice) * 0.3) {
        return true;
    }

    // Key level-based rules
    if (keyLevel > 0 && ruleLower.includes('key level') || ruleLower.includes('inflection')) {
        if (Math.abs(currentPrice - keyLevel) < Math.abs(state.entryPrice - state.stopLossPrice) * 0.3) {
            return true;
        }
    }

    // Trail stop rules
    if (ruleLower.includes('trail') && minutesSinceOpen >= 5) return true;

    return false;
};

// ============================================================
// UI Helpers (for copilot messages in chat panel)
// ============================================================

interface CopilotMessageDiv {
    title: HTMLElement;
    content: HTMLElement;
}

const startCopilotMessage = (symbol: string, title: string): CopilotMessageDiv | null => {
    let index = Models.getWatchlistIndex(symbol);
    if (index === -1) return null;

    let chatContainer = document.getElementById('chatContainer' + index);
    if (chatContainer) {
        chatContainer.style.display = 'block';
    }

    let container = document.getElementById('chat' + index);
    if (!container) return null;

    let messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        margin: 8px 0;
        padding: 8px;
        border-radius: 6px;
        background: #fefce8;
        border-left: 3px solid #ca8a04;
    `;

    let titleDiv = document.createElement('div');
    titleDiv.style.cssText = 'font-weight: bold; margin-bottom: 4px; color: #92400e; font-size: 11px;';
    titleDiv.textContent = title;
    messageDiv.appendChild(titleDiv);

    let contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'white-space: pre-wrap; font-size: 12px; line-height: 1.4;';
    messageDiv.appendChild(contentDiv);

    container.insertBefore(messageDiv, container.firstChild);

    return { title: titleDiv, content: contentDiv };
};

const setTextToDiv = (div: HTMLElement, text: string) => {
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = text.replace(/\\n/g, '\n');
    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

// ============================================================
// Setup
// ============================================================

/**
 * Initialize the Tradebook Copilot for all charts
 */
export const setup = () => {
    let watchlist = Models.getWatchlist();
    for (let i = 0; i < watchlist.length; i++) {
        createTradebookStrip(i);
        createAiCheckButton(i, watchlist[i].symbol);
    }
};

/**
 * Create the AI Check button on a chart's topbar
 */
const createAiCheckButton = (tabIndex: number, symbol: string) => {
    let topbar = document.getElementById("topbar" + tabIndex);
    if (!topbar) return;

    let button = document.createElement('span');
    button.className = 'aiCheckButton';
    button.textContent = 'AI';
    button.title = 'Run AI tradebook compliance check';
    button.addEventListener('click', () => {
        Firestore.logInfo(`[Copilot] Manual AI check for ${symbol}`);
        manualAiCheck(symbol);
    });

    topbar.appendChild(button);
};
