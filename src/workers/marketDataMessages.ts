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

export interface ReplayCaptureConfig {
    recordingId: string;
    socketUrl: string;
    cutoverEpochMs: number;
    finalizeAtEpochMs: number;
    nextSequence: number;
    recordingStartedAtEpochMs: number;
}

export interface LiveMarketDataWorkerStartPayload {
    mode: 'live';
    symbols: string[];
    massive: { authParams: string };
    schwab?: SchwabWorkerConfig;
    capture?: ReplayCaptureConfig;
}

export interface ReplayMarketDataWorkerStartPayload {
    mode: 'replay';
    recordingId: string;
    socketUrl: string;
}

export type MarketDataWorkerStartPayload = LiveMarketDataWorkerStartPayload | ReplayMarketDataWorkerStartPayload;

export type MainToWorkerMessage =
    | { type: 'start'; payload: MarketDataWorkerStartPayload }
    | { type: 'stop' }
    | { type: 'replayControl'; command: 'play' | 'pause' | 'speed'; speed?: number };

export type WorkerToMainMessage =
    | { type: 'status'; source: string; status: string }
    | { type: 'timeSaleFlush'; source: TradeSource; trades: ParsedTrade[] }
    | { type: 'quote'; source: QuoteSource; quotes: Models.Quote[] }
    | { type: 'accountActivity'; contents: any[] }
    | { type: 'replayState'; status: string; speed?: number; marketTimeEpochMs?: number; deliveryLagMs?: number }
    | { type: 'error'; source: string; message: string };
