/**
 * ChatGPT API Integration
 * OpenAI API documentation: https://platform.openai.com/docs/api-reference/chat
 */

import { tradebookText as vwapContinuationText } from '../tradebooksText/vwapContinuation';

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
const tradeConversations: Map<string, ChatMessage[]> = new Map();

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
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Default configuration
let config: ChatGPTConfig = {
    apiKey: '',
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 1000,
};

/**
 * Initialize ChatGPT with API key and optional settings
 */
export const initialize = (apiKey: string, options?: Partial<ChatGPTConfig>) => {
    config = {
        ...config,
        apiKey,
        ...options,
    };
};

/**
 * Send a chat completion request to OpenAI
 * @param messages - Array of chat messages
 * @param options - Optional request parameters
 * @returns ChatCompletionResponse
 */
export const chat = async (
    messages: ChatMessage[],
    options?: Partial<ChatCompletionRequest>
): Promise<ChatCompletionResponse> => {
    if (!config.apiKey) {
        throw new Error('ChatGPT API key not configured. Call initialize() first.');
    }

    const requestBody: ChatCompletionRequest = {
        model: options?.model ?? config.model ?? 'gpt-4o',
        messages: messages,
        temperature: options?.temperature ?? config.temperature,
        max_tokens: options?.max_tokens ?? config.maxTokens,
        ...options,
    };

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`ChatGPT API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    return await response.json();
};

/**
 * Simple helper for single-turn conversations
 * @param prompt - User prompt
 * @param systemPrompt - Optional system prompt
 * @returns Assistant's response text
 */
export const ask = async (prompt: string, systemPrompt?: string): Promise<string> => {
    const messages: ChatMessage[] = [];
    
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await chat(messages);
    return response.choices[0]?.message?.content ?? '';
};

/**
 * Chat with trading analysis context
 * @param prompt - User question about trading
 * @returns Analysis response
 */
export const analyzeTrade = async (prompt: string): Promise<string> => {
    const systemPrompt = `You are a professional day trader assistant specializing in:
- Technical analysis (support/resistance, VWAP, key levels)
- Price action and candlestick patterns
- Risk management and position sizing
- Market microstructure and order flow
Be concise, specific, and actionable in your responses.`;

    return await ask(prompt, systemPrompt);
};

/**
 * Stream chat completion (for real-time responses)
 * @param messages - Array of chat messages
 * @param onChunk - Callback for each streamed chunk
 * @param options - Optional request parameters
 */
export const streamChat = async (
    messages: ChatMessage[],
    onChunk: (content: string) => void,
    options?: Partial<ChatCompletionRequest>
): Promise<void> => {
    if (!config.apiKey) {
        throw new Error('ChatGPT API key not configured. Call initialize() first.');
    }

    const requestBody = {
        model: options?.model ?? config.model ?? 'gpt-4o',
        messages: messages,
        temperature: options?.temperature ?? config.temperature,
        max_tokens: options?.max_tokens ?? config.maxTokens,
        stream: true,
        ...options,
    };

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`ChatGPT API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                    return;
                }
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                        onChunk(content);
                    }
                } catch {
                    // Skip invalid JSON
                }
            }
        }
    }
};

/**
 * Get available models
 */
export const MODELS = {
    GPT4O: 'gpt-4o',
    GPT4O_MINI: 'gpt-4o-mini',
    GPT4_TURBO: 'gpt-4-turbo',
    GPT35_TURBO: 'gpt-3.5-turbo',
} as const;

export const apiKey = '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';

/**
 * Simple test function to verify ChatGPT integration
 */
export const test = async () => {
    console.log('Testing ChatGPT API...');
    
    initialize(apiKey);
    
    try {
        let answer = await ask('What is VWAP in trading?');
        console.log('Question: What is VWAP in trading?');
        console.log('Answer:', answer);
    } catch (error) {
        console.error('ChatGPT test failed:', error);
    }
};

/**
 * Analyze trade entry based on tradebook strategy
 * @param trade - Trade entry details
 * @param tradebook - Which tradebook strategy is being used
 * @returns Analysis and management suggestions
 */
export const analyzeTradeEntry = async (trade: TradeEntry, tradebook: string = 'vwapContinuation'): Promise<string> => {
    initialize(apiKey);
    
    // Get tradebook text based on strategy
    let tradebookText = '';
    if (tradebook === 'vwapContinuation') {
        tradebookText = vwapContinuationText;
    }
    
    const systemPrompt = `You are a professional day trading coach. You will analyze trades based on a specific trading strategy (tradebook) and provide actionable feedback.

Here is the trading strategy being used:

${tradebookText}

Your role:
1. Comment on whether the entry aligns with the tradebook rules
2. Identify any concerns or risks
3. Suggest how to manage the position (targets, trailing stops, etc.)
4. Be concise and actionable`;

    const userMessage = `I just entered a ${trade.direction.toUpperCase()} position:
- Symbol: ${trade.symbol}
- Entry Price: $${trade.entryPrice}
- Stop Loss: $${trade.stopLoss}
- Quantity: ${trade.quantity} shares
- Entry Time: ${trade.entryTime}
- Risk: $${Math.abs((trade.entryPrice - trade.stopLoss) * trade.quantity).toFixed(2)}

Please analyze this entry and provide management suggestions.`;

    // Initialize conversation for this trade
    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
    ];
    
    const response = await chat(messages);
    const assistantMessage = response.choices[0]?.message?.content ?? '';
    
    // Store conversation for ongoing management
    messages.push({ role: 'assistant', content: assistantMessage });
    tradeConversations.set(trade.symbol, messages);
    
    console.log(`[ChatGPT] Trade Entry Analysis for ${trade.symbol}:`);
    console.log(assistantMessage);
    
    return assistantMessage;
};

/**
 * Get trade management advice on candle close
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
    initialize(apiKey);
    
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

    messages.push({ role: 'user', content: candleAnalysis });
    
    const response = await chat(messages);
    const assistantMessage = response.choices[0]?.message?.content ?? '';
    
    // Update conversation history
    messages.push({ role: 'assistant', content: assistantMessage });
    tradeConversations.set(symbol, messages);
    
    console.log(`[ChatGPT] Candle Close Analysis for ${symbol}:`);
    console.log(assistantMessage);
    
    return assistantMessage;
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
    
    // Simulate entering a long position
    const trade: TradeEntry = {
        symbol: 'AAPL',
        direction: 'long',
        entryPrice: 150.25,
        stopLoss: 149.50,
        quantity: 100,
        entryTime: new Date().toLocaleTimeString(),
    };
    
    console.log('\n--- Entry Analysis ---');
    await analyzeTradeEntry(trade, 'vwapContinuation');
    
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
};

