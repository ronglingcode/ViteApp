import { readFileSync, writeFileSync } from 'node:fs';
import * as Schwab from '../src/trading/libraries/broker/schwab/streamingProtocol.ts';
import * as Massive from '../src/trading/libraries/massive/streamingProtocol.ts';
const info = { streamerSocketUrl: 'wss://fake.invalid', schwabClientCustomerId: 'customer', schwabClientCorrelId: 'correl', schwabClientChannel: 'channel', schwabClientFunctionId: 'function' };
const scenarios = [], t = Date.parse('2026-10-01T13:30:00Z');
const add = (name, kind, method, args) => scenarios.push({ name, kind, method, args, result: (kind === 'schwab' ? Schwab : Massive)[method](...args) });
add('schwab login', 'schwab', 'loginRequest', [info, 'fake-token']);
add('quotes subscribe', 'schwab', 'quoteSubscribeRequest', [info, ['AAPL', 'TSLA']]);
add('activity subscribe', 'schwab', 'activitySubscribeRequest', [info]);
add('quote zero size and partial fields', 'schwab', 'mapQuote', [{ key: 'AAPL', '1': 10, '4': 0 }]);
add('invalid quote field omitted', 'schwab', 'mapQuote', [{ key: 'AAPL', '2': '11', '5': null }]);
add('heartbeat', 'schwab', 'parseStreamMessage', [{ notify: [{ heartbeat: '0' }] }]);
add('successful login', 'schwab', 'parseStreamMessage', [{ response: [{ service: 'ADMIN', command: 'LOGIN', content: { code: 0 } }] }]);
add('failed login', 'schwab', 'parseStreamMessage', [{ response: [{ service: 'ADMIN', command: 'LOGIN', content: { code: 3 } }] }]);
add('missing code is failed login', 'schwab', 'parseStreamMessage', [{ response: [{ service: 'ADMIN', command: 'LOGIN' }] }]);
add('mixed quote and activity', 'schwab', 'parseStreamMessage', [{ data: [{ service: 'LEVELONE_EQUITIES', command: 'SUBS', content: [{ key: 'AAPL', '1': 10, '2': 11 }, { key: 'TSLA', '4': 0 }] }, { service: 'ACCT_ACTIVITY', command: 'SUBS', content: [{ key: 'account', '2': 'OrderAccepted' }] }] }]);
add('massive login', 'massive', 'loginRequest', ['fake-key']);
add('massive subscribe', 'massive', 'subscribeRequest', [['AAPL', 'TSLA']]);
add('massive connected is not authenticated', 'massive', 'parseStreamMessage', [[{ ev: 'status', status: 'connected' }]]);
add('massive login success', 'massive', 'parseStreamMessage', [[{ ev: 'status', status: 'auth_success' }]]);
add('massive login failure', 'massive', 'parseStreamMessage', [[{ ev: 'status', status: 'auth_failed' }]]);
add('massive prints and conditions', 'massive', 'parseStreamMessage', [[{ ev: 'T', sym: 'AAPL', p: 10, s: 100, t, q: 1, i: 'large-id', x: 2 }, { ev: 'T', sym: 'AAPL', p: 99, s: 100, t, c: [37] }]]);
add('premarket condition permitted', 'massive', 'parseStreamMessage', [[{ ev: 'T', sym: 'AAPL', p: 10, s: 100, t: t - 1, c: [37] }]]);
add('premarket fractional print uses exact size', 'massive', 'parseStreamMessage', [[{ ev: 'T', sym: 'AAPL', p: 10, s: 0, ds: '0.25', t: t - 1, c: [37] }]]);
add('null identifiers and malformed prints', 'massive', 'parseStreamMessage', [[{ ev: 'T', sym: 'AAPL', p: 10, s: 100, t, q: null, i: null }, { ev: 'T', sym: null, p: 10, s: 100, t }, { ev: 'T', sym: 'AAPL', p: 0, s: 100, t }]]);
const text = JSON.stringify(scenarios, null, 2) + '\n';
for (const url of [new URL('../src/trading/stream-fixtures.json', import.meta.url), new URL('../../bookmap-plugin/src/test/resources/stream-fixtures.json', import.meta.url)]) {
    if (process.argv.includes('--check')) { if (readFileSync(url, 'utf8') !== text) throw new Error(`Fixture drift: ${url}`); }
    else writeFileSync(url, text);
}
console.log(`Verified ${scenarios.length} vendor stream scenarios through production TS.`);
