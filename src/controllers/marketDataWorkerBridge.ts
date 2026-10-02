import * as GlobalSettings from '../config/globalSettings';
import * as Models from '../models/models';
import * as DB from '../data/db';
import * as MassiveStreaming from '../api/massive/streaming';
import * as SchwabStreaming from '../api/schwab/streaming';
import * as StreamingHandler from './streamingHandler';
import type * as Messages from '../workers/marketDataMessages';
import { integrationHealth as health } from '../health/integrationHealth.ts';

let worker: Worker | null = null;
const buildSchwabConfig = (): Messages.SchwabWorkerConfig | undefined => {
    let socketUrl = SchwabStreaming.getStreamerSocketUrl();
    if (!socketUrl) {
        return undefined;
    }
    let subscribeLevelOne = DB.levelOneQuoteSource === DB.levelOneQuoteSourceSchwab;
    return {
        socketUrl,
        loginRequest: SchwabStreaming.createLoginRequest(),
        activitySubscribeRequest: SchwabStreaming.createActivitySubscribeRequest(),
        levelOneSubscribeRequest: subscribeLevelOne ? SchwabStreaming.createLevelOneSubscribeRequest() : null,
    };
};

const buildStartPayload = (): Messages.MarketDataWorkerStartPayload => {
    return {
        symbols: Models.getWatchlist().map(item => item.symbol),
        massive: {
            authParams: MassiveStreaming.createLoginRequest().params,
        },
        schwab: buildSchwabConfig(),
    };
};

const handleWorkerMessage = (message: Messages.WorkerToMainMessage) => {
    if (message.type === 'massiveHealth') {
        // Preserve the error explanation if an error is followed by socket close.
        if (message.phase === 'disconnected' && health.stream.phase === 'failed') return;
        health.streamPhase(message.phase, message.error);
        return;
    }
    if (message.type === 'timeSaleFlush') {
        health.receiveTrades(message.trades.map(({ record }) => ({
            symbol: record.symbol, timestamp: record.tradeTime ?? record.timestamp,
            receivedAt: record.receivedTime.getTime(),
        })));
        StreamingHandler.applyWorkerTimeSaleFlush(message.trades, message.source);
        return;
    }
    if (message.type === 'quote') {
        for (let quote of message.quotes) {
            SchwabStreaming.applyLevelOneQuote(quote);
        }
        return;
    }
    if (message.type === 'accountActivity') {
        SchwabStreaming.handleAccountActivity(message.contents);
        return;
    }
    if (message.type === 'status') {
        console.log(`[market worker] ${message.source}: ${message.status}`);
        return;
    }
    if (message.type === 'error') {
        console.error(`[market worker] ${message.source}: ${message.message}`);
    }
};

export const stopMarketDataWorker = () => {
    if (!worker) {
        return;
    }
    worker.postMessage({ type: 'stop' } satisfies Messages.MainToWorkerMessage);
    const workerToTerminate = worker;
    setTimeout(() => workerToTerminate.terminate(), 200);
    worker = null;
    health.streamPhase('disconnected');
};

const startWorker = (payload: Messages.MarketDataWorkerStartPayload) => {
    stopMarketDataWorker();
    worker = new Worker(new URL('../workers/marketDataWorker.ts', import.meta.url), { type: 'module' });
    const currentWorker = worker;
    health.startStream(payload.symbols);
    worker.addEventListener('message', (event: MessageEvent<Messages.WorkerToMainMessage>) => {
        if (currentWorker !== worker) return;
        handleWorkerMessage(event.data);
    });
    worker.addEventListener('error', () => {
        if (currentWorker === worker) health.streamPhase('failed', 'Market-data worker failed');
    });
    worker.addEventListener('messageerror', () => {
        if (currentWorker === worker) health.streamPhase('failed', 'Market-data worker message could not be read');
    });
    worker.postMessage({ type: 'start', payload } satisfies Messages.MainToWorkerMessage);
};

export const startMarketDataWorker = () => {
    if (!GlobalSettings.useMarketDataWorker) {
        return;
    }
    startWorker(buildStartPayload());
};

export const registerMarketDataWorkerLifecycle = () => {
    window.addEventListener('beforeunload', () => stopMarketDataWorker());
};
