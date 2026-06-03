import * as TimeSaleParse from '../streaming/timeSaleParse';
import * as LevelOneQuoteParse from '../streaming/levelOneQuoteParse';
import * as TradeFlushBuffer from './tradeFlushBuffer';
import type * as Messages from './marketDataMessages';

const ALPACA_MARKET_DATA_URL = 'wss://stream.data.alpaca.markets/v2/sip';
const MASSIVE_URL = 'wss://socket.massive.com/stocks';

type PostToMain = (message: Messages.WorkerToMainMessage) => void;

class MarketDataStreamManager {
    private alpacaSocket: WebSocket | null = null;
    private massiveSocket: WebSocket | null = null;
    private schwabSocket: WebSocket | null = null;
    private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
    private symbols: string[] = [];

    constructor(
        private readonly post: PostToMain,
        private readonly tradeBuffer: TradeFlushBuffer.TradeFlushBuffer,
    ) { }

    stop() {
        if (this.cleanupTimer) {
            clearTimeout(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.tradeBuffer.stop();
        this.alpacaSocket?.close();
        this.massiveSocket?.close();
        this.schwabSocket?.close();
        this.alpacaSocket = null;
        this.massiveSocket = null;
        this.schwabSocket = null;
        this.symbols = [];
    }

    start(payload: Messages.MarketDataWorkerStartPayload) {
        this.stop();
        this.symbols = payload.symbols;
        this.post({ type: 'status', source: 'worker', status: `starting ${payload.symbols.length} symbols` });
        if (payload.useAlpacaTradeStream || payload.useAlpacaQuoteStream) {
            this.connectAlpaca(payload);
        }
        if (payload.useMassiveTradeStream) {
            this.connectMassive(payload);
        }
        if (payload.schwab) {
            this.connectSchwab(payload.schwab);
        }
        this.tradeBuffer.start();
    }

    private enqueueTrades(trades: Messages.ParsedTrade[], source: Messages.TradeSource) {
        trades.forEach(trade => this.tradeBuffer.push(trade, source));
    }

    private connectAlpaca(payload: Messages.MarketDataWorkerStartPayload) {
        let socket = new WebSocket(ALPACA_MARKET_DATA_URL);
        this.alpacaSocket = socket;
        socket.onmessage = (messageEvent) => {
            let messageData = JSON.parse(String(messageEvent.data));
            if (!Array.isArray(messageData)) {
                return;
            }
            let trades: Messages.ParsedTrade[] = [];
            let quotes: import('../models/models').Quote[] = [];
            messageData.forEach((element: any) => {
                if (element.T === 'success') {
                    if (element.msg === 'connected') {
                        this.send(socket, { action: 'auth', key: payload.alpaca.apiKey, secret: payload.alpaca.apiSecret });
                    } else if (element.msg === 'authenticated') {
                        if (payload.useAlpacaTradeStream) {
                            this.send(socket, { action: 'subscribe', trades: payload.symbols });
                            this.scheduleAlpacaCleanup(payload.alpacaTradeCleanupDelayMs);
                        }
                        if (payload.useAlpacaQuoteStream) {
                            this.send(socket, { action: 'subscribe', quotes: payload.symbols });
                        }
                    }
                } else if (element.T === 't') {
                    trades.push(TimeSaleParse.createAlpacaTimeSale(element));
                } else if (element.T === 'q') {
                    quotes.push(LevelOneQuoteParse.createAlpacaLevelOneQuote(element));
                }
            });
            if (trades.length > 0) {
                this.enqueueTrades(trades, 'a');
            }
            if (quotes.length > 0) {
                this.post({ type: 'quote', source: 'a', quotes });
            }
        };
        socket.onerror = () => this.post({ type: 'error', source: 'alpaca', message: 'socket error' });
    }

    private connectMassive(payload: Messages.MarketDataWorkerStartPayload) {
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

    private scheduleAlpacaCleanup(delayMs: number) {
        if (delayMs < 0) {
            return;
        }
        this.cleanupTimer = setTimeout(() => {
            if (this.alpacaSocket?.readyState === WebSocket.OPEN) {
                this.send(this.alpacaSocket, { action: 'unsubscribe', trades: this.symbols });
            }
        }, delayMs);
    }

    private send(socket: WebSocket, request: unknown) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(request));
        }
    }
}

const workerScope = self as unknown as {
    postMessage: (message: Messages.WorkerToMainMessage) => void;
    addEventListener: (
        type: 'message',
        listener: (event: MessageEvent<Messages.MainToWorkerMessage>) => void
    ) => void;
};

const tradeBuffer = new TradeFlushBuffer.TradeFlushBuffer((message) => workerScope.postMessage(message));
const streams = new MarketDataStreamManager((message) => workerScope.postMessage(message), tradeBuffer);

workerScope.addEventListener('message', (event: MessageEvent<Messages.MainToWorkerMessage>) => {
    if (event.data.type === 'stop') {
        streams.stop();
        workerScope.postMessage({ type: 'status', source: 'worker', status: 'stopped' });
        return;
    }
    if (event.data.type === 'start') {
        streams.start(event.data.payload);
    }
});
