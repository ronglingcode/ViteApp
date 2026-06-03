import * as StateLite from '../models/stateLite';

const MASSIVE_API_HOST = 'https://api.massive.com';
const MASSIVE_SOCKET_URL = 'wss://socket.massive.com/stocks';

const formatDateToYYYYMMDD = (date: Date) => {
    let year = date.getFullYear();
    let month = String(date.getMonth() + 1).padStart(2, '0');
    let day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const barsToCandles = (bars: any[]): StateLite.Candle[] => {
    return bars.map((bar: any): StateLite.Candle => ({
        time: StateLite.toTradingViewTime(Number(bar.t)),
        open: Number(bar.o),
        high: Number(bar.h),
        low: Number(bar.l),
        close: Number(bar.c),
        volume: Number(bar.v ?? 0),
    }));
};

const getBars = async (symbol: string, url: string): Promise<StateLite.Candle[]> => {
    let response = await fetch(url);
    let data = await response.json();
    if (!response.ok) {
        throw new Error(`Massive bars failed for ${symbol}: ${response.status} ${JSON.stringify(data)}`);
    }
    if (!Array.isArray(data.results)) {
        return [];
    }
    return barsToCandles(data.results);
};

export const getTodayMinuteBars = async (symbol: string, apiKey: string): Promise<StateLite.Candle[]> => {
    let today = new Date();
    let tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    let todayString = formatDateToYYYYMMDD(today);
    let tomorrowString = formatDateToYYYYMMDD(tomorrow);
    let url = `${MASSIVE_API_HOST}/v2/aggs/ticker/${symbol}/range/1/minute/${todayString}/${tomorrowString}` +
        `?adjusted=true&extendedHours=true&sort=asc&limit=1000&apiKey=${apiKey}`;

    return getBars(symbol, url);
};

export const getDailyCandlesForLastNDays = async (
    symbol: string,
    apiKey: string,
    nDays = 3 * 365
): Promise<StateLite.Candle[]> => {
    let end = new Date();
    end.setDate(end.getDate() - 1);
    let start = new Date(end);
    start.setDate(start.getDate() - nDays - 1);
    let startString = formatDateToYYYYMMDD(start);
    let endString = formatDateToYYYYMMDD(end);
    let url = `${MASSIVE_API_HOST}/v2/aggs/ticker/${symbol}/range/1/day/${startString}/${endString}` +
        `?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;

    return getBars(symbol, url);
};

interface MassiveStreamerCallbacks {
    onStatus: (status: string) => void;
    onTrade: (trade: StateLite.TradeTick) => void;
    onQuote: (quote: StateLite.QuoteSnapshot) => void;
    onError: (message: string) => void;
}

export class MassiveStreamer {
    private websocket: WebSocket | null = null;

    constructor(
        private readonly apiKey: string,
        private readonly symbols: string[],
        private readonly callbacks: MassiveStreamerCallbacks
    ) { }

    connect() {
        this.close();
        this.callbacks.onStatus('connecting');
        this.websocket = new WebSocket(MASSIVE_SOCKET_URL);
        this.websocket.onopen = () => this.sendAuth();
        this.websocket.onmessage = (messageEvent) => this.handleMessage(messageEvent);
        this.websocket.onerror = () => this.callbacks.onError('Massive socket error');
        this.websocket.onclose = () => this.callbacks.onStatus('closed');
    }

    close() {
        if (!this.websocket) {
            return;
        }
        this.websocket.close();
        this.websocket = null;
    }

    private send(request: unknown) {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            return;
        }
        this.websocket.send(JSON.stringify(request));
    }

    private sendAuth() {
        this.send({
            action: 'auth',
            params: this.apiKey,
        });
    }

    private subscribeMarketData() {
        if (this.symbols.length === 0) {
            return;
        }
        let subscriptions = this.symbols.flatMap(symbol => [`T.${symbol}`, `Q.${symbol}`]);
        this.send({
            action: 'subscribe',
            params: subscriptions.join(','),
        });
    }

    private handleMessage(messageEvent: MessageEvent<string>) {
        let messages = JSON.parse(messageEvent.data);
        if (!Array.isArray(messages)) {
            return;
        }
        messages.forEach(message => {
            if (message.ev === 'status') {
                this.callbacks.onStatus(message.status ?? 'status');
                if (message.status === 'auth_success') {
                    this.subscribeMarketData();
                }
                return;
            }

            if (message.ev === 'T') {
                let price = Number(message.p);
                let size = Number(message.s ?? 0);
                let timestamp = Number(message.t ?? Date.now());
                let symbol = String(message.sym ?? '').toUpperCase();
                if (!symbol || !Number.isFinite(price) || price <= 0) {
                    return;
                }
                this.callbacks.onTrade({
                    symbol,
                    price,
                    size,
                    timestamp,
                    source: 'massive',
                });
                return;
            }

            if (message.ev === 'Q') {
                let bid = Number(message.bp);
                let ask = Number(message.ap);
                let lastPrice = Number(message.ap ?? message.bp);
                let timestamp = Number(message.t ?? Date.now());
                let symbol = String(message.sym ?? '').toUpperCase();
                if (!symbol) {
                    return;
                }
                this.callbacks.onQuote({
                    symbol,
                    bid: Number.isFinite(bid) && bid > 0 ? bid : undefined,
                    ask: Number.isFinite(ask) && ask > 0 ? ask : undefined,
                    lastPrice: Number.isFinite(lastPrice) && lastPrice > 0 ? lastPrice : undefined,
                    timestamp,
                    source: 'massive',
                });
            }
        });
    }
}
