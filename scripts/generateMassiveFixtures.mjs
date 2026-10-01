// Capture production TS library behavior for the matching Java port. All I/O is fake.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { MassiveApi } from '../src/trading/libraries/massive/api.ts';
import { calculatePremarketVolume } from '../src/trading/core/marketdata/premarketVolume.ts';
import { marketTime } from '../src/trading/runtime/marketClock.ts';

const bar = (date, price = 10, volume = 100, vw = price) => ({ t: Date.parse(date), o: price, h: price + 1, l: price - 1, c: price, v: volume, ...(vw === undefined ? {} : { vw }) });
const ok = body => ({ status: 200, body: JSON.stringify(body) });
const cases = [
    { name: 'today follows pages, sorts and replaces duplicate buckets', method: 'getPriceHistory', args: ['AAPL', 1, '2026-10-01'], pages: [
        ok({ status: 'OK', results: [bar('2026-10-01T13:31:00Z'), bar('2026-10-01T13:30:00Z')], next_url: 'https://api.massive.com/page?cursor=next' }),
        ok({ status: 'OK', results: [bar('2026-10-01T13:31:00Z', 11)] }),
    ] },
    { name: 'no eligible trades is an empty interval', method: 'getPriceHistory', args: ['AAPL', 1, '2026-10-01'], pages: [ok({ status: 'OK', resultsCount: 0 })] },
    { name: 'daily range excludes today and preserves existing calendar lookback', method: 'getDailyCandlesForLastNDays', args: ['AAPL', 1095, '2026-10-01'], pages: [ok({ results: [] })] },
    { name: 'higher timeframe needs no undocumented extendedHours parameter', method: 'getPriceHistoryFromOldDateForHigherTimeframe', args: ['BRK.B', 30, '2026-09-11', '2026-10-01'], pages: [ok({ results: [] })] },
    { name: 'missing aggregate vwap maps to zero', method: 'getBars', args: ['AAPL', '/bars'], pages: [ok({ results: [{ t: 1790861400000, o: 10, h: 11, l: 9, c: 10, v: 100 }] })] },
    { name: 'weighted shares have precedence', method: 'getSharesOutstanding', args: ['AAPL'], pages: [ok({ results: { weighted_shares_outstanding: 200, share_class_shares_outstanding: 100 } })] },
    { name: 'shares fall back to class shares', method: 'getSharesOutstanding', args: ['AAPL'], pages: [ok({ results: { weighted_shares_outstanding: 0, share_class_shares_outstanding: 100 } })] },
    { name: 'missing shares yield zero', method: 'getSharesOutstanding', args: ['AAPL'], pages: [ok({ results: {} })] },
    { name: 'rate limit is visible without response secrets', method: 'getBars', args: ['AAPL', '/bars'], pages: [{ status: 429, body: 'fixture-secret-key' }] },
    { name: 'entitlement error is not empty market data', method: 'getBars', args: ['AAPL', '/bars'], pages: [ok({ status: 'NOT_AUTHORIZED' })] },
    { name: 'malformed results are rejected', method: 'getBars', args: ['AAPL', '/bars'], pages: [ok({ results: {} })] },
    { name: 'bad required aggregate is rejected', method: 'getBars', args: ['AAPL', '/bars'], pages: [ok({ results: [{ t: 1 }] })] },
    { name: 'pagination cannot forward credentials to another host', method: 'getBars', args: ['AAPL', '/bars'], pages: [ok({ next_url: 'https://other.invalid/page' })] },
    { name: 'repeated cursor fails instead of hanging', method: 'getBars', args: ['AAPL', '/bars'], pages: [ok({ next_url: 'https://api.massive.com/bars' }), ok({ next_url: 'https://api.massive.com/bars' })] },
    { name: 'full history composes all three historical inputs', method: 'getFullPriceHistory', args: ['AAPL', '2026-10-01'], pages: [
        ok({ results: [bar('2026-10-01T13:30:00Z')] }), ok({ results: [bar('2026-09-30T04:00:00Z')] }),
        ok({ results: [bar('2026-09-30T12:00:00Z', 10, 100), bar('2026-10-01T12:00:00Z', 20, 200)] }),
    ] },
];

const fixtures = [];
for (const fixture of cases) {
    const paths = [];
    const client = new MassiveApi({ request: async url => {
        const path = new URL(url); assert.equal(path.searchParams.get('apiKey'), 'fixture-secret-key');
        path.searchParams.delete('apiKey'); paths.push(path.pathname + path.search);
        return fixture.pages[paths.length - 1] ?? assert.fail('Unexpected read');
    } }, () => 'fixture-secret-key');
    let result, error;
    try { result = await client[fixture.method](...fixture.args); }
    catch (failure) { error = failure.message; assert.ok(!error.includes('fixture-secret-key')); }
    fixtures.push({ ...fixture, paths, ...(error ? { error } : { result }) });
}
const statsBars = [
    bar('2026-03-06T14:00:00Z', 10, 100), bar('2026-03-06T14:30:00Z', 100, 100), // excludes 9:30 EST
    bar('2026-03-09T13:00:00Z', 20, 100), bar('2026-03-09T13:30:00Z', 100, 100), // excludes 9:30 EDT
    bar('2026-03-10T13:00:00Z', 30, 100, 999), // invalid VWAP => HLC/3
];
const candles = statsBars.map(value => ({ symbol: 'AAPL', datetime: value.t, open: value.o, high: value.h, low: value.l, close: value.c, volume: value.v, vwap: value.vw }));
fixtures.push({ name: 'premarket grouping uses historical DST, median dollars, and typical-price fallback', method: 'calculatePremarketVolume', args: [candles], result: calculatePremarketVolume(candles) });
fixtures.push({ name: 'empty premarket', method: 'calculatePremarketVolume', args: [[]], result: calculatePremarketVolume([]) });
for (const instant of ['2026-03-06T14:30:00Z', '2026-03-09T13:30:00Z', '2026-11-02T14:30:00Z', '2026-10-01T20:00:00Z', '2026-10-02T00:00:00Z']) {
    const epoch = Date.parse(instant);
    fixtures.push({ name: `market clock ${instant}`, method: 'marketTime', args: [epoch], result: marketTime(epoch) });
}
const encoded = JSON.stringify(fixtures, null, 2) + '\n';
const targets = [resolve(import.meta.dirname, '../src/trading/massive-fixtures.json'), resolve(import.meta.dirname, '../../bookmap-plugin/src/test/resources/massive-fixtures.json')];
for (const file of targets) {
    if (process.argv.includes('--check')) assert.equal(readFileSync(file, 'utf8').replaceAll('\r\n', '\n'), encoded, `Stale fixture ${file}`);
    else writeFileSync(file, encoded);
}
console.log(`Verified ${fixtures.length} Massive/market scenarios through the production TS library.`);
