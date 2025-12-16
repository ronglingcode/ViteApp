/**
 * ChatGPT API Integration
 * OpenAI API documentation: https://platform.openai.com/docs/api-reference/chat
 */

import * as Chatgpt from './chatgpt';
import * as TradingState from '../models/tradingState';
import * as TradebooksManager from '../tradebooks/tradebooksManager';
import * as GoogleDocsApi from '../api/googleDocs/googleDocsApi';
import * as Models from '../models/models';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as Helper from '../utils/helper';
import * as TimeHelper from '../utils/timeHelper';
import * as ProxyServer from '../api/proxyServer';
import * as LevelToAdd from '../tradebooks/tradebookDocs/levelToAdd';
import * as MarketDataFeatures from './marketDataFeatures';
import * as Chart from '../ui/chart';

declare let window: Models.MyWindow;

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface CandleData {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    vwap?: number;
}

// Store conversation history for each active trade
export const tradeConversations: Map<string, ChatMessage[]> = new Map();


const getChatgptMessagesDiv = (symbol: string): HTMLElement | null => {
    let index = Models.getWatchlistIndex(symbol);
    if (index == -1) {
        console.log(`[ChatGPT] No index for ${symbol}`);
        return null;
    }
    let div = document.getElementById('chat' + index);
    if (!div) {
        console.log(`[ChatGPT] No div for ${symbol}`);
        return null;
    }
    return div;
};
interface MessageDiv {
    contentDiv: HTMLElement;
    titleDiv: HTMLElement;
}
/**
 * Add a new message block to the UI
 * @param title - Title/header for the message
 * @param isUser - Whether this is a user message
 */
const startNewMessage = (symbol: string, title: string, isUser: boolean = false) => {
    const container = getChatgptMessagesDiv(symbol);
    if (!container) {
        console.log(`[ChatGPT] No container for ${symbol}`);
        return null;
    }

    // Create message wrapper
    const messageDiv = document.createElement('div');
    messageDiv.className = isUser ? 'chatgpt-message user-message' : 'chatgpt-message assistant-message';
    messageDiv.style.cssText = `
        margin: 8px 0;
        padding: 8px;
        border-radius: 6px;
        background: ${isUser ? '#e6f0ff' : '#f5faf7'};
        border-left: 3px solid ${isUser ? '#2563eb' : '#16a34a'};
    `;

    // Add title
    const titleDiv = document.createElement('div');
    titleDiv.style.cssText = 'font-weight: bold; margin-bottom: 4px; color: #888; font-size: 11px;';
    titleDiv.textContent = title;
    messageDiv.appendChild(titleDiv);

    // Add content area
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.style.cssText = 'white-space: pre-wrap; font-size: 12px; line-height: 1.4;';
    messageDiv.appendChild(contentDiv);

    // Insert at top
    container.insertBefore(messageDiv, container.firstChild);
    let div: MessageDiv = { contentDiv, titleDiv };
    return div;
};
const setTextToDiv = (div: HTMLElement | null, text: string) => {
    if (!div) {
        console.log(`[ChatGPT] No div to set text to`);
        return;
    }
    // Ensure white-space: pre-wrap is set to preserve newlines
    div.style.whiteSpace = 'pre-wrap';
    // Replace escaped newlines with actual newlines, then set as textContent
    // This handles both literal \n in strings and actual newline characters
    const unescapedText = text.replace(/\\n/g, '\n');
    div.textContent = unescapedText;
    // Auto-scroll to show latest
    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};
const appendToDiv = (div: HTMLElement | null, chunk: string) => {
    if (!div) {
        console.log(`[ChatGPT] No div to append to`);
        return;
    }
    div.textContent += chunk;
    // Auto-scroll to show latest
    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};


/**
 * Clear all messages from the UI
 */
export const clearMessages = (symbol: string) => {
    const container = getChatgptMessagesDiv(symbol);
    if (container) {
        container.innerHTML = '';
    }
};


export interface ChatGPTConfig {
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Default configuration
let config: ChatGPTConfig = {
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 1000,
};

/**
 * Analyze trade entry based on tradebook strategy (with streaming)
 * @param trade - Trade entry details
 * @param tradebook - Which tradebook strategy is being used
 * @returns Analysis and management suggestions
 */
export const analyzeTradeEntry = async (symbol: string, isLong: boolean, netQuantity: number): Promise<string> => {
    // Get tradebook text based on strategy
    let state = TradingState.getBreakoutTradeState(symbol, isLong);
    if (!state) {
        return "no trade state";
    }
    let tradebookId = state.submitEntryResult.tradeBookID;
    if (!tradebookId) {
        return "no tradebook id";
    }
    let tradebook = TradebooksManager.getTradebookByID(symbol, tradebookId);
    if (!tradebook) {
        return "no tradebook";
    }

    let tradebookText = tradebook.getTradebookDoc();
    if (!tradebookText) {
        return "no tradebook doc";
    }

    let googleDocContent = window.HybridApp.TradingData.googleDocContent;
    let { gradingList, detailedPlans, bestIdeas } = GoogleDocsApi.parseGoogleDoc(googleDocContent);
    let detailedPlan = detailedPlans.find(plan => plan.symbol === symbol);
    if (!detailedPlan) {
        return "no detailed plan";
    }

    let plan = TradingPlans.getTradingPlansForSingleDirection(symbol, isLong);
    let levelToAdd = plan.firstTargetToAdd;
    let direction = isLong ? 'long' : 'short';

    const systemPrompt = `You are a professional day trading assistant. 
    You will analyze live trades based on a specific trading strategy (tradebook) and provide actionable feedback.
    You will be asked each time a new 1-minute candle closes while I have an open position.

Here is the trading strategy being used:
${tradebookText}

${LevelToAdd.getText(isLong, levelToAdd)}

Here is my analysis and trading plans I prepared for stock ${symbol}:
${detailedPlan.notes}

Here is my predefined profit targets: 
${getProfitTargets(symbol, isLong)}

Your role:
1. Explain and provide insight to the current price action so far regarding to my tradebook. 
2. Suggest how to manage the position (targets, trailing stops, etc.) with reasoning.

Be concise and actionable. 

IMPORTANT: You must respond with a valid JSON object containing exactly two fields:
- "full answer": Just 1-2 sentences per bullet point. Start each point with a few key phrases. Keep this field less than 200 characters.
- "short answer": A very brief summary (4-5 words

Example format:
{
  "short_answer": "protect using vwap",
  "full_answer": "- [retracement to vwap]: currently price is retracing to vwap\n- [trade management]: Because this trade condition to fail is lost of vwap, so as long as price is holding above vwap, maintain long position and look for dip buys. Stop out if lose vwap."
  
}
short_answer goes before full_answer.

Return ONLY valid JSON, no other text before or after.

`;

    const userMessage = `I currently have a ${direction.toUpperCase()} position:
- Symbol: ${symbol}
- Entry Price: $${state.entryPrice}
- Stop Loss: $${state.stopLossPrice}
- Initial quantity: ${state.initialQuantity} shares
- Remaining quantity: ${Math.abs(netQuantity)} shares. Lower means I have taken some partial exits.
- Risk: $${Math.abs((state.entryPrice - state.stopLossPrice) * state.initialQuantity)}

Here is my trade executions so far:
${getTradeExecutions(symbol)}

Here is the current market data:
${getMarketDataText(symbol, isLong)}

Please provide brief trade and market analysis and actionable trade management suggestions with reasoning.`;

    // Initialize conversation for this trade
    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
    ];

    // Start streaming response in UI
    let div = startNewMessage(symbol, `🤖 ${symbol} - Trade Analysis`, false);
    if (div) {
        let fullResponse = '';
        try {
            await Chatgpt.streamChat(messages, (chunk) => {
                //appendToDiv(div, chunk);
                fullResponse += chunk;
                // Find substring after '"full answer": "' for fullResponse
                const fullAnswerMatch = fullResponse.match(/"full_answer":\s*"([^"]*)/);
                const fullAnswer = fullAnswerMatch ? fullAnswerMatch[1] : "";
                const shortAnswerMatch = fullResponse.match(/"short_answer":\s*"([^"]*)/);
                const shortAnswer = shortAnswerMatch ? shortAnswerMatch[1] : "";
                if (div) {
                    setTextToDiv(div.contentDiv, fullAnswer);
                    setTextToDiv(div.titleDiv, shortAnswer);
                }
                console.log(chunk);
            }, { response_format: { type: 'json_object' } }
            );
        } catch (error) {
            if (div) {
                appendToDiv(div.contentDiv, `Error: ${error}`);
            }
            console.error('ChatGPT streaming error:', error);
        }
        let fullAnswerObject = JSON.parse(fullResponse);
        if (fullAnswerObject.short_answer) {
            Helper.speak(fullAnswerObject.short_answer);
        }
        let toolTipText = fullAnswerObject.short_answer;
        toolTipText += MarketDataFeatures.getFeatures(symbol);
        Chart.showToolTips(symbol, toolTipText);

        // Store conversation for ongoing management
        messages.push({ role: 'assistant', content: fullResponse });
        tradeConversations.set(symbol, messages);
        if (div) {
            appendToDiv(div.contentDiv, ` Total chars: ${fullResponse.length}`);
        }

        console.log(`[ChatGPT] Trade Entry Analysis for ${symbol}:`);
        console.log(fullResponse);

        ProxyServer.saveAgentResponse(symbol, fullResponse);

        return fullResponse;
    }
    return "";
};

/**
 * Clear trade conversation when position is closed
 * @param symbol - Stock symbol
 */
export const clearTradeConversation = (symbol: string) => {
    tradeConversations.delete(symbol);
    console.log(`[ChatGPT] Cleared conversation for ${symbol}`);
};

/**
 * Test trade analysis flow
 */
export const testTradeAnalysis = async (symbol: string) => {
    if (!window.HybridApp.AccountCache) {
        return;
    }

    let position = Models.getPosition(symbol);
    if (!position || !position.netQuantity || position.netQuantity === 0) {
        return;
    }

    try {
        // Determine direction from net quantity (positive => long)
        const isLong = (position && position.netQuantity && position.netQuantity > 0) ? true : false;
        await analyzeTradeEntry(symbol, isLong, position.netQuantity);
    } catch (err) {
        console.error(`Error analyzing position ${symbol}:`, err);
    }

    /*
    
    // Clean up
    clearTradeConversation('AAPL');
    */
};

const candleToText = (candle: Models.CandlePlus, vwap: number | undefined) => {
    let timeString = TimeHelper.formatDateToHHMMSS(new Date(candle.datetime));
    let text = `T: ${timeString}, O: ${candle.open}, H: ${candle.high}, L: ${candle.low}, C: ${candle.close}, V: ${candle.volume}`;
    if (vwap) {
        text += `, vwap: ${vwap}`;
    }
    if (candle.ma5) {
        text += `, ma5: ${candle.ma5}`;
    }
    if (candle.ma9) {
        text += `, ma9: ${candle.ma9}`;
    }

    return `{${text}},`;
}
export const getMarketDataText = (symbol: string, isLong: boolean) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    let inflection = plan.analysis.singleMomentumKeyLevel[0].high;
    let openPrice = Models.getOpenPrice(symbol);
    let openVwap = Models.getLastVwapBeforeOpen(symbol);
    let symbolData = Models.getSymbolData(symbol);
    let closedCandles = Models.getM1ClosedCandlesSinceOpen(symbol);
    let currentCandle = Models.getCurrentCandle(symbol);
    let candles = Models.getCandlesFromM1SinceOpen(symbol);
    let m5Candles = Models.getCandlesFromM5SinceOpen(symbol);
    let m15Candles = Models.getCandlesFromM15SinceOpen(symbol);
    let currentCandleText = candleToText(currentCandle, Models.getCurrentVwap(symbol));
    let vwaps = Models.getVwapsSinceOpen(symbol);
    let candlesText = "";
    let minutes = Helper.getMinutesSinceMarketOpen(new Date());
    let hasTestedKeyLevel = (isLong && symbolData.lowOfDay <= inflection) ||
        (!isLong && symbolData.highOfDay >= inflection);
    let hasTestedVwap = false;
    for (let i = 0; i < closedCandles.length && i < vwaps.length; i++) {
        let candle = closedCandles[i];
        let vwap = vwaps[i];
        if ((isLong && candle.low <= vwap.value) || (!isLong && candle.high >= vwap.value)) {
            hasTestedVwap = true;
        }
        candlesText += candleToText(candle, vwap.value);
    }
    let currentPrice = Models.getCurrentPrice(symbol);
    let m5CandlesText = "";
    let m15CandlesText = "";
    if (minutes >= 5) {
        m5Candles = symbolData.m5Candles;
        for (let i = 0; i < m5Candles.length - 1; i++) {
            let candle = m5Candles[i];
            m5CandlesText += candleToText(candle, Models.getCurrentVwap(symbol));
        }
        if (minutes >= 15) {
            m15Candles = symbolData.m15Candles;
            for (let i = 0; i < m15Candles.length - 1; i++) {
                let candle = m15Candles[i];
                m15CandlesText += candleToText(candle, Models.getCurrentVwap(symbol));
            }
        }
    }
    let finalText = `
- Inflection level: ${inflection}.
- ATR: ${plan.atr.average}.
- Open Price: ${openPrice}.
- Market open time: ${TimeHelper.formatDateToHHMMSS(new Date(closedCandles[0].datetime))}.
- Current time: ${TimeHelper.formatDateToHHMMSS(new Date())}, ${minutes} minutes since market open.
- vwap at open: ${openVwap}.
- Premarket high: ${symbolData.premktHigh}, premarket low: ${symbolData.premktLow}.
- Intraday high: ${symbolData.highOfDay}, intraday low: ${symbolData.lowOfDay}.
- 1-minute closed candles since market open with time(T), volume(V), vwap, 5-period moving average (ma5), 9-period moving average (ma9): [${candlesText}].
- Current price: ${currentPrice}.
- Current 1-minute live candle that's not closed yet: ${currentCandleText}.
- Has the price tested the inflection level: ${hasTestedKeyLevel}.
- Has the price tested the vwap since open: ${hasTestedVwap}.
`;
    if (m5CandlesText) {
        finalText += `- 5-minute closed candles since open: [${m5CandlesText}].`;
    }
    if (m15CandlesText) {
        finalText += `- 15-minute closed candles since open: [${m15CandlesText}].`;
    }
    console.log("m5CandlesText: ");
    console.log(m15CandlesText);
    return finalText;
}

export const getProfitTargets = (symbol: string, isLong: boolean) => {
    let plan = TradingPlans.getTradingPlansForSingleDirection(symbol, isLong);
    let targets = plan.finalTargets;
    let targetText = "";
    for (let i = 0; i < targets.length; i++) {
        let target = targets[i];
        targetText += `${target.text} for ${target.partialCount}0%. `;
    }
    targetText += "The rest using default from tradebook.";
    return targetText;
}
export const testSimpleChat = async (symbol: string) => {
    console.log('Testing Simple Chat...');
    let div = startNewMessage(symbol, '🤖 Simple Chat - ' + symbol, false);
    if (!div) {
        console.log(`[ChatGPT] No div for ${symbol}`);
        return;
    }
    let messages: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'How to use vwap in day trading? Keep it within 100 words.' }
    ];
    let fullResponse = '';
    try {
        await Chatgpt.streamChat(messages, (chunk) => {
            if (div) {
                appendToDiv(div.contentDiv, chunk);
            }
            fullResponse += chunk;
        });
    } catch (error) {
        if (div) {
            appendToDiv(div.contentDiv, `Error: ${error}`);
        }
        console.error('ChatGPT streaming error:', error);
    }
    ProxyServer.saveAgentResponse(symbol, fullResponse);
}

export const getTradeExecutions = (symbol: string): string => {
    let executions = Models.getTradeExecutions(symbol);
    if (!executions || executions.length === 0) {
        return "";
    }
    let lastTrade = executions[executions.length - 1];
    let result = "";
    result += "entries (if more than one, the rest are adds or re-entry):";
    for (let i = 0; i < lastTrade.entries.length; i++) {
        let entry = lastTrade.entries[i];
        let action = entry.isBuy ? "buy" : "sell";
        let time = TimeHelper.formatDateToHHMMSS(entry.time);
        result += ` {action: ${action}, price: ${entry.roundedPrice}, time: ${time} quantity: ${entry.quantity}},`;
    }
    result += "partial exits:";
    for (let i = 0; i < lastTrade.exits.length; i++) {
        let exit = lastTrade.exits[i];
        let action = exit.isBuy ? "buy" : "sell";
        let time = TimeHelper.formatDateToHHMMSS(exit.time);
        result += ` {action: ${action}, price: ${exit.roundedPrice}, time: ${time} quantity: ${exit.quantity}},`;
    }
    return result;
}