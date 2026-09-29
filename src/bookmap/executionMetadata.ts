/** Runtime-only broker/quote provenance. Never infer freshness from a WebSocket send time. */
let token: { accessToken: string; expiresAt: number; generation: number } | undefined;
let observation: { accountHash: string; startedAt: number; revision: number } | undefined;
const quotes = new Map<string, { bidAt: number; askAt: number }>();

export const recordExecutionToken = (accessToken: string, expiresInSeconds: number) => {
    if (!accessToken || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
        throw new Error('Invalid Schwab token response');
    }
    token = { accessToken, expiresAt: Date.now() + expiresInSeconds * 1000,
        generation: Math.max(Date.now(), (token?.generation ?? 0) + 1) };
    window.dispatchEvent(new Event('tradingscripts:execution-token-updated'));
};
export const getExecutionToken = () => token;
export const recordBrokerObservation = (accountHash: string, startedAt: number) => {
    // Concurrent account reads completing out of order must not make older data look current.
    if (observation && observation.accountHash === accountHash && startedAt < observation.startedAt) return;
    observation = { accountHash, startedAt, revision: (observation?.revision ?? 0) + 1 };
    window.dispatchEvent(new Event('tradingscripts:execution-account-observed'));
};
export const getBrokerObservation = () => observation;
export const canApplyBrokerObservation = (accountHash: string, startedAt: number) =>
    !observation || observation.accountHash !== accountHash || startedAt >= observation.startedAt;
export const recordExecutionQuote = (symbol: string, bid: boolean, ask: boolean, observedAt = Date.now()) => {
    if (!Number.isFinite(observedAt) || observedAt <= 0) return;
    const previous = quotes.get(symbol) ?? { bidAt: 0, askAt: 0 };
    quotes.set(symbol, { bidAt: bid ? Math.max(observedAt, previous.bidAt) : previous.bidAt,
        askAt: ask ? Math.max(observedAt, previous.askAt) : previous.askAt });
};
export const getExecutionQuoteTime = (symbol: string) => {
    const quote = quotes.get(symbol);
    return quote ? Math.min(quote.bidAt, quote.askAt) : 0;
};
