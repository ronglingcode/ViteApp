import * as Secret from '../config/secret';
import * as GlobalSettings from '../config/globalSettings';
import * as Models from '../models/models';
import * as Helper from '../utils/helper';
import * as DB from '../data/db';
import * as AlpacaStreaming from '../api/alpaca/streaming';
import * as MassiveStreaming from '../api/massive/streaming';
import * as SchwabStreaming from '../api/schwab/streaming';
import * as StreamingHandler from './streamingHandler';
import type * as Messages from '../workers/marketDataMessages';

let worker: Worker | null = null;

const shouldCompete = () => StreamingHandler.shouldCompeteForTimeAndSales();

const getAlpacaTradeCleanupDelayMs = (): number => {
    if (GlobalSettings.marketDataSource === 'alpaca') {
        return -1;
    }
    let secondsSinceMarketOpen = Helper.getSecondsSinceMarketOpen(new Date());
    let secondsUntilCleanup = GlobalSettings.competeForTimeAndSalesWindowSeconds - secondsSinceMarketOpen;
    return Math.max(0, secondsUntilCleanup) * 1000;
};

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
    let alpacaSecrets = Secret.alpaca();
    let competing = shouldCompete();
    return {
        symbols: Models.getWatchlist().map(item => item.symbol),
        alpaca: {
            apiKey: alpacaSecrets.apiKey,
            apiSecret: alpacaSecrets.apiSecret,
        },
        massive: {
            authParams: MassiveStreaming.createLoginRequest().params,
        },
        schwab: buildSchwabConfig(),
        useAlpacaTradeStream: GlobalSettings.marketDataSource === 'alpaca' || competing,
        useAlpacaQuoteStream: DB.levelOneQuoteSource === DB.levelOneQuoteSourceAlpaca,
        useMassiveTradeStream: GlobalSettings.marketDataSource === 'massive' || competing,
        alpacaTradeCleanupDelayMs: getAlpacaTradeCleanupDelayMs(),
    };
};

const handleWorkerMessage = (message: Messages.WorkerToMainMessage) => {
    if (message.type === 'timeSale') {
        for (let trade of message.trades) {
            StreamingHandler.applyWorkerTimeSale(trade.record, trade.shouldFilter, message.source);
        }
        return;
    }
    if (message.type === 'quote') {
        let apply = message.source === 's' ? SchwabStreaming.applyLevelOneQuote : AlpacaStreaming.applyLevelOneQuote;
        for (let quote of message.quotes) {
            apply(quote);
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
