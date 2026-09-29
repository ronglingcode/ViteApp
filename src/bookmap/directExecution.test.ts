import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { selectEntryOrdersToCancel } from '../controllers/cancelPendingEntries.ts';
import { createClosingEquityOrder } from '../api/schwab/closingOrderFactory.ts';
import { getFirstSmallestQuantityExitPairIndex } from '../utils/exitPairSelection.ts';
import { evaluateCoreTargetRule } from '../controllers/coreTargetRule.ts';
import { configureExecutionFence, withLegacyBrokerMutation, getLegacyBrokerMutationsInFlight,
    needsNativeExecutionFence } from './executionFence.ts';
import { recordExecutionQuote, getExecutionQuoteTime, recordBrokerObservation, getBrokerObservation,
    canApplyBrokerObservation, recordExecutionToken, getExecutionToken } from './executionMetadata.ts';

const fixtures = JSON.parse(readFileSync(new URL('./direct-execution-fixtures.json', import.meta.url), 'utf8'));
test('sanitized native fixtures agree with the production TS decisions and closing payloads', () => {
    for (const fixture of fixtures) {
        const { state, checks, requests } = fixture;
        if (checks.cancel) assert.deepEqual(selectEntryOrdersToCancel(state.entries, state.pairs.length, state.batchCount)
            .map((order: any) => order.orderID), requests.map((request: any) => request.orderId), fixture.name);
        if (checks.smallest) {
            const index = getFirstSmallestQuantityExitPairIndex(state.pairs);
            assert.equal(state.pairs[index].LIMIT.orderID, requests[0].orderId, fixture.name);
        }
        if (checks.core) assert.equal(evaluateCoreTargetRule({
            isLong: state.netQuantity > 0, entryPrice: state.entryPrice, coreTarget: state.coreTarget,
            coreCount: state.coreCount, partialNumber: checks.core.partial, proposedExitPrice: checks.core.price,
            makesExitEarlier: checks.core.earlier,
        }).allowed, checks.core.allowed, fixture.name);
        for (const request of requests) if (request.body) {
            const order = request.body;
            const leg = order.orderLegCollection[0];
            assert.deepEqual(order, createClosingEquityOrder(state.symbol, order.orderType, leg.quantity,
                order.stopPrice ?? order.price ?? 0, leg.instruction === 'BUY_TO_COVER'), fixture.name);
            assert.ok(['SELL', 'BUY_TO_COVER'].includes(leg.instruction), fixture.name);
        }
    }
});
test('browser broker mutations wait for the native fence and always release it', async () => {
    const events: string[] = [];
    let grant: (() => void) | undefined;
    configureExecutionFence(() => new Promise(resolve => { grant = () => resolve(outcome => events.push(outcome)); }));
    const mutation = withLegacyBrokerMutation(async () => { events.push('broker'); return 7; });
    assert.equal(getLegacyBrokerMutationsInFlight(), 1);
    assert.deepEqual(events.slice(), []);
    grant!(); assert.equal(await mutation, 7);
    assert.deepEqual(events.slice(), ['broker', 'complete']); assert.equal(getLegacyBrokerMutationsInFlight(), 0);
    configureExecutionFence(async () => outcome => events.push(outcome));
    await assert.rejects(withLegacyBrokerMutation(async () => { throw new Error('network'); }));
    assert.equal(events.at(-1), 'unknown');
    configureExecutionFence(async () => { throw new Error('unresolved native action'); });
    await assert.rejects(withLegacyBrokerMutation(async () => { events.push('must not run'); }));
    assert.ok(!events.includes('must not run')); assert.equal(getLegacyBrokerMutationsInFlight(), 0);
    configureExecutionFence(undefined);
});
test('unpaired idle native execution leaves legacy broker entries available', () => {
    assert.equal(needsNativeExecutionFence({
        enabled: true, hasSession: false, ownershipPending: false, requiresReview: false, pairingConfigured: false,
    }), false);
    assert.equal(needsNativeExecutionFence({
        enabled: true, hasSession: false, ownershipPending: false, requiresReview: false, pairingConfigured: true,
    }), true);
    assert.equal(needsNativeExecutionFence({
        enabled: true, hasSession: false, ownershipPending: true, requiresReview: false, pairingConfigured: false,
    }), true);
    assert.equal(needsNativeExecutionFence({
        enabled: false, hasSession: false, ownershipPending: false, requiresReview: true, pairingConfigured: false,
    }), true);
});
test('broker and quote provenance cannot be refreshed by cached or out-of-order data', () => {
    const target = new EventTarget();
    Object.defineProperty(globalThis, 'window', { value: target, configurable: true });
    try {
        recordBrokerObservation('test-hash', 200);
        assert.equal(canApplyBrokerObservation('test-hash', 100), false);
        recordBrokerObservation('test-hash', 100);
        assert.equal(getBrokerObservation()?.startedAt, 200);
        recordExecutionQuote('TEST', true, false, 100);
        assert.equal(getExecutionQuoteTime('TEST'), 0);
        recordExecutionQuote('TEST', false, true, 150);
        assert.equal(getExecutionQuoteTime('TEST'), 100);
        recordExecutionQuote('TEST', true, true, 90);
        assert.equal(getExecutionQuoteTime('TEST'), 100);
        recordExecutionToken('fake-token', 120);
        const first = getExecutionToken()!;
        recordExecutionToken('replacement-fake-token', 120);
        assert.ok(getExecutionToken()!.generation > first.generation);
        assert.ok(getExecutionToken()!.expiresAt > Date.now());
        assert.throws(() => recordExecutionToken('invalid-token', Number.NaN));
    } finally { Reflect.deleteProperty(globalThis, 'window'); }
});
