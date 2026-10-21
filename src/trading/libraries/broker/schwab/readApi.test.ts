import assert from 'node:assert/strict';
import test from 'node:test';
import { SchwabReadApi } from './readApi.ts';
import { projectAccount } from './accountProjection.ts';
import { executionTradesCsv } from '../../../core/account/executionExports.ts';

const date = '2026-10-01';
const burst = Date.parse(`${date}T13:30:00Z`);
const filledOrder = (orderId: number, enteredTime: number) => ({
    orderId, enteredTime, orderStrategyType: 'SINGLE', status: 'FILLED',
    orderLegCollection: [{ legId: 1, instruction: 'BUY', positionEffect: 'OPENING',
        instrument: { symbol: 'AAPL', assetType: 'EQUITY' } }],
    orderActivityCollection: [{ activityType: 'EXECUTION', executionType: 'FILL',
        executionLegs: [{ legId: 1, quantity: 1, price: 10, time: new Date(burst + orderId).toISOString() }] }],
});

for (const useTimeWindows of [false, true]) {
    test(`CSV contains every fill across capped pages (time windows: ${useTimeWindows})`, async () => {
        // More than two pages in under a second, with an order exactly on a
        // subdivision boundary. Also include an older order filled today.
        const source = Array.from({ length: 1201 }, (_, id) => filledOrder(id, burst + id));
        source.push(filledOrder(1201, Date.parse('2026-09-30T13:30:00Z')));
        let requests = 0, capped = 0;
        const api = new SchwabReadApi({ request: async url => {
            requests++;
            const query = new URL(url).searchParams;
            assert.equal(query.get('maxResults'), '500');
            const from = Date.parse(query.get('fromEnteredTime')!), to = Date.parse(query.get('toEnteredTime')!);
            const matching = source.filter(order => order.enteredTime >= from && order.enteredTime <= to);
            if (matching.length >= 500) capped++;
            return { status: 200, body: JSON.stringify(matching.slice(-500)) };
        } });
        const orders = await api.getOrders('account', 'token', date, useTimeWindows, 1);
        assert.ok(requests > 3 && capped > 1);
        assert.equal(orders.length, source.length);
        assert.deepEqual(new Set(orders.map(order => order.orderId)), new Set(source.map(order => order.orderId)));
        const projected = projectAccount({ currentBalances: { liquidationValue: 25000 } }, orders, date);
        const fills = Object.values(projected.executions).flat();
        assert.equal(fills.length, source.length);
        const csv = executionTradesCsv(fills, burst, 'UTC');
        assert.equal(csv.split('\n').filter(line => line.includes(',STOCK,BUY,')).length, source.length);
    });
}

test('an HTTP error on a later page rejects the entire history read', async () => {
    let requests = 0;
    const api = new SchwabReadApi({ request: async () => ({ status: ++requests === 3 ? 503 : 200,
        body: JSON.stringify(requests === 1 ? Array.from({ length: 500 }, (_, orderId) => ({ orderId })) : [{ orderId: 1 }]) }) });
    await assert.rejects(api.getOrders('account', 'token', date), /Schwab read HTTP 503/);
    assert.equal(requests, 3);
});

test('a capped bracket response with fewer than 500 root orders is subdivided', async () => {
    const roots = Array.from({ length: 61 }, (_, id) => ({ orderId: id, enteredTime: burst + id,
        childOrderStrategies: Array.from({ length: 30 }, (_, child) => ({ orderId: 1000 + id * 30 + child })) }));
    let requests = 0;
    const api = new SchwabReadApi({ request: async url => {
        requests++;
        const query = new URL(url).searchParams;
        const from = Date.parse(query.get('fromEnteredTime')!), to = Date.parse(query.get('toEnteredTime')!);
        const matching = roots.filter(order => order.enteredTime >= from && order.enteredTime <= to);
        // The broker applies its limit to internal records before assembling
        // nested order trees, leaving fewer roots than maxResults.
        return { status: 200, body: JSON.stringify(matching.slice(-20)) };
    } });
    const orders = await api.getOrders('account', 'token', date);
    assert.ok(requests > 1);
    assert.equal(orders.length, roots.length);
    assert.deepEqual(new Set(orders.map(order => order.orderId)), new Set(roots.map(order => order.orderId)));
});

test('an unsplittable full page fails instead of returning a partial export', async () => {
    const body = JSON.stringify(Array.from({ length: 500 }, (_, orderId) => ({ orderId })));
    let requests = 0;
    const api = new SchwabReadApi({ request: async () => { requests++; return { status: 200, body }; } });
    await assert.rejects(api.getOrders('account', 'token', date), /one-millisecond window; read may be incomplete/);
    assert.ok(requests < 30);
});

test('older working trees outside the requested range do not force subdivision', async () => {
    const old = { orderId: 1, enteredTime: '2024-05-12T01:23:55+0000',
        childOrderStrategies: Array.from({ length: 600 }, (_, child) => ({ orderId: 1000 + child })) };
    let requests = 0;
    const api = new SchwabReadApi({ request: async () => {
        requests++; return { status: 200, body: JSON.stringify([old, { orderId: 2, enteredTime: `${date}T13:30:00+0000` }]) };
    } });
    const orders = await api.getOrders('account', 'token', date);
    assert.equal(requests, 1);
    assert.equal(orders.length, 2);
});
