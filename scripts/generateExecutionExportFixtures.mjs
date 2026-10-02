import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as Exports from '../src/trading/core/account/executionExports.ts';

const base = Date.parse('2026-10-01T13:30:00Z');
const fill = (symbol, price, quantity, isBuy = true, offset = 0) => ({ symbol, orderID: String(offset), timestamp: base + offset, price, quantity, isBuy, positionEffectIsOpen: isBuy });
const fills = [fill('AAPL', 201.01, 10), fill('AAPL', 201.04, 30, true, 1000), fill('AAPL', 201.08, 20, true, 2000), fill('AAPL', 202, 15, false, 3000), fill('MSFT', 40.01, 5), fill('AAPL', 203, 5, true, 60000)];
const fixtures = [];
function add(name, method, args) {
    const result = Exports[method](...args); fixtures.push({ name, method, args, result }); return result;
}
const summary = add('weighted summary separates side symbol and minute', 'executionScript', [fills, false]);
assert.equal(summary.split('\n').filter(Boolean).length, 4);
assert.ok(summary.includes('time == 0, 201.05, "+60"'));
assert.ok(summary.includes('202, "-15", GlobalColor("BubbleRed"), 1)'));
const detailed = add('detailed price clusters retain weighted price', 'executionScript', [fills, true]);
assert.equal(detailed.split('\n').filter(Boolean).length, 5);
assert.ok(detailed.includes('201.03, "+40"'));
assert.ok(detailed.includes('201.08, "+20"'));
for (const [low, high, count] of [[25, 25.01, 1], [50.01, 50.02, 1], [100.01, 100.02, 1], [200.01, 200.04, 1], [24.01, 24.02, 2]]) {
    const script = add(`price threshold ${low}`, 'executionScript', [[fill('TEST', low, 10), fill('TEST', high, 10, true, 1)], true]);
    assert.equal(script.split('\n').filter(Boolean).length, count);
}
const winter = [{ ...fill('AAPL', 10, 10), timestamp: Date.parse('2026-01-05T14:29:59Z') }];
assert.ok(add('winter premarket minute uses Eastern DST', 'executionScript', [winter, false]).includes('time == -60'));
const twoDates = [fills[0], { ...fills[0], timestamp: base + 86400000 }];
assert.equal(add('different sessions never aggregate together', 'executionScript', [twoDates, false]).split('\n').filter(Boolean).length, 2);
assert.equal(add('empty ThinkScript', 'executionScript', [[], false]), '');
const csv = add('Pacific CSV signed quantities open close and afternoon clock', 'executionTradesCsv', [[...fills, fill('AFTER', 9.1234, 3, false, 5 * 3600000)], base, 'America/Los_Angeles']);
assert.ok(csv.includes('10/1/2026 06:30:00,BUY,+10,TO OPEN,AAPL'));
assert.ok(csv.includes('10/1/2026 11:30:00,STOCK,SELL,-3,TO CLOSE,AFTER,,,ETF,9.1234,9.1234,MKT'));
assert.ok(!csv.includes('lingrong') && !csv.includes('3551'));
assert.ok(add('winter CSV timezone', 'executionTradesCsv', [winter, winter[0].timestamp, 'America/New_York']).includes('1/5/2026 09:29:59'));
const punctuation = [fill('A,"B\\C', 10, 1)];
assert.ok(add('CSV escapes fields', 'executionTradesCsv', [punctuation, base, 'UTC']).includes('"A,""B\\C"'));
add('ThinkScript escapes symbol', 'executionScript', [punctuation, false]);
add('empty CSV template', 'executionTradesCsv', [[], base, 'UTC']);
const output = JSON.stringify(fixtures, null, 2) + '\n';
for (const url of [new URL('../src/trading/execution-export-fixtures.json', import.meta.url), new URL('../../bookmap-plugin/src/test/resources/execution-export-fixtures.json', import.meta.url)]) {
    if (process.argv.includes('--check')) assert.equal(readFileSync(url, 'utf8'), output, `Stale ${url.pathname}`);
    else writeFileSync(url, output);
}
console.log(`Verified ${fixtures.length} execution export scenarios.`);
