import test from 'node:test';
import assert from 'node:assert/strict';
import { mapRestTrade, mapWebSocketTrade } from './mapper.ts';
import { MassiveApi } from './api.ts';

test('REST fractional prints use decimal_size even when legacy size is zero', () => {
    const trade = mapRestTrade('NVDA', {
        sip_timestamp: '1790861400000000001', price: 237.32, size: 0,
        decimal_size: '0.250624', conditions: [37],
    });
    assert.equal(trade.size, 0.250624);
    assert.equal(trade.timestamp, 1790861400000);
});

test('REST decimal_size preserves fractional parts of larger prints', () => {
    assert.equal(mapRestTrade('NVDA', {
        sip_timestamp: '1790861400000000001', price: 237.32, size: 100,
        decimal_size: '100.5',
    }).size, 100.5);
    assert.equal(mapRestTrade('NVDA', {
        sip_timestamp: '1790861400000000001', price: 237.32, size: 100,
    }).size, 100);
});

test('WebSocket fractional prints use ds when s is zero', () => {
    const trade = mapWebSocketTrade({ ev: 'T', sym: 'NVDA', t: 1790861400000, p: 237.32, s: 0, ds: '0.25' });
    assert.equal(trade?.size, 0.25);
    assert.equal(mapWebSocketTrade({ ev: 'T', sym: 'NVDA', t: 1790861400000, p: 237.32, s: 0 }), null);
});

test('REST trade backfill does not abort on a fractional print', async () => {
    const api = new MassiveApi({ request: async () => ({
        status: 200,
        body: '{"results":[{"sip_timestamp":1790861400000000001,"price":237.32,"size":0,"decimal_size":"0.25","conditions":[37]}]}',
    }) }, () => 'test-key');
    const trades = await api.getTrades('NVDA', 1790861400000, 1790861460000);
    assert.equal(trades.length, 1);
    assert.equal(trades[0].size, 0.25);
});
