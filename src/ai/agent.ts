/**
 * ChatGPT API Integration
 * OpenAI API documentation: https://platform.openai.com/docs/api-reference/chat
 */

import { tradebookText as vwapContinuationText } from '../tradebooksText/vwapContinuation';
import * as Secrets from '../config/secret';
import * as Chatgpt from './chatgpt';
import * as TradingState from '../models/tradingState';
import * as TradebooksManager from '../tradebooks/tradebooksManager';


export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface TradeEntry {
    symbol: string;
    direction: 'long' | 'short';
    entryPrice: number;
    stopLoss: number;
    quantity: number;
    entryTime: string;
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

// UI Elements
let chatgptMessagesDiv: HTMLElement | null = null;
let currentMessageDiv: HTMLElement | null = null;

/**
 * Get or cache the chatgptMessages div
 */
const getChatgptMessagesDiv = (): HTMLElement | null => {
    if (!chatgptMessagesDiv) {
        chatgptMessagesDiv = document.getElementById('chatgptMessages');
    }
    return chatgptMessagesDiv;
};

/**
 * Add a new message block to the UI
 * @param title - Title/header for the message
 * @param isUser - Whether this is a user message
 */
const startNewMessage = (title: string, isUser: boolean = false): HTMLElement | null => {
    const container = getChatgptMessagesDiv();
    if (!container) return null;

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

    currentMessageDiv = contentDiv;
    return contentDiv;
};

/**
 * Append text chunk to current message (for streaming)
 */
const appendToCurrentMessage = (chunk: string) => {
    if (currentMessageDiv) {
        currentMessageDiv.textContent += chunk;
        // Auto-scroll to show latest
        currentMessageDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
};

/**
 * Clear all messages from the UI
 */
export const clearMessages = () => {
    const container = getChatgptMessagesDiv();
    if (container) {
        container.innerHTML = '';
    }
};

export interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
}

export interface ChatCompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        message: ChatMessage;
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

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
export const analyzeTradeEntry = async (symbol: string, isLong: boolean): Promise<string> => {
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

    let direction = isLong ? 'long' : 'short';

    const systemPrompt = `You are a professional day trading coach. You will analyze trades based on a specific trading strategy (tradebook) and provide actionable feedback.

Here is the trading strategy being used:

${tradebookText}

Your role:
1. Comment on whether the entry aligns with the tradebook rules
2. Identify any concerns or risks
3. Suggest how to manage the position (targets, trailing stops, etc.)
4. Be concise and actionable. Keep the response in 1-5 bullet points.`;

    const userMessage = `I just entered a ${direction.toUpperCase()} position:
- Symbol: ${symbol}
- Entry Price: $${state.entryPrice}
- Stop Loss: $${state.stopLossPrice}
- Quantity: ${state.initialQuantity} shares
- Risk: $${Math.abs((state.entryPrice - state.stopLossPrice) * state.initialQuantity).toFixed(2)}

Please analyze this entry and provide management suggestions.`;

    // Show user message in UI
    startNewMessage(`📈 ${symbol} Entry (${direction.toUpperCase()})`, true);

    // Initialize conversation for this trade
    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
    ];

    // Start streaming response in UI
    startNewMessage(`🤖 Entry Analysis - ${symbol}`, false);

    let fullResponse = '';
    try {
        await Chatgpt.streamChat(messages, (chunk) => {
            appendToCurrentMessage(chunk);
            fullResponse += chunk;
        });
    } catch (error) {
        appendToCurrentMessage(`Error: ${error}`);
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
    startNewMessage(`🕐 ${symbol} Candle Close @ ${candle.time}`, true);
    appendToCurrentMessage(`Close: $${candle.close.toFixed(2)} | P&L: ${pnlEmoji} $${unrealizedPnL.toFixed(2)}`);

    messages.push({ role: 'user', content: candleAnalysis });

    // Start streaming response in UI
    startNewMessage(`🤖 Management Advice - ${symbol}`, false);

    let fullResponse = '';
    try {
        await Chatgpt.streamChat(messages, (chunk) => {
            appendToCurrentMessage(chunk);
            fullResponse += chunk;
        });
    } catch (error) {
        appendToCurrentMessage(`Error: ${error}`);
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
export const testTradeAnalysis = async () => {
    console.log('Testing Trade Analysis...');

    console.log('\n--- Entry Analysis ---');
    await analyzeTradeEntry('MDB', true);
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

