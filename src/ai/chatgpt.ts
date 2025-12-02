/**
 * ChatGPT API Integration
 * OpenAI API documentation: https://platform.openai.com/docs/api-reference/chat
 */

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

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
 * @param apiKey - OpenAI API key
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

