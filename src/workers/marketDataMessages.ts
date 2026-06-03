import type * as Models from '../models/models';

/** Trade source: 'a' = alpaca, 'm' = massive (matches DB.tryUpdateMaxTimeSaleTimestamp). */
export type TradeSource = 'a' | 'm';

/** Quote source: 'a' = alpaca, 's' = schwab. */
export type QuoteSource = 'a' | 's';

export interface ParsedTrade {
    record: Models.TimeSale;
    shouldFilter: boolean;
}

/**
 * Pre-built Schwab requests + socket URL, assembled on the main thread (the worker has no
 * access to window.HybridApp.Secrets). The worker just sends them at the right time.
 */
export interface SchwabWorkerConfig {
    socketUrl: string;
    loginRequest: unknown;
    activitySubscribeRequest: unknown;
    /** null when schwab is not the active level-one quote source. */
    levelOneSubscribeRequest: unknown | null;
}

export interface MarketDataWorkerStartPayload {
    symbols: string[];
    alpaca: { apiKey: string; apiSecret: string };
    massive: { authParams: string };
    schwab?: SchwabWorkerConfig;
    useAlpacaTradeStream: boolean;
    useAlpacaQuoteStream: boolean;
    useMassiveTradeStream: boolean;
    /** ms after which the worker unsubscribes alpaca trades; <0 means never. */
    alpacaTradeCleanupDelayMs: number;
}

export type MainToWorkerMessage =
    | { type: 'start'; payload: MarketDataWorkerStartPayload }
    | { type: 'stop' };

export type WorkerToMainMessage =
    | { type: 'status'; source: string; status: string }
    | { type: 'timeSale'; source: TradeSource; trades: ParsedTrade[] }
    | { type: 'quote'; source: QuoteSource; quotes: Models.Quote[] }
    | { type: 'accountActivity'; contents: any[] }
    | { type: 'error'; source: string; message: string };
