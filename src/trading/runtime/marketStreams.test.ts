import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketStreams } from './marketStreams.ts';
import type { SocketHandlers, SocketConnection } from '../ports/socket.ts';

test('vendor lifecycle refreshes reconnect credentials, rejects failed login, and stops retries', async () => {
    const opened: { url: string; handlers: SocketHandlers; sent: any[]; socket: SocketConnection; closed: boolean }[] = [];
    const tasks: { run: () => void; delay: number; canceled: boolean }[] = [];
    const events: any[] = []; let tokens = 0;
    const streams = new MarketStreams({ open(url, handlers) {
        const item = { url, handlers, sent: [] as any[], socket: {} as SocketConnection, closed: false };
        item.socket = { send: message => item.sent.push(JSON.parse(message)), close: () => { item.closed = true; } };
        opened.push(item); return item.socket;
    } }, { after(delay, run) { const task = { delay, run, canceled: false }; tasks.push(task); return () => { task.canceled = true; }; } },
    ['AAPL', 'TSLA'], () => 'fake-key', async () => ({ token: `token-${++tokens}`, info: {
        streamerSocketUrl: 'wss://schwab.invalid', schwabClientCustomerId: 'customer', schwabClientCorrelId: 'correl', schwabClientChannel: 'channel', schwabClientFunctionId: 'function',
    } }), { trade: trade => events.push(['trade', trade]), quote: quote => events.push(['quote', quote]), activity: contents => events.push(['activity', contents]), ready: source => events.push(['ready', source]), status: (source, value) => events.push(['status', source, value]) });
    const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
    streams.start(); await settle(); assert.equal(opened.length, 2);
    const massive = opened[0], schwab = opened[1]; massive.handlers.opened(massive.socket); schwab.handlers.opened(schwab.socket);
    assert.equal(schwab.sent[0].parameters.Authorization, 'token-1');
    massive.handlers.message(massive.socket, JSON.stringify([{ ev: 'status', status: 'auth_success' }]));
    assert.equal(massive.sent[1].params, 'T.AAPL,T.TSLA');
    schwab.handlers.message(schwab.socket, JSON.stringify({ response: [{ service: 'ADMIN', command: 'LOGIN', content: { code: 3 } }] }));
    assert.equal(schwab.sent.length, 1); assert.equal(schwab.closed, true); assert.equal(tasks[0].delay, 1000);
    tasks[0].run(); await settle(); const replacement = opened[2]; replacement.handlers.opened(replacement.socket);
    assert.equal(replacement.sent[0].parameters.Authorization, 'token-2');
    replacement.handlers.message(replacement.socket, JSON.stringify({ response: [{ service: 'ADMIN', command: 'LOGIN', content: { code: 0 } }] }));
    assert.equal(replacement.sent.length, 3);
    replacement.handlers.message(replacement.socket, JSON.stringify({ data: [{ service: 'LEVELONE_EQUITIES', command: 'SUBS', content: [{ key: 'AAPL', '1': 10, '4': 0 }] }, { service: 'ACCT_ACTIVITY', content: [{ '2': 'OrderAccepted' }] }] }));
    assert.ok(events.some(event => event[0] === 'quote' && event[1].bidSize === 0));
    assert.ok(events.some(event => event[0] === 'activity'));
    const t = Date.parse('2026-10-01T13:30:00Z');
    massive.handlers.message(massive.socket, JSON.stringify([{ ev: 'T', sym: 'AAPL', p: 10, s: 100, t, q: 1 }, { ev: 'T', sym: 'AAPL', p: 99, s: 100, t, q: 2, c: [37] }]));
    assert.equal(events.filter(event => event[0] === 'trade').length, 1);
    replacement.handlers.closed(); assert.equal(tasks[1].delay, 1000);
    streams.close(); assert.equal(tasks[1].canceled, true); assert.equal(massive.closed, true);
    const count = events.length; replacement.handlers.message(replacement.socket, '{bad'); tasks[1].run(); await settle();
    assert.equal(opened.length, 3); assert.equal(events.length, count);
});
