import test from 'node:test';
import assert from 'node:assert/strict';
import { SelectedStop, StopClaims } from './selectedStop.ts';

test('selection expires at five seconds, clears on use and cannot cross symbols', () => {
    let time = 0; const stop = new SelectedStop(() => time);
    assert.throws(() => stop.consume('AAPL'), /Select stop/);
    stop.select('AAPL', 99); time = 4999; assert.equal(stop.peek('AAPL'), 99);
    time = 5000; assert.equal(stop.peek('AAPL'), undefined);
    stop.select('AAPL', 98); assert.throws(() => stop.consume('MSFT'), /Select stop/);
    assert.equal(stop.peek('AAPL'), undefined);
    stop.select('AAPL', 97); const claim = stop.consume('AAPL');
    assert.equal(claim.price, 97); assert.throws(() => stop.consume('AAPL'), /Select stop/);
    stop.clear();
});
test('each opening action needs a fresh stop and submits the exact price only once', () => {
    for (const isLong of [true, false]) {
        const stop = new SelectedStop(); const claims = new StopClaims(stop); const action = {};
        assert.throws(() => claims.submit(action, 'AAPL', isLong, 100, 99), /Select stop/);
        const price = isLong ? 99 : 101;
        stop.select('AAPL', price);
        assert.equal(claims.prepare(action, 'AAPL', isLong, 100).price, price);
        assert.equal(stop.peek('AAPL'), undefined);
        assert.throws(() => claims.prepare({}, 'AAPL', isLong, 100), /Select stop/);
        assert.throws(() => claims.submit(action, 'AAPL', isLong, 100, price + .01), /selected stop price/);
        claims.submit(action, 'AAPL', isLong, 100, price);
        assert.throws(() => claims.submit(action, 'AAPL', isLong, 100, price), /used or expired/);
    }
});
test('delayed swaps cannot revive a stop and a wrong-side attempt consumes the selection', () => {
    let time = 0; const stop = new SelectedStop(() => time), claims = new StopClaims(stop), swap = {};
    stop.select('AAPL', 99); claims.prepare(swap, 'AAPL', true, 100);
    time = 5000; stop.select('AAPL', 98);
    assert.throws(() => claims.prepare(swap, 'AAPL', true, 100), /expired/);
    assert.throws(() => claims.prepare({}, 'AAPL', false, 100), /above short/);
    assert.equal(stop.peek('AAPL'), undefined);
});
test('line notifications follow replacement, consumption and clearing without touching orders', () => {
    const stop = new SelectedStop(); const changes: unknown[] = [];
    stop.onChange(value => changes.push(value ? { ...value } : undefined));
    stop.select('AAPL', 99); stop.select('AAPL', 98); stop.consume('AAPL');
    assert.deepEqual(changes.map(value => value && (value as {price: number}).price), [99, undefined, 98, undefined]);
});
