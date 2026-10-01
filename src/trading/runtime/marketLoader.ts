import { MassiveApi } from '../libraries/massive/api.ts';
import { shouldFilterTrade } from '../libraries/massive/mapper.ts';
import type { Trade } from '../models/market.ts';
import { MarketState, type VwapCorrection } from '../core/marketdata/marketState.ts';

type History = Awaited<ReturnType<MassiveApi['getFullPriceHistory']>>;
type Loading = { buffer: Trade[]; promise?: Promise<{ state: MarketState; history: History }> };

/** I/O orchestration only. Complete bars + exact print backfill + buffered live trades. */
export class MarketLoader {
    private readonly api: Pick<MassiveApi, 'getFullPriceHistory' | 'getTrades'>;
    private readonly now: () => number;
    private readonly states = new Map<string, MarketState>();
    private readonly loading = new Map<string, Loading>();
    private closed = false;
    constructor(api: Pick<MassiveApi, 'getFullPriceHistory' | 'getTrades'>, now = Date.now) { this.api = api; this.now = now; }
    getState(symbol: string) { return this.states.get(symbol); }
    acceptTrade(trade: Trade): boolean {
        if (this.closed || shouldFilterTrade(trade)) return false;
        this.loading.get(trade.symbol)?.buffer.push(trade);
        return this.states.get(trade.symbol)?.applyTrade(trade) ?? false;
    }
    load(symbol: string, date: string, marketCap: number, correction: VwapCorrection) {
        if (this.closed) return Promise.reject(new Error('Market loader stopped'));
        const previous = this.loading.get(symbol)?.promise;
        if (previous) return previous;
        const pending: Loading = { buffer: [] }; this.loading.set(symbol, pending);
        const liveFrom = Math.floor(this.now() / 60000) * 60000;
        pending.promise = this.performLoad(symbol, date, marketCap, correction, liveFrom, pending)
            .finally(() => { this.loading.delete(symbol); });
        return pending.promise;
    }
    private async performLoad(symbol: string, date: string, marketCap: number, correction: VwapCorrection, liveFrom: number, pending: Loading) {
        const history = await this.api.getFullPriceHistory(symbol, date);
        const backfill = await this.api.getTrades(symbol, liveFrom, this.now());
        if (this.closed) throw new Error('Market loader stopped');
        const state = new MarketState(symbol, date, marketCap); state.initialize(history.today1MinuteBars, liveFrom, correction);
        // Backfill can overlap live buffering. Deduplication lives in MarketState.
        const prints = [...backfill, ...pending.buffer].sort((a, b) => a.timestamp - b.timestamp);
        for (const print of prints) if (!shouldFilterTrade(print)) state.applyTrade(print);
        this.states.set(symbol, state); return { state, history };
    }
    close() { this.closed = true; this.states.clear(); this.loading.clear(); }
}
