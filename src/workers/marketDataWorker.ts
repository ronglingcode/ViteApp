import * as LevelOneQuoteParse from '../streaming/levelOneQuoteParse';
import * as TimeSaleParse from '../streaming/timeSaleParse';
import * as TradeFlushBuffer from './tradeFlushBuffer';
import type * as Messages from './marketDataMessages';

const MASSIVE_URL = 'wss://socket.massive.com/stocks';
const CAPTURE_SEND_INTERVAL_MS = 1000;
const MAX_CAPTURE_EVENTS = 5000;
const MAX_CAPTURE_SOCKET_BUFFER = 4 * 1024 * 1024;

type PostToMain = (message: Messages.WorkerToMainMessage) => void;

class MarketDataStreamManager {
    private massiveSocket: WebSocket | null = null;
    private schwabSocket: WebSocket | null = null;
    private symbols: string[] = [];

    constructor(
        private readonly post: PostToMain,
        private readonly tradeBuffer: TradeFlushBuffer.TradeFlushBuffer,
    ) { }

    stop() {
        this.tradeBuffer.stop();
        this.massiveSocket?.close();
        this.schwabSocket?.close();
        this.massiveSocket = null;
        this.schwabSocket = null;
        this.symbols = [];
    }

    start(payload: Messages.LiveMarketDataWorkerStartPayload) {
        this.stop();
        this.symbols = payload.symbols;
        this.post({ type: 'status', source: 'worker', status: `starting ${payload.symbols.length} symbols` });
        this.connectMassive(payload);
        if (payload.schwab) {
            this.connectSchwab(payload.schwab);
        }
        this.tradeBuffer.start();
    }

    private enqueueTrades(trades: Messages.ParsedTrade[], source: Messages.TradeSource) {
        trades.forEach(trade => this.tradeBuffer.push(trade, source));
    }

    private connectMassive(payload: Messages.LiveMarketDataWorkerStartPayload) {
        let socket = new WebSocket(MASSIVE_URL);
        this.massiveSocket = socket;
        socket.onopen = () => {
            this.send(socket, { action: 'auth', params: payload.massive.authParams });
        };
        socket.onmessage = (messageEvent) => {
            let messageData = JSON.parse(String(messageEvent.data));
            if (!Array.isArray(messageData)) {
                return;
            }
            let trades: Messages.ParsedTrade[] = [];
            messageData.forEach((message: any) => {
                if (message.ev === 'status') {
                    if (message.status === 'auth_success') {
                        let params = payload.symbols.map(symbol => `T.${symbol}`).join(',');
                        this.send(socket, { action: 'subscribe', params });
                    }
                } else if (message.ev === 'T') {
                    trades.push(TimeSaleParse.createMassiveTimeSale(message));
                }
            });
            if (trades.length > 0) {
                this.enqueueTrades(trades, 'm');
            }
        };
        socket.onerror = () => this.post({ type: 'error', source: 'massive', message: 'socket error' });
    }

    private connectSchwab(config: Messages.SchwabWorkerConfig) {
        let socket = new WebSocket(config.socketUrl);
        this.schwabSocket = socket;
        socket.onopen = () => {
            this.send(socket, config.loginRequest);
        };
        socket.onmessage = (messageEvent) => {
            let messageData = JSON.parse(String(messageEvent.data));
            if (!messageData || messageData.notify) {
                return;
            }
            if (messageData.response) {
                messageData.response.forEach((res: any) => {
                    if (res.service === 'ADMIN' && res.command === 'LOGIN') {
                        if (config.levelOneSubscribeRequest) {
                            this.send(socket, config.levelOneSubscribeRequest);
                        }
                        this.send(socket, config.activitySubscribeRequest);
                    }
                });
                return;
            }
            if (messageData.data) {
                let quotes: import('../models/models').Quote[] = [];
                messageData.data.forEach((element: any) => {
                    if (element.service === 'LEVELONE_EQUITIES' && element.command === 'SUBS') {
                        (element.content ?? []).forEach((c: any) => {
                            quotes.push(LevelOneQuoteParse.createSchwabLevelOneQuote(c));
                        });
                    } else if (element.service === 'ACCT_ACTIVITY' && element.command === 'SUBS') {
                        this.post({ type: 'accountActivity', contents: element.content ?? [] });
                    }
                });
                if (quotes.length > 0) {
                    this.post({ type: 'quote', source: 's', quotes });
                }
            }
        };
        socket.onerror = () => this.post({ type: 'error', source: 'schwab', message: 'socket error' });
    }

    private send(socket: WebSocket, request: unknown) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(request));
        }
    }
}

interface StoredCaptureEvent {
    sequence: number;
    arrivalOffsetMs: number;
    marketTimeEpochMs: number;
    message: Messages.WorkerToMainMessage;
}

class ReplayCaptureSink {
    private socket: WebSocket | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private finalizeTimer: ReturnType<typeof setTimeout> | null = null;
    private finalizeRetryTimer: ReturnType<typeof setTimeout> | null = null;
    private pending: StoredCaptureEvent[] = [];
    private sequence = 0;
    private droppedCaptureBatchCount = 0;
    private finalizeRequested = false;
    private finalizeSent = false;
    private finalized = false;
    private stopped = false;
    private readonly startedAt = performance.now();

    constructor(
        private readonly config: Messages.ReplayCaptureConfig,
        private readonly postStatus: PostToMain,
    ) { }

    start() {
        this.socket = new WebSocket(this.config.socketUrl);
        this.socket.onopen = () => {
            this.postStatus({ type: 'status', source: 'replay-capture', status: `recording ${this.config.recordingId}` });
            if (this.finalizeRequested) {
                this.finishRecording();
            } else {
                this.flush();
            }
        };
        this.socket.onmessage = event => {
            const message = JSON.parse(String(event.data));
            if (message.type === 'captureFinalized') {
                this.finalized = true;
                this.postStatus({ type: 'status', source: 'replay-capture', status: `saved ${this.config.recordingId}` });
                this.socket?.close();
            } else if (message.type === 'captureError') {
                this.postStatus({ type: 'error', source: 'replay-capture', message: message.message });
            }
        };
        this.socket.onerror = () => {
            this.postStatus({ type: 'error', source: 'replay-capture', message: 'capture socket error; live market data is unaffected' });
        };
        this.socket.onclose = () => {
            if (!this.stopped && !this.finalized) {
                this.postStatus({ type: 'error', source: 'replay-capture', message: 'capture socket disconnected; recording is incomplete' });
            }
        };
        this.timer = setInterval(() => this.flush(), CAPTURE_SEND_INTERVAL_MS);
        const finalizeDelay = Math.max(0, this.config.finalizeAtEpochMs - Date.now());
        this.finalizeTimer = setTimeout(() => {
            this.finalizeRequested = true;
            this.finishRecording();
        }, finalizeDelay);
    }

    private getMarketTime(message: Messages.WorkerToMainMessage) {
        if (message.type === 'timeSaleFlush') {
            let latest = 0;
            message.trades.forEach(trade => {
                latest = Math.max(latest, trade.record.timestamp || trade.record.tradeTime || 0);
            });
            return latest || Date.now();
        }
        return Date.now();
    }

    enqueue(message: Messages.WorkerToMainMessage) {
        if (this.finalizeRequested || this.finalizeSent || this.finalized) return;
        if (message.type !== 'timeSaleFlush' && message.type !== 'quote') return;
        let captureMessage = message;
        if (message.type === 'timeSaleFlush') {
            const replayTrades = message.trades.filter(trade => {
                const marketTime = trade.record.timestamp || trade.record.tradeTime || 0;
                return marketTime >= this.config.cutoverEpochMs;
            });
            if (replayTrades.length === 0) return;
            captureMessage = { ...message, trades: replayTrades };
        }
        const marketTimeEpochMs = this.getMarketTime(captureMessage);
        if (marketTimeEpochMs < this.config.cutoverEpochMs) return;
        if (this.pending.length >= MAX_CAPTURE_EVENTS) {
            this.droppedCaptureBatchCount++;
            return;
        }
        this.pending.push({
            sequence: this.sequence++,
            arrivalOffsetMs: performance.now() - this.startedAt,
            marketTimeEpochMs,
            message: captureMessage,
        });
    }

    flush() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.pending.length === 0) return;
        if (this.socket.bufferedAmount > MAX_CAPTURE_SOCKET_BUFFER) return;
        const events = this.pending;
        this.pending = [];
        this.socket.send(JSON.stringify({ type: 'events', events }));
    }

    private finishRecording() {
        if (this.finalized || this.finalizeSent || this.socket?.readyState !== WebSocket.OPEN) return;
        if (this.pending.length > 0 && this.socket.bufferedAmount > MAX_CAPTURE_SOCKET_BUFFER) {
            if (!this.finalizeRetryTimer) {
                this.finalizeRetryTimer = setTimeout(() => {
                    this.finalizeRetryTimer = null;
                    this.finishRecording();
                }, 50);
            }
            return;
        }
        this.flush();
        this.socket.send(JSON.stringify({
            type: 'finalize',
            droppedCaptureBatchCount: this.droppedCaptureBatchCount,
        }));
        this.finalizeSent = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (this.finalizeTimer) clearTimeout(this.finalizeTimer);
        this.finalizeTimer = null;
        if (this.finalizeRetryTimer) clearTimeout(this.finalizeRetryTimer);
        this.finalizeRetryTimer = null;
    }

    stop(finalize: boolean) {
        this.stopped = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (this.finalizeTimer) clearTimeout(this.finalizeTimer);
        this.finalizeTimer = null;
        if (this.finalizeRetryTimer) clearTimeout(this.finalizeRetryTimer);
        this.finalizeRetryTimer = null;
        this.finalizeRequested = finalize;
        if (finalize) this.finishRecording();
        this.socket?.close();
        this.socket = null;
    }
}

class ReplayMarketDataStream {
    private socket: WebSocket | null = null;

    constructor(private readonly post: PostToMain) { }

    start(payload: Messages.ReplayMarketDataWorkerStartPayload) {
        this.stop();
        const socket = new WebSocket(payload.socketUrl);
        this.socket = socket;
        socket.onopen = () => this.post({ type: 'replayState', status: 'playing', speed: 1 });
        socket.onmessage = event => {
            const envelope = JSON.parse(String(event.data));
            if (envelope.type === 'replayEvent') {
                const storedEvent = envelope.event;
                const message = storedEvent.message as Messages.WorkerToMainMessage;
                if (message.type === 'timeSaleFlush') {
                    message.trades.forEach(trade => {
                        trade.record.receivedTime = new Date(trade.record.receivedTime as unknown as string | number);
                    });
                }
                this.post({
                    type: 'replayState',
                    status: 'playing',
                    marketTimeEpochMs: storedEvent.marketTimeEpochMs,
                    deliveryLagMs: envelope.deliveryLagMs,
                });
                this.post(message);
                return;
            }
            if (envelope.type === 'replayReady') {
                this.post({ type: 'replayState', status: 'playing', speed: envelope.speed });
            } else if (envelope.type === 'replayStatus') {
                this.post({ type: 'replayState', status: envelope.status, speed: envelope.speed });
            } else if (envelope.type === 'replayEnded') {
                this.post({ type: 'replayState', status: 'ended' });
            } else if (envelope.type === 'replayError') {
                this.post({ type: 'error', source: 'replay', message: envelope.message });
            }
        };
        socket.onerror = () => this.post({ type: 'error', source: 'replay', message: 'playback socket error' });
    }

    control(command: 'play' | 'pause' | 'speed', speed?: number) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: command, speed }));
        }
    }

    stop() {
        this.socket?.close();
        this.socket = null;
    }
}

const workerScope = self as unknown as {
    postMessage: (message: Messages.WorkerToMainMessage) => void;
    addEventListener: (
        type: 'message',
        listener: (event: MessageEvent<Messages.MainToWorkerMessage>) => void
    ) => void;
};

let captureSink: ReplayCaptureSink | null = null;
const postWorkerMessage = (message: Messages.WorkerToMainMessage) => {
    workerScope.postMessage(message);
    captureSink?.enqueue(message);
};
const tradeBuffer = new TradeFlushBuffer.TradeFlushBuffer(postWorkerMessage);
const streams = new MarketDataStreamManager(postWorkerMessage, tradeBuffer);
const replayStream = new ReplayMarketDataStream((message) => workerScope.postMessage(message));

workerScope.addEventListener('message', (event: MessageEvent<Messages.MainToWorkerMessage>) => {
    if (event.data.type === 'stop') {
        streams.stop();
        replayStream.stop();
        // Only the end-of-session timer requests a complete finalization. Closing or
        // reloading the app early lets ProxyServer mark the recording incomplete.
        captureSink?.stop(false);
        captureSink = null;
        workerScope.postMessage({ type: 'status', source: 'worker', status: 'stopped' });
        return;
    }
    if (event.data.type === 'replayControl') {
        replayStream.control(event.data.command, event.data.speed);
        return;
    }
    if (event.data.type === 'start') {
        streams.stop();
        replayStream.stop();
        captureSink?.stop(false);
        captureSink = null;
        if (event.data.payload.mode === 'replay') {
            replayStream.start(event.data.payload);
        } else {
            if (event.data.payload.capture) {
                captureSink = new ReplayCaptureSink(event.data.payload.capture, message => workerScope.postMessage(message));
                captureSink.start();
            }
            streams.start(event.data.payload);
        }
    }
});
