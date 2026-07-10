import * as GlobalSettings from '../config/globalSettings';
import * as Models from '../models/models';
import * as DB from '../data/db';
import * as MassiveStreaming from '../api/massive/streaming';
import * as SchwabStreaming from '../api/schwab/streaming';
import * as StreamingHandler from './streamingHandler';
import type * as Messages from '../workers/marketDataMessages';

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
    if (message.type === 'timeSaleFlush') {
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
    worker.terminate();
    worker = null;
};

export const startMarketDataWorker = () => {
    if (!GlobalSettings.useMarketDataWorker) {
        return;
    }
    stopMarketDataWorker();
    worker = new Worker(new URL('../workers/marketDataWorker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<Messages.WorkerToMainMessage>) => {
        handleWorkerMessage(event.data);
    });
    worker.postMessage({
        type: 'start',
        payload: buildStartPayload(),
    } satisfies Messages.MainToWorkerMessage);
};

export const registerMarketDataWorkerLifecycle = () => {
    window.addEventListener('beforeunload', () => stopMarketDataWorker());
};
