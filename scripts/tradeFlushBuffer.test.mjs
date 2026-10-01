import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { MarketState } from '../src/trading/core/marketdata/marketState.ts';

const source = readFileSync(new URL('../src/workers/tradeFlushBuffer.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { TradeFlushBuffer } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('worker batching retains each print, its timestamp, and true traded dollars', () => {
    const messages = [], base = Date.parse('2026-10-01T13:30:00Z');
    const buffer = new TradeFlushBuffer(value => messages.push(value));
    const prints = [{ price: 10, size: 100 }, { price: 12, size: 200 }, { price: 9, size: 100 }];
    prints.forEach((print, index) => buffer.push({ shouldFilter: false, record: {
        symbol: 'AAPL', lastPrice: print.price, lastSize: print.size, tradeTime: base + index, timestamp: base + index,
    } }, 'm'));
    buffer.flush();
    const trades = messages[0].trades;
    assert.equal(trades.length, 3);
    const state = new MarketState('AAPL', '2026-10-01', 10000); state.initialize([], base);
    trades.forEach(({ record }) => state.applyTrade({ symbol: record.symbol, price: record.lastPrice, size: record.lastSize, timestamp: record.tradeTime, conditions: [] }));
    const result = state.snapshot();
    assert.deepEqual([result.candles[0].open, result.candles[0].high, result.candles[0].low, result.candles[0].close], [10, 12, 9, 9]);
    assert.equal(result.totalVolume, 400); assert.equal(result.totalTradingAmount, 4300); assert.equal(result.vwap, 10.75);
});
