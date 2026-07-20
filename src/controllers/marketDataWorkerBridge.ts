import * as GlobalSettings from '../config/globalSettings';
import * as Models from '../models/models';
import * as DB from '../data/db';
import * as MassiveStreaming from '../api/massive/streaming';
import * as SchwabStreaming from '../api/schwab/streaming';
import * as StreamingHandler from './streamingHandler';
import type * as Messages from '../workers/marketDataMessages';
import * as ReplayApi from '../replay/replayApi';
import * as TimeHelper from '../utils/timeHelper';
import * as Runtime from '../replay/runtime';
import * as ReplayMetrics from '../replay/replayMetrics';

let worker: Worker | null = null;
let lastReplayStateUiAt = 0;

const showCaptureStatus = (text: string, isError = false) => {
    let status = document.getElementById('replayCaptureStatus');
    if (!status) {
        status = document.createElement('span');
        status.id = 'replayCaptureStatus';
        document.getElementById('network')?.insertAdjacentElement('afterend', status);
    }
    status.textContent = ` | replay capture: ${text}`;
    status.style.color = isError ? 'red' : '';
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

const buildStartPayload = (capture?: Messages.ReplayCaptureConfig): Messages.LiveMarketDataWorkerStartPayload => {
    return {
        mode: 'live',
        symbols: Models.getWatchlist().map(item => item.symbol),
        massive: {
            authParams: MassiveStreaming.createLoginRequest().params,
        },
        schwab: buildSchwabConfig(),
        capture,
    };
};

const handleWorkerMessage = (message: Messages.WorkerToMainMessage) => {
    const applyStartedAt = performance.now();
    if (message.type === 'timeSaleFlush') {
        StreamingHandler.applyWorkerTimeSaleFlush(message.trades, message.source);
        if (Runtime.isReplayMode()) ReplayMetrics.recordMessage(message, performance.now() - applyStartedAt);
        return;
    }
    if (message.type === 'quote') {
        for (let quote of message.quotes) {
            SchwabStreaming.applyLevelOneQuote(quote);
        }
        if (Runtime.isReplayMode()) ReplayMetrics.recordMessage(message, performance.now() - applyStartedAt);
        return;
    }
    if (message.type === 'accountActivity') {
        SchwabStreaming.handleAccountActivity(message.contents);
        return;
    }
    if (message.type === 'replayState') {
        if (message.marketTimeEpochMs) {
            TimeHelper.setCurrentMarketTime(new Date(message.marketTimeEpochMs));
        }
        const now = performance.now();
        if (!message.marketTimeEpochMs || now - lastReplayStateUiAt >= 250) {
            lastReplayStateUiAt = now;
            window.dispatchEvent(new CustomEvent('tradingscripts:replay-state', { detail: message }));
        }
        ReplayMetrics.recordState(message);
        return;
    }
    if (message.type === 'status') {
        console.log(`[market worker] ${message.source}: ${message.status}`);
        if (message.source === 'replay-capture') showCaptureStatus(message.status);
        return;
    }
    if (message.type === 'error') {
        console.error(`[market worker] ${message.source}: ${message.message}`);
        if (message.source === 'replay-capture') showCaptureStatus(message.message, true);
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
};

const startWorker = (payload: Messages.MarketDataWorkerStartPayload) => {
    stopMarketDataWorker();
    worker = new Worker(new URL('../workers/marketDataWorker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<Messages.WorkerToMainMessage>) => {
        handleWorkerMessage(event.data);
    });
    worker.postMessage({ type: 'start', payload } satisfies Messages.MainToWorkerMessage);
};

export const startMarketDataWorker = (capture?: Messages.ReplayCaptureConfig) => {
    if (!GlobalSettings.useMarketDataWorker) {
        return;
    }
    startWorker(buildStartPayload(capture));
};

export const startReplayMarketDataWorker = (recordingId: string) => {
    ReplayMetrics.start();
    startWorker({
        mode: 'replay',
        recordingId,
        socketUrl: ReplayApi.getPlaybackWebSocketUrl(recordingId),
    });
};

export const sendReplayControl = (command: 'play' | 'pause' | 'speed', speed?: number) => {
    worker?.postMessage({ type: 'replayControl', command, speed } satisfies Messages.MainToWorkerMessage);
};

export const registerMarketDataWorkerLifecycle = () => {
    window.addEventListener('beforeunload', () => stopMarketDataWorker());
};
