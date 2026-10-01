import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketLoader } from './marketLoader.ts';
import { calculatePremarketVolume } from '../core/marketdata/premarketVolume.ts';
import type { Trade } from '../models/market.ts';

test('loading backfills the partial minute and counts overlapping buffered prints once', async () => {
    const base = Date.parse('2026-10-01T13:30:00Z');
    const first: Trade = { symbol: 'AAPL', timestamp: base + 1, price: 10, size: 100, sequence: '1', conditions: [] };
    const second: Trade = { ...first, timestamp: base + 2, price: 12, size: 200, sequence: '2' };
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const loader = new MarketLoader({
        getFullPriceHistory: async () => {
            await blocked;
            return { today1MinuteBars: [{ symbol: 'AAPL', datetime: base, open: 99, high: 99, low: 99, close: 99, volume: 9999, vwap: 99 }], dailyBars: [], premarketDollarCollection: calculatePremarketVolume([]) };
        },
        getTrades: async (_symbol, from, to) => { assert.equal(from, base); assert.equal(to, base + 30000); return [first, second]; },
    }, () => base + 30000);
    const load = loader.load('AAPL', '2026-10-01', 10000, { volumeSum: 0, tradingSum: 0 });
    const same = loader.load('AAPL', '2026-10-01', 10000, { volumeSum: 0, tradingSum: 0 }); assert.equal(load, same);
    loader.acceptTrade(first); loader.acceptTrade(second); release();
    const result = (await load).state.snapshot();
    assert.equal(result.totalVolume, 300); assert.equal(result.totalTradingAmount, 3400);
    assert.equal(result.candles[0].high, 12); assert.equal(result.currentPrice, 12);
});
