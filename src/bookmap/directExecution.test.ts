import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { selectEntryOrdersToCancel } from '../controllers/cancelPendingEntries.ts';
import { createClosingEquityOrder } from '../api/schwab/closingOrderFactory.ts';
import { getFirstSmallestQuantityExitPairIndex } from '../utils/exitPairSelection.ts';
import { evaluateCoreTargetRule } from '../controllers/coreTargetRule.ts';
import { recordBrokerObservation, getBrokerObservation,
    canApplyBrokerObservation, recordExecutionToken, getExecutionToken } from './executionMetadata.ts';
import { registerExecutionMarketDataPublisher, publishExecutionMarketData } from './executionMarketData.ts';
import { describeError, readBrokerJson, brokerResponseError, fetchBrokerResponse } from '../utils/errorDetails.ts';

const fixtures = JSON.parse(readFileSync(new URL('./direct-execution-fixtures.json', import.meta.url), 'utf8'));
test('diagnostics retain the request, HTTP error text and exception causes without credentials', async () => {
    const root = new Error('TLS certificate not trusted; Authorization: Bearer fake-access-token');
    const error = new Error('GET account positions failed', { cause: root });
    const text = describeError(error);
    assert.match(text, /GET account positions failed.*caused by.*TLS certificate not trusted/);
    assert.ok(!text.includes('fake-access-token'));
    assert.match(JSON.stringify({ msg: text }), /TLS certificate not trusted/); // Saved logs keep the Error message.
    await assert.rejects(fetchBrokerResponse('GET Schwab accounts', Promise.reject(new TypeError('connection refused'))),
        error => describeError(error).includes('GET Schwab accounts failed; caused by TypeError: connection refused'));
    const response = new Response('<html>gateway denied the request</html>', { status: 502 });
    await assert.rejects(readBrokerJson(response, 'GET Schwab orders'),
        error => /GET Schwab orders HTTP 502.*gateway denied the request.*caused by/.test(describeError(error)));
    const rejection = brokerResponseError('POST new order', new Response('', { status: 400 }), {
        message: 'Insufficient buying power', access_token: 'another-token', refreshToken: 'refresh-value',
    });
    const detail = describeError(rejection);
    assert.match(detail, /POST new order HTTP 400.*Insufficient buying power/);
    assert.ok(!detail.includes('another-token')); assert.ok(!detail.includes('refresh-value'));
});
test('market handlers publish the complete latest bundle synchronously, without an account update', () => {
    const received: any[] = [];
    registerExecutionMarketDataPublisher(data => received.push(data));
    const data = { bidPrice: 10, askPrice: 10.02, highOfDay: 10.1, lowOfDay: 9.5 };
    publishExecutionMarketData('AAPL', 10.01, data);
    assert.deepEqual(received, [{ symbol: 'AAPL', currentPrice: 10.01, bid: 10, ask: 10.02,
        highOfDay: 10.1, lowOfDay: 9.5 }]);
    data.bidPrice = 10.03; data.askPrice = 10.05; data.highOfDay = 10.2;
    publishExecutionMarketData('AAPL', 10.2, data);
    assert.equal(received.length, 2);
    assert.equal(received[1].bid, 10.03); assert.equal(received[1].highOfDay, 10.2);
    assert.equal(received[0].bid, 10); // Earlier messages keep their values.
});
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
test('out-of-order broker reads cannot overwrite a newer observation', () => {
    const target = new EventTarget();
    Object.defineProperty(globalThis, 'window', { value: target, configurable: true });
    try {
        recordBrokerObservation(200);
        assert.equal(canApplyBrokerObservation(100), false);
        recordBrokerObservation(100);
        assert.equal(getBrokerObservation()?.startedAt, 200);
        recordExecutionToken('fake-token', 120);
        const first = getExecutionToken()!;
        recordExecutionToken('replacement-fake-token', 120);
        assert.ok(getExecutionToken()!.generation > first.generation);
        assert.ok(getExecutionToken()!.expiresAt > Date.now());
        assert.throws(() => recordExecutionToken('invalid-token', Number.NaN));
    } finally { Reflect.deleteProperty(globalThis, 'window'); }
});
