import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TradingRuntime } from './tradingRuntime.ts';
import { encodeFields, decodeFields } from '../libraries/firestore/documentCodec.ts';
import type { SocketHandlers } from '../ports/socket.ts';

test('standalone startup owns services, renewal, restored state and teardown without browser/proxy', async () => {
    const fixtures = JSON.parse(readFileSync(new URL('../state-fixtures.json', import.meta.url), 'utf8'));
    const config = fixtures.find((f: any) => f.name === 'stock selections config').args[0];
    const saved = fixtures.find((f: any) => f.name === 'new state and accepted entry').result;
    let time = Date.parse('2026-10-01T13:32:00Z'), refreshes = 0, accountReads = 0, writes = 0, audits = 0, limited = false;
    let credentials = { appKey: 'fake-app', secret: 'fake-secret', access_token: 'expired', refresh_token: 'fake-refresh', expires_at: 0, accountHashValue: 'fake-account' };
    const emitted: any[] = [], inputs: any[] = [], logs: string[] = [], tasks: any[] = [], sockets: any[] = [];
    const account = { positions: [] as any[], currentBalances: { liquidationValue: 25000 } };
    const runtime = new TradingRuntime({ request: async (url, method, headers, body) => {
        assert.ok(!url.includes('localhost')); const path = new URL(url).pathname;
        if (path.endsWith('/oauth/token')) { refreshes++; return { status: 200, body: JSON.stringify({ access_token: `fresh-${refreshes}`, refresh_token: `rotated-${refreshes}`, expires_in: 1800 }) }; }
        if (path.endsWith(':runQuery')) return { status: 200, body: JSON.stringify([{ document: { fields: encodeFields(config) } }]) };
        if (path.endsWith('/tradingState')) { if (method === 'PATCH') { assert.equal(decodeFields(JSON.parse(body!).fields).date, saved.date); writes++; return { status: 200, body: '{}' }; } return { status: 200, body: JSON.stringify({ fields: encodeFields(saved) }) }; }
        if (path.endsWith('/accounts')) { accountReads++; if (limited) return { status: 429, body: '', headers: { 'Retry-After': '60' } }; return { status: 200, body: JSON.stringify([{ securitiesAccount: account }]) }; }
        if (path.endsWith('/orders')) return { status: 200, body: '[]' };
        if (path.endsWith('/userPreference')) return { status: 200, body: JSON.stringify({ streamerInfo: [{ streamerSocketUrl: 'wss://fake.invalid', schwabClientCustomerId: 'customer', schwabClientCorrelId: 'correl', schwabClientChannel: 'channel', schwabClientFunctionId: 'function' }] }) };
        if (path.includes('/reference/')) return { status: 200, body: JSON.stringify({ results: { weighted_shares_outstanding: 1e9 } }) };
        if (path.includes('/v3/trades/')) return { status: 200, body: '{"results":[]}' };
        if (path.includes('/aggs/')) return { status: 200, body: JSON.stringify({ results: [{ t: Date.parse('2026-10-01T13:00:00Z'), o: 10, h: 11, l: 9, c: 10, v: 1e6, vw: 10 }, { t: Date.parse('2026-10-01T13:30:00Z'), o: 10, h: 11, l: 9, c: 10, v: 2e6, vw: 10 }] }) };
        if (path.endsWith('-Logs') || path.endsWith('-Orders') || path.endsWith('/BreakoutTradeState')) { audits++; assert.ok(!body!.includes('fake-secret') && !body!.includes('fake-refresh')); return { status: 201, body: '{}' }; }
        throw new Error(`Unexpected fake route ${path}`);
    } }, { loadSchwab: () => credentials, saveSchwab: async value => { credentials = value as typeof credentials; } },
    { firebaseConfig: { projectId: 'fake-project', apiKey: 'fake-firebase' }, massive: { apiKey: 'fake-massive' } },
    { open: (url, handlers: SocketHandlers) => { const socket = { url, handlers, closed: false, send: (_value: string) => {}, close() { this.closed = true; } }; sockets.push(socket); return socket; } },
    { after: (delay, run) => { const task = { delay, run, canceled: false }; tasks.push(task); return () => { task.canceled = true; }; } },
    { receive: value => inputs.push(value), route: () => true, close: () => emitted.push('closed') },
    { message: value => emitted.push(value), log: (_symbol, value) => logs.push(value), notify: () => {} }, value => Buffer.from(value).toString('base64'), () => time);
    await runtime.start(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(refreshes, 1); assert.equal(sockets.length, 2); assert.equal(accountReads, 1);
    const context = [...inputs].reverse().find(value => value.type === 'execution_state').symbols[0];
    assert.equal(context.entryContext.watchlistBlockReason, ''); assert.equal(context.hasPlan, false);
    assert.equal(runtime.view('AAPL', 'test').state.stateBySymbol.AAPL.breakoutTradeStateForLong.initialQuantity, 100);
    runtime.persistState(); await runtime.pendingPersistence(); assert.equal(writes, 1);
    time += 1800e3; await runtime.refreshToken(); assert.equal(refreshes, 2); assert.equal(inputs.at(-1).accessToken, 'fresh-2');
    await runtime.refreshAccount(); assert.equal(accountReads, 2);
    runtime.dispatch({ type: 'manual_inputs', symbol: 'AAPL', customEntryPrice: 11, fixedQuantity: 20 }); await runtime.pendingPersistence();
    assert.equal(runtime.manualInputs('AAPL').fixedQuantity, 20); runtime.dispatch({ symbol: 'AAPL', keyCode: 'Space' }); assert.deepEqual(runtime.manualInputs('AAPL'), { fixedQuantity: 20 });
    await Promise.all(Array.from({ length: 10 }, () => runtime.refreshAccount())); assert.equal(accountReads, 2);
    assert.equal(tasks.filter(task => task.delay === 3000 && !task.canceled).length, 1);
    const deferred = tasks.find(task => task.delay === 3000 && !task.canceled); deferred.canceled = true; limited = true; time += 3000; deferred.run(); await new Promise(resolve => setImmediate(resolve)); assert.equal(accountReads, 3);
    await runtime.refreshAccount(); assert.equal(accountReads, 3); const retry = tasks.find(task => task.delay === 60000 && !task.canceled && task !== tasks.find(task => task.delay === 60000));
    assert.ok(retry); retry.canceled = true; limited = false; time += 60000; retry.run(); await new Promise(resolve => setImmediate(resolve)); assert.equal(accountReads, 4);
    account.positions = [{ instrument: { symbol: 'MSFT', assetType: 'EQUITY' }, longQuantity: 10, shortQuantity: 0, averagePrice: 20 }]; time += 3000; await runtime.refreshAccount();
    assert.equal(inputs.at(-1).symbols[0].symbol, 'MSFT'); assert.equal(inputs.at(-1).symbols[0].netQuantity, 10);
    account.positions = []; time += 3000; await runtime.refreshAccount(); assert.equal(inputs.at(-1).symbols[0].netQuantity, 0);
    config.stockSelections = []; await runtime.refreshConfig(); assert.equal(runtime.view('AAPL', 'test').plan, undefined);
    assert.equal(inputs.filter(input => input.type === 'execution_state' && input.symbols[0].symbol === 'AAPL').at(-1).symbols[0].entryContext, undefined);
    assert.ok(audits > 0);
    runtime.close(); assert.ok(sockets.every(socket => socket.closed)); assert.ok(tasks.every(task => task.canceled));
    const count = inputs.length, reads = accountReads; for (const task of tasks) task.run(); await runtime.refreshAccount(); assert.equal(inputs.length, count); assert.equal(accountReads, reads);
    assert.ok(logs.every(value => !value.includes('fake-secret') && !value.includes('fake-refresh')));
});
