import test from 'node:test';
import assert from 'node:assert/strict';
import { StopLossMonitor } from './stopLossMonitor.ts';
import { projectAccount } from '../../libraries/broker/schwab/accountProjection.ts';

const stop = (quantity: number, isBuy = false, orderID = 'stop') => ({ STOP: { orderID, quantity, price: 10, isBuy } });
const position = (netQuantity = 100, pairs: ReturnType<typeof stop>[] = []) => [{ symbol: 'OFF_WATCHLIST', netQuantity, pairs }];

test('persistent partial exposure closes full position once, strictly after ten seconds, long and short', () => {
    for (const net of [100, -100]) {
        const monitor = new StopLossMonitor(), snapshot = position(net, [stop(60, net < 0)]);
        assert.equal(monitor.observe(snapshot, 0).warnings[0].uncovered, 40);
        assert.deepEqual(monitor.observe(snapshot, 10_000).close, []);
        assert.deepEqual(monitor.observe(snapshot, 10_001).close, ['OFF_WATCHLIST']);
        assert.deepEqual(monitor.observe(snapshot, 30_000).close, []);
        monitor.observe([], 31_000);
        assert.equal(monitor.observe(snapshot, 32_000).warnings.length, 1);
    }
});

test('protection, flattening and direction changes reset the continuous exposure timer', () => {
    const monitor = new StopLossMonitor();
    monitor.observe(position(), 0);
    monitor.observe(position(100, [stop(100)]), 9000);
    monitor.observe(position(), 10_000);
    assert.deepEqual(monitor.observe(position(), 19_000).close, []);
    monitor.observe(position(-100), 20_000);
    assert.deepEqual(monitor.observe(position(-100), 30_000).close, []);
    monitor.observe(position(0), 30_001);
    assert.equal(monitor.monitoring, false);
});

test('wrong-side, duplicate, inactive stops and limit-only partials do not hide uncovered shares', () => {
    const monitor = new StopLossMonitor();
    const pairs = [stop(30), stop(30), stop(100, true, 'wrong'), { LIMIT: { quantity: 100 } },
        { STOP: { ...stop(100).STOP, orderID: 'inactive', rawOrder: { status: 'AWAITING_PARENT_ORDER' } } }];
    assert.equal(monitor.observe([{ symbol: 'A', netQuantity: 100, pairs }], 0).warnings[0].uncovered, 70);
});

test('standalone closing stops cover remaining shares; canceled stops and entry orders do not', () => {
    const makeOrder = (id: number, status = 'WORKING', effect = 'CLOSING') => ({ orderId: id, status, orderStrategyType: 'SINGLE', orderType: 'STOP', quantity: 100, filledQuantity: 25, stopPrice: 10,
        orderLegCollection: [{ instruction: 'SELL', positionEffect: effect, instrument: { symbol: 'A', assetType: 'EQUITY' } }] });
    const account = projectAccount({ positions: [{ instrument: { symbol: 'A' }, longQuantity: 75 }], currentBalances: { liquidationValue: 25000 } },
        [makeOrder(1), makeOrder(2, 'CANCELED'), makeOrder(3, 'WORKING', 'OPENING')], '2026-10-16');
    assert.equal(account.exitPairs.A.length, 1);
    assert.equal(account.exitPairs.A[0].STOP?.quantity, 75);
    assert.deepEqual(new StopLossMonitor().observe([{ symbol: 'A', netQuantity: 75, pairs: account.exitPairs.A }], 0).warnings, []);
});
