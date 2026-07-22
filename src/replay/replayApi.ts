import type * as Models from '../models/models';
import type * as Messages from '../workers/marketDataMessages';
import * as Runtime from './runtime';

export interface ReplayManifest {
    schemaVersion: number;
    recordingId: string;
    marketDate: string;
    symbol: string;
    exchangeTimezone: string;
    cutoverEpochMs: number;
    marketOpenEpochMs: number;
    source: string;
    appVersion: string;
    createdAtEpochMs: number;
    captureStartedAtEpochMs: number;
    firstMarketEventEpochMs: number;
    lastMarketEventEpochMs: number;
    eventCount: number;
    tradeRecordCount: number;
    quoteEventCount: number;
    lastSequence: number;
    droppedCaptureBatchCount: number;
    bootstrapAvailable: boolean;
    status: 'recording' | 'complete' | 'incomplete' | 'corrupt';
    gaps: { expectedSequence: number; receivedSequence: number }[];
}

export interface ReplayRuntimeSnapshot {
    activeProfileName: string;
    tradingSettings: unknown;
    tradingPlanForSymbol: unknown;
    marketCapInMillions: number;
}

export interface ReplayBootstrap {
    symbol: string;
    marketDate: string;
    cutoverEpochMs: number;
    today1MinuteBars: Models.Candle[];
    dailyBars: Models.Candle[];
    premarketDollarCollection: Models.PremarketDollarCollection;
    sharesOutstanding: number;
    runtimeSnapshot: ReplayRuntimeSnapshot;
}

export interface StoredReplayEvent {
    sequence: number;
    arrivalOffsetMs: number;
    marketTimeEpochMs: number;
    message: Messages.WorkerToMainMessage;
}

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${Runtime.proxyBaseUrl}${path}`, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(body.error || `${response.status} ${response.statusText}`);
    }
    return body as T;
};

export const listRecordings = async () => {
    const response = await requestJson<{ recordings: ReplayManifest[] }>('/replay/recordings');
    return response.recordings;
};

export const createRecording = async (input: {
    marketDate: string;
    symbol: string;
    cutoverEpochMs: number;
    marketOpenEpochMs: number;
    appVersion: string;
    captureStartedAtEpochMs: number;
}) => {
    const controller = new AbortController();
    // Reusing a day can include a one-time merge of recordings made by older builds.
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
        return await requestJson<{ manifest: ReplayManifest; capturePath: string }>('/replay/recordings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...input, source: 'massive' }),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
};

export const uploadBootstrap = async (recordingId: string, bootstrap: ReplayBootstrap) => {
    return requestJson<{ manifest: ReplayManifest }>(`/replay/recordings/${encodeURIComponent(recordingId)}/bootstrap`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bootstrap),
    });
};

export const loadReplaySession = async (recordingId: string) => {
    const encodedId = encodeURIComponent(recordingId);
    const [manifestResponse, bootstrap] = await Promise.all([
        requestJson<{ manifest: ReplayManifest }>(`/replay/recordings/${encodedId}`),
        requestJson<ReplayBootstrap>(`/replay/recordings/${encodedId}/bootstrap`),
    ]);
    return { manifest: manifestResponse.manifest, bootstrap };
};

export const getCaptureWebSocketUrl = (capturePath: string) => Runtime.toWebSocketUrl(capturePath);

export const getPlaybackWebSocketUrl = (recordingId: string, speed = 1) => {
    const path = `/replay/recordings/${encodeURIComponent(recordingId)}/play?speed=${speed}`;
    return Runtime.toWebSocketUrl(path);
};
