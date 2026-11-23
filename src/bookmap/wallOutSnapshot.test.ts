import assert from 'node:assert/strict';
import test from 'node:test';
import { WallOutSnapshotClient } from './wallOutSnapshot.ts';

test('matches concurrent depth replies by request and symbol, and consumes each only once', async () => {
    const client = new WallOutSnapshotClient(), messages: any[] = [];
    const socket = { readyState: 1, send: (text: string) => messages.push(JSON.parse(text)) };
    const a = client.request('AAPL', socket), b = client.request('MSFT', socket);
    const orderbook = { priceUnit: 'real' as const, tickSize: 0.01, largeAsks: [[100, 5000]] };
    assert.equal(client.receive({ type: 'unrelated' }), false);
    client.receive({ type: 'wall_out_snapshot', requestId: messages[0].requestId, symbol: 'MSFT', orderbook });
    client.receive({ ...messages[1], type: 'wall_out_snapshot', orderbook });
    assert.equal(await b, orderbook);
    client.receive({ ...messages[0], type: 'wall_out_snapshot', orderbook });
    assert.equal(await a, orderbook);
    client.receive({ ...messages[0], type: 'wall_out_snapshot', orderbook });
    client.disconnect();
});

test('disconnected requests fail and late replies cannot trigger an order', async () => {
    const client = new WallOutSnapshotClient();
    await assert.rejects(client.request('AAPL', null), /Connect Bookmap/);
    let sent: any;
    const result = client.request('AAPL', { readyState: 1, send: text => { sent = JSON.parse(text); } });
    const rejection = assert.rejects(result, /disconnected/);
    client.disconnect();
    await rejection;
    assert.equal(client.receive({ ...sent, type: 'wall_out_snapshot' }), true);
});
