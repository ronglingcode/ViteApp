import type * as Models from '../models/models';

/** Trade source: 'm' = massive (matches DB.tryUpdateMaxTimeSaleTimestamp). */
export type TradeSource = 'm';

/** Quote source: 's' = schwab. */
export type QuoteSource = 's';

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
    massive: { authParams: string };
    schwab?: SchwabWorkerConfig;
    useMassiveTradeStream: boolean;
}

export type MainToWorkerMessage =
    | { type: 'start'; payload: MarketDataWorkerStartPayload }
    | { type: 'stop' };

export type WorkerToMainMessage =
    | { type: 'status'; source: string; status: string }
    | { type: 'timeSaleFlush'; source: TradeSource; trades: ParsedTrade[] }
    | { type: 'quote'; source: QuoteSource; quotes: Models.Quote[] }
    | { type: 'accountActivity'; contents: any[] }
    | { type: 'error'; source: string; message: string };
