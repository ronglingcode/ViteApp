import * as StateLite from '../models/stateLite';

interface SymbolState {
    candles: StateLite.Candle[];
    bid?: number;
    ask?: number;
    lastPrice?: number;
}

type PostToMain = (message: StateLite.WorkerToMainMessage) => void;

export class MarketDataState {
    private symbols = new Set<string>();
    private stateBySymbol = new Map<string, SymbolState>();
    private dirtySymbols = new Set<string>();
    private flushTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly post: PostToMain) { }

    reset(watchlist: StateLite.LiteWatchlistItem[]) {
        this.stop();
        this.symbols.clear();
        this.stateBySymbol.clear();
        this.dirtySymbols.clear();
        watchlist.forEach(item => {
            this.symbols.add(item.symbol);
            this.getState(item.symbol);
        });
    }

    stop() {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
    }

    replaceHistory(symbol: string, candles: StateLite.Candle[], dailyCandles: StateLite.Candle[]) {
        let state = this.getState(symbol);
        state.candles = candles;
        let lastCandle = candles[candles.length - 1];
        if (lastCandle) {
            state.lastPrice = lastCandle.close;
        }
        this.post({ type: 'history', symbol, candles, dailyCandles });
        this.markDirty(symbol);
    }

    updateFromTrade(trade: StateLite.TradeTick) {
        if (!this.symbols.has(trade.symbol)) {
            return;
        }
        let state = this.getState(trade.symbol);
        let minuteStart = StateLite.getMinuteStartMs(trade.timestamp);
        let candleTime = StateLite.toTradingViewTime(minuteStart);
        let lastCandle = state.candles[state.candles.length - 1];
        if (!lastCandle || lastCandle.time < candleTime) {
            state.candles.push({
                time: candleTime,
                open: trade.price,
                high: trade.price,
                low: trade.price,
                close: trade.price,
                volume: trade.size,
            });
        } else if (lastCandle.time === candleTime) {
            lastCandle.high = Math.max(lastCandle.high, trade.price);
            lastCandle.low = Math.min(lastCandle.low, trade.price);
            lastCandle.close = trade.price;
            lastCandle.volume += trade.size;
        }
        state.lastPrice = trade.price;
        this.markDirty(trade.symbol);
    }

    updateFromQuote(quote: StateLite.QuoteSnapshot) {
        if (!this.symbols.has(quote.symbol)) {
            return;
        }
        let state = this.getState(quote.symbol);
        if (quote.bid != null) {
            state.bid = quote.bid;
        }
        if (quote.ask != null) {
            state.ask = quote.ask;
        }
        if (quote.lastPrice != null) {
            state.lastPrice = quote.lastPrice;
        }
        this.markDirty(quote.symbol);
    }

    private getState(symbol: string) {
        let state = this.stateBySymbol.get(symbol);
        if (!state) {
            state = { candles: [] };
            this.stateBySymbol.set(symbol, state);
        }
        return state;
    }

    private markDirty(symbol: string) {
        this.dirtySymbols.add(symbol);
        if (this.flushTimer) {
            return;
        }
        this.flushTimer = setTimeout(() => this.flushSnapshots(), 100);
    }

    private flushSnapshots() {
        this.flushTimer = null;
        if (this.dirtySymbols.size === 0) {
            return;
        }
        let snapshots: StateLite.MarketSnapshot[] = [];
        this.dirtySymbols.forEach(symbol => {
            let state = this.getState(symbol);
            let spread = state.bid != null && state.ask != null ? state.ask - state.bid : undefined;
            snapshots.push({
                symbol,
                lastPrice: state.lastPrice,
                bid: state.bid,
                ask: state.ask,
                spread,
                candle: state.candles[state.candles.length - 1],
            });
        });
        this.dirtySymbols.clear();
        this.post({ type: 'snapshot', snapshots });
    }
}
