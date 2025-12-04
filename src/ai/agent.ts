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

/**
 * Add a new message block to the UI
 * @param title - Title/header for the message
 * @param isUser - Whether this is a user message
 */
const startNewMessage = (symbol: string, title: string, isUser: boolean = false): HTMLElement | null => {
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

    return contentDiv;
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

    let direction = isLong ? 'long' : 'short';

    const systemPrompt = `You are a professional day trading coach. You will analyze trades based on a specific trading strategy (tradebook) and provide actionable feedback.
    You will be asked each time a new 1-minute candle closes while I have an open position.

Here is the trading strategy being used:

${tradebookText}

Here is my analysis and trading plans for the stock I am trading for ${symbol}:
${detailedPlan.notes}

Here is my predefined profit targets: 
${getProfitTargets(symbol, isLong)}

Your role:
1. Comment on entry and partial exits
2. Explain and provide insight to the current price action so far regarding to my tradebook. 
3. Suggest how to manage the position (targets, trailing stops, etc.)

Be concise and actionable. Just 1-2 sentences per bullet point.`;

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

should I:
1. Hold the position?
2. Take partial profits?
3. Move stop loss?
4. Exit completely?

Please provide brief and actionable trade management suggestions.`;

    // Show user message in UI
    startNewMessage(symbol, `📈 ${symbol} Entry (${direction.toUpperCase()})`, true);

    // Initialize conversation for this trade
    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
    ];

    // Start streaming response in UI
    let div = startNewMessage(symbol, `🤖 Entry Analysis - ${symbol}`, false);

    let fullResponse = '';
    try {
        await Chatgpt.streamChat(messages, (chunk) => {
            appendToDiv(div, chunk);
            fullResponse += chunk;
        });
    } catch (error) {
        appendToDiv(div, `Error: ${error}`);
        console.error('ChatGPT streaming error:', error);
    }

    // Store conversation for ongoing management
    messages.push({ role: 'assistant', content: fullResponse });
    tradeConversations.set(symbol, messages);

    console.log(`[ChatGPT] Trade Entry Analysis for ${symbol}:`);
    console.log(fullResponse);

    return fullResponse;
};

/**
 * Get trade management advice on candle close (with streaming)
 * @param symbol - Stock symbol
 * @param candle - Newly closed candle data
 * @param currentPrice - Current price
 * @param unrealizedPnL - Current unrealized P&L
 * @returns Management advice
 */
export const analyzeOnCandleClose = async (
    symbol: string,
    candle: CandleData,
    currentPrice: number,
    unrealizedPnL: number
): Promise<string> => {

    // Get existing conversation or create new one
    let messages = tradeConversations.get(symbol);

    if (!messages) {
        console.log(`[ChatGPT] No active trade conversation for ${symbol}`);
        return '';
    }

    const candleAnalysis = `
1-Minute Candle Closed:
- Time: ${candle.time}
- Open: $${candle.open.toFixed(2)}
- High: $${candle.high.toFixed(2)}
- Low: $${candle.low.toFixed(2)}
- Close: $${candle.close.toFixed(2)}
- Volume: ${candle.volume.toLocaleString()}
${candle.vwap ? `- VWAP: $${candle.vwap.toFixed(2)}` : ''}

Current Status:
- Current Price: $${currentPrice.toFixed(2)}
- Unrealized P&L: $${unrealizedPnL.toFixed(2)}

Based on this candle and the current position, should I:
1. Hold the position?
2. Take partial profits?
3. Move stop loss?
4. Exit completely?

Please provide brief, actionable advice.`;

    // Show candle data in UI
    const pnlEmoji = unrealizedPnL >= 0 ? '🟢' : '🔴';
    let userDiv = startNewMessage(symbol, `🕐 ${symbol} Candle Close @ ${candle.time}`, true);
    appendToDiv(userDiv, `Close: $${candle.close.toFixed(2)} | P&L: ${pnlEmoji} $${unrealizedPnL.toFixed(2)}`);

    messages.push({ role: 'user', content: candleAnalysis });

    // Start streaming response in UI
    let div = startNewMessage(symbol, `🤖 Management Advice - ${symbol}`, false);

    let fullResponse = '';
    try {
        await Chatgpt.streamChat(messages, (chunk) => {
            appendToDiv(div, chunk);
            fullResponse += chunk;
        });
    } catch (error) {
        appendToDiv(div, `Error: ${error}`);
        console.error('ChatGPT streaming error:', error);
    }

    // Update conversation history
    messages.push({ role: 'assistant', content: fullResponse });
    tradeConversations.set(symbol, messages);

    console.log(`[ChatGPT] Candle Close Analysis for ${symbol}:`);
    console.log(fullResponse);

    return fullResponse;
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
    console.log('Testing Trade Analysis...');

    console.log('\n--- Entry Analysis ---');
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
    // Simulate candle close
    console.log('\n--- Candle Close Analysis ---');
    const candle: CandleData = {
        time: new Date().toLocaleTimeString(),
        open: 150.30,
        high: 150.75,
        low: 150.20,
        close: 150.60,
        volume: 125000,
        vwap: 150.15,
    };

    await analyzeOnCandleClose('AAPL', candle, 150.60, 35.00);

    // Clean up
    clearTradeConversation('AAPL');
    */
};

export const getMarketDataText = (symbol: string, isLong: boolean) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    let inflection = plan.analysis.singleMomentumKeyLevel[0].high;
    let openPrice = Models.getOpenPrice(symbol);
    let openVwap = Models.getLastVwapBeforeOpen(symbol);
    let symbolData = Models.getSymbolData(symbol);
    let candles = Models.getCandlesFromM1SinceOpen(symbol);
    let vwaps = Models.getVwapsSinceOpen(symbol);
    let candlesText = "";
    let minutes = Helper.getMinutesSinceMarketOpen(new Date());
    let hasTestedKeyLevel = (isLong && symbolData.lowOfDay <= inflection) ||
        (!isLong && symbolData.highOfDay >= inflection);
    let hasTestedVwap = false;
    for (let i = 0; i < candles.length && i < vwaps.length; i++) {
        let candle = candles[i];
        let vwap = vwaps[i];
        if ((isLong && candle.low <= vwap.value) || (!isLong && candle.high >= vwap.value)) {
            hasTestedVwap = true;
        }
        let timeString = TimeHelper.formatDateToHHMMSS(new Date(candle.datetime));
        candlesText += `{T: ${timeString}, O: ${candle.open}, H: ${candle.high}, L: ${candle.low}, C: ${candle.close}, V: ${candle.volume}, vwap: ${vwap.value}},`;
    }
    return `
- Inflection level: ${inflection}.
- ATR: ${plan.atr.average}.
- Open Price: ${openPrice}.
- Market open time: ${TimeHelper.formatDateToHHMMSS(new Date(candles[0].datetime))}.
- vwap at open: ${openVwap}.
- Premarket high: ${symbolData.premktHigh}, premarket low: ${symbolData.premktLow}.
- Intraday high: ${symbolData.highOfDay}, intraday low: ${symbolData.lowOfDay}.
- Current time: ${minutes} minutes since market open.
- 1-minute candles since open with time(T), volume(V) and vwap: [${candlesText}].
- Current price is the close price of the latest candle.
- Has the price tested the inflection level: ${hasTestedKeyLevel}.
- Has the price tested the vwap since open: ${hasTestedVwap}.
`;
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
    try {
        await Chatgpt.streamChat(messages, (chunk) => {
            appendToDiv(div, chunk);
        });
    } catch (error) {
        appendToDiv(div, `Error: ${error}`);
        console.error('ChatGPT streaming error:', error);
    }
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