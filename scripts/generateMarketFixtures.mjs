import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { MarketState } from '../src/trading/core/marketdata/marketState.ts';
import { calculateCamPivots } from '../src/trading/core/marketdata/levels.ts';
import { calculateLiquidityScale } from '../src/trading/core/marketdata/liquidity.ts';
import { mapWebSocketTrade, shouldFilterTrade } from '../src/trading/libraries/massive/mapper.ts';
import { premarketEligibility, impliedMarketCapInBillions, validatePreviousConsolidationArea } from '../src/trading/core/marketdata/eligibility.ts';
import { startupEligibility } from '../src/trading/core/marketdata/startupEligibility.ts';

const fixtures = [];
const base = Date.parse('2026-10-01T13:30:00Z');
const candle = (time, price = 10, volume = 100, vwap = price) => ({ symbol: 'AAPL', datetime: time, open: price, high: price + 1, low: price - 1, close: price, volume, vwap });
const trade = (offset, price = 10, size = 100, sequence) => ({ symbol: 'AAPL', timestamp: base + offset, price, size, conditions: [], ...(sequence === undefined ? {} : { sequence: String(sequence) }) });
for (const fixture of [
    { name: 'each intrabatch price changes OHLC and true dollar VWAP', history: [], liveFrom: base, trades: [trade(0, 10, 100, 1), trade(1, 12, 200, 2), trade(2, 9, 100, 3)] },
    { name: 'duplicate stream/backfill sequences are counted once', history: [], liveFrom: base, trades: [trade(0, 10, 100, 1), trade(0, 10, 100, 1), trade(1, 11, 100, 2)] },
    { name: 'only completed history seeds the current minute', history: [candle(base - 60000), candle(base, 30, 1000)], liveFrom: base, trades: [trade(0, 10, 100, 1), trade(1, 11, 100, 2)] },
    { name: 'history and buffered old trades do not overlap', history: [candle(base - 60000)], liveFrom: base, trades: [trade(-1, 10, 100, 1), trade(0, 11, 100, 2)] },
    { name: 'late closed-bucket print is ignored and empty intervals stay empty', history: [], liveFrom: base, trades: [trade(0, 10, 100, 1), trade(120000, 11, 100, 2), trade(10, 12, 100, 3)] },
    { name: 'late same-bucket print changes open and range but keeps latest close/price', history: [], liveFrom: base, trades: [trade(20000, 10, 100, 2), trade(10000, 8, 100, 1), trade(30000, 11, 100, 3)] },
    { name: 'premarket correction starts before first eligible historical bar', history: [candle(base - 2100000), candle(base - 1800000), candle(base - 60000)], liveFrom: base, correction: { volumeSum: 1000, tradingSum: 12000 }, trades: [trade(0, 11, 100, 1)] },
    { name: 'premarket correction can start on live data with no eligible history', history: [candle(base - 2100000)], liveFrom: base - 1800000, correction: { volumeSum: 1000, tradingSum: 12000 }, trades: [trade(-1800000, 11, 100, 1)] },
    { name: 'only current date and 1am-onward history affect market state', history: [candle(base - 86400000), candle(Date.parse('2026-10-01T04:30:00Z')), candle(Date.parse('2026-10-01T05:00:00Z'))], liveFrom: base, trades: [trade(0, 10, 250000, 1)] },
    { name: 'liquidity locks at maximum despite later lower prices', history: [candle(base - 60000, 10, 250000)], liveFrom: base, trades: [trade(0, 100, 250000, 1), trade(60000, 10, 100, 2)] },
    { name: 'missing history starts from the first accepted print', history: [], liveFrom: base, trades: [trade(0, 10, 100, 1)] },
]) {
    const state = new MarketState('AAPL', '2026-10-01', 10000);
    state.initialize(fixture.history, fixture.liveFrom, fixture.correction);
    const initial = state.snapshot();
    const accepted = fixture.trades.map(value => state.applyTrade(value));
    fixtures.push({ kind: 'state', ...fixture, marketCap: 10000, initial, accepted, result: state.snapshot() });
}
for (const args of [
    [10, [], 0, 10000, false], [10, [249999], 100000, 10000, false], [50, [250000], 100000, 10000, false],
    [10, [250000], 300000, 10000, false], [100, [250000], 100000, 10000, false],
    [10, [1000001], 250000, 100000, false], [50, [300000, 250000], 100000, 100000, false],
    [10, [300000, 250000], 100000, 2000, false], [10, [1], 100000, 10000, true],
]) fixtures.push({ kind: 'liquidity', name: `liquidity ${JSON.stringify(args)}`, args, result: calculateLiquidityScale(...args) });
for (const args of [[110, 90, 100], [10.51, 9.47, 10.01]]) fixtures.push({ kind: 'levels', name: `Camarilla ${args}`, args, result: calculateCamPivots(...args) });
for (const instant of ['2026-03-06T14:29:59.999Z', '2026-03-06T14:30:00Z', '2026-03-09T13:30:00Z', '2026-10-01T20:00:00Z', '2026-10-01T20:00:00.001Z']) {
    const input = { ev: 'T', sym: 'AAPL', p: 10, s: 100, t: Date.parse(instant), q: 1, i: 'a', x: 11, c: [12] };
    const result = mapWebSocketTrade(input);
    fixtures.push({ kind: 'mapper', name: `condition boundary ${instant}`, input, result, filtered: shouldFilterTrade(result) });
}
for (const args of [[499999, 1000, 500000, 0.9, 4], [500000, 125000, 500000, 0.9, 4], [899999, 0, 500000, 0.9, 4], [900000, 0, 500000, 0.9, 4]])
    fixtures.push({ kind: 'premarketEligibility', name: `shares eligibility ${args}`, args, result: premarketEligibility(...args) });
for (const args of [[100000000, 10], [100000000, 8.95], [0, 10]]) fixtures.push({ kind: 'marketCap', name: `implied cap ${args}`, args, result: impliedMarketCapInBillions(...args) });
for (const [area, candles] of [
    [{ low: 9, high: 11 }, [{ ...candle(base - 86400000), close: 12 }]],
    [{ low: 11, high: 9 }, [{ ...candle(base - 86400000), close: 8 }]],
    [{ low: 9, high: 11 }, [{ ...candle(base - 86400000), open: 12, close: 13 }]],
    [null, []], [null, [candle(base - 86400000)]],
]) fixtures.push({ kind: 'consolidation', name: `consolidation ${JSON.stringify([area, candles])}`, area, candles, result: validatePreviousConsolidationArea(area ?? undefined, candles) });
for (const [name, plan, shares, stats, daily, expected] of [
    ['AMD bypasses hard floor with zero premarket volume', { symbol: 'AMD', marketCapInMillions: 10000 }, 100000000, { lastDayShares: 0, previousDaysSharesAverage: 1000000 }, [], ''],
    ['AMD bypasses absolute and relative volume thresholds', { symbol: 'AMD', marketCapInMillions: 10000 }, 100000000, { lastDayShares: 600000, previousDaysSharesAverage: 1000000 }, [], ''],
    ['AAPL still requires premarket hard floor', { symbol: 'AAPL', marketCapInMillions: 10000 }, 100000000, { lastDayShares: 0, previousDaysSharesAverage: 1000000 }, [], 'premarket shares below 500000 hard floor'],
    ['AAPL still requires absolute or relative volume', { symbol: 'AAPL', marketCapInMillions: 10000 }, 100000000, { lastDayShares: 600000, previousDaysSharesAverage: 1000000 }, [], 'premarket shares below 0.9M and 4x prior average'],
    ['AAPL qualifies on relative volume', { symbol: 'AAPL', marketCapInMillions: 10000 }, 100000000, { lastDayShares: 600000, previousDaysSharesAverage: 100000 }, [], ''],
    ['AMD still requires configured market cap', { symbol: 'AMD', marketCapInMillions: 400 }, 100000000, { lastDayShares: 0, previousDaysSharesAverage: 1000000 }, [], 'configured market cap below $500M'],
    ['AMD still requires implied market cap', { symbol: 'AMD', marketCapInMillions: 10000 }, 1000000, { lastDayShares: 0, previousDaysSharesAverage: 1000000 }, [], 'implied market cap below $0.9B'],
    ['AMD still requires valid consolidation area', { symbol: 'AMD', marketCapInMillions: 10000, rangeBoundReversalPlan: {} }, 100000000, { lastDayShares: 0, previousDaysSharesAverage: 1000000 }, [candle(base - 86400000)], 'missing previous consolidation area for range bound reversal'],
]) {
    const args = [plan, 10, shares, stats, daily];
    const result = startupEligibility(...args);
    assert.equal(result, expected, name);
    fixtures.push({ kind: 'startupEligibility', name, args, result });
}
const encoded = JSON.stringify(fixtures, null, 2) + '\n';
for (const file of [resolve(import.meta.dirname, '../src/trading/market-fixtures.json'), resolve(import.meta.dirname, '../../bookmap-plugin/src/test/resources/market-fixtures.json')]) {
    if (process.argv.includes('--check')) assert.equal(readFileSync(file, 'utf8').replaceAll('\r\n', '\n'), encoded, `Stale fixture ${file}`);
    else writeFileSync(file, encoded);
}
console.log(`Verified ${fixtures.length} headless market scenarios through production TS core.`);
