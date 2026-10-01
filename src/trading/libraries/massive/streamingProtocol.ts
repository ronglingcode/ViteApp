import { mapWebSocketTrade, shouldFilterTrade } from './mapper.ts';
export const streamUrl = 'wss://socket.massive.com/stocks';
export const loginRequest = (key: string) => ({ action: 'auth', params: key });
export const subscribeRequest = (symbols: string[]) => ({ action: 'subscribe', params: symbols.map(symbol => `T.${symbol}`).join(',') });
export function parseStreamMessage(values: Record<string, any>[]) {
    let login: 'success' | 'failed' | undefined;
    const trades = [];
    for (const value of values) {
        if (value.ev === 'status' && value.status === 'auth_success') login = 'success';
        if (value.ev === 'status' && ['auth_failed', 'not_authorized'].includes(value.status)) login = 'failed';
        const trade = mapWebSocketTrade(value); if (trade && !shouldFilterTrade(trade)) trades.push(trade);
    }
    return { ...(login ? { login } : {}), trades };
}
