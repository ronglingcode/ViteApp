/**
 * ChatGPT API Integration
 * OpenAI API documentation: https://platform.openai.com/docs/api-reference/chat
 */

import { tradebookText as vwapContinuationText } from '../tradebooksText/vwapContinuation';
import * as Secrets from '../config/secret';

const getApiKey = (): string => {
    const secrets = Secrets.openai();
    return secrets.apiKey || '';
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
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
 * Initialize ChatGPT with API key and optional settings
 */
export const initialize = (options?: Partial<ChatGPTConfig>) => {
    config = {
        ...config,
        ...options,
    };
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
    let apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('ChatGPT API key not configured. Call initialize() first.');
    }
    initialize();

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
            'Authorization': `Bearer ${apiKey}`,
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
