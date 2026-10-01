import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { FirestoreApi } from '../src/trading/libraries/firestore/api.ts';
import { encodeFields, decodeFields } from '../src/trading/libraries/firestore/documentCodec.ts';
import { SchwabOAuth } from '../src/trading/libraries/broker/schwab/oauth.ts';
import { LogRepository } from '../src/trading/libraries/firestore/logRepository.ts';

const ok = value => ({ status: 200, body: JSON.stringify(value) });
const credentials = { appKey: 'test-app', secret: 'test-secret', access_token: 'old-access', refresh_token: 'old-refresh', expires_at: 0, accountHashValue: 'test-account' };
const state = { date: '2026-10-01', initialBalance: 10000.5, stateBySymbol: { AAPL: { long: { initialQuantity: 1000, partialsCount: 10, stopTightenPhase: 'needs_tighten' }, short: null } }, readOnlyStateBySymbol: {} };
const configFields = { activeProfileName: { stringValue: 'schwab' }, timestamp: { timestampValue: '2026-10-01T13:00:00.123456789Z' }, plans: { arrayValue: { values: [{ mapValue: { fields: { symbol: { stringValue: 'AAPL' }, atr: { doubleValue: 0.55 } } } }] } }, tradingSettings: { mapValue: { fields: { risk: { integerValue: '100' }, enabled: { booleanValue: true } } } } };
const fixtures = [
    { name: 'existing nested configuration document', kind: 'codec', method: 'decodeFields', args: [configFields], result: decodeFields(configFields) },
    { name: 'state payload matches Firebase Web SDK map schema', kind: 'codec', method: 'encodeFields', args: [state], result: encodeFields(state) },
    { name: 'encode SDK timestamp with full nanoseconds', kind: 'codec', method: 'encodeFields', args: [{ timestamp: { seconds: 1790859600, nanoseconds: 123456789 } }], result: encodeFields({ timestamp: { seconds: 1790859600, nanoseconds: 123456789 } }) },
    { name: 'empty array and map decode without fields', kind: 'codec', method: 'decodeFields', args: [{ list: { arrayValue: {} }, map: { mapValue: {} } }], result: decodeFields({ list: { arrayValue: {} }, map: { mapValue: {} } }) },
];
const firestoreCases = [
    { name: 'query only latest configuration snapshot', method: 'fetchConfigData', args: [], pages: [ok([{ readTime: '2026-10-01T14:00:00Z' }, { document: { fields: configFields } }])] },
    { name: 'missing trading-state document returns null', method: 'getTradingState', args: ['schwab'], pages: [{ status: 404, body: '{}' }] },
    { name: 'restore old trading-state maps', method: 'getTradingState', args: ['schwab'], pages: [ok({ fields: encodeFields(state) })] },
    { name: 'save complete state as existing setDoc behavior', method: 'setTradingState', args: ['schwab', state], pages: [ok({ fields: {} })] },
    { name: 'log writes with timestamp and TTL', method: 'addDocument', args: ['schwab-Logs', { msg: 'test', type: 'Info', timestamp: { seconds: 1, nanoseconds: 0 }, expiredAt: { seconds: 604801, nanoseconds: 0 } }], pages: [ok({ fields: {} })] },
    { name: 'configuration permissions failure remains visible', method: 'fetchConfigData', args: [], pages: [{ status: 403, body: 'test-firestore-key' }] },
    { name: 'empty configuration collection is an error', method: 'fetchConfigData', args: [], pages: [ok([{ readTime: '2026-10-01T14:00:00Z' }])] },
];
for (const fixture of firestoreCases) {
    const requests = [];
    const api = new FirestoreApi({ request: async (url, method, headers, body) => {
        const path = new URL(url); assert.equal(path.searchParams.get('key'), 'test-firestore-key');
        path.searchParams.delete('key'); requests.push({ path: path.pathname, method, headers, ...(body === undefined ? {} : { body: JSON.parse(body) }) });
        return fixture.pages[requests.length - 1];
    } }, 'test-project', () => 'test-firestore-key');
    let result, error;
    try { result = await api[fixture.method](...fixture.args); } catch (failure) { error = failure.message; }
    fixtures.push({ kind: 'firestore', ...fixture, requests, ...(error ? { error } : { result: result ?? null }) });
}
const oauthCases = [
    { name: 'refresh uses broker expiry and preserves old refresh token when omitted', method: 'refresh', args: [], credentials, pages: [ok({ access_token: 'new-access', expires_in: 1800 })] },
    { name: 'refresh persists rotated refresh token', method: 'refresh', args: [], credentials, pages: [ok({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 1200 })] },
    { name: 'valid token is reused without network', method: 'accessToken', args: [], credentials: { ...credentials, expires_at: 200000 }, pages: [] },
    { name: 'token near expiry refreshes', method: 'accessToken', args: [], credentials: { ...credentials, expires_at: 150000 }, pages: [ok({ access_token: 'new-access', expires_in: 600 })] },
    { name: 'revoked refresh token needs authorization without logging response', method: 'refresh', args: [], credentials, pages: [{ status: 400, body: 'test-secret' }] },
    { name: 'missing refresh token needs authorization', method: 'refresh', args: [], credentials: { ...credentials, refresh_token: '' }, pages: [] },
    { name: 'missing token expiry is invalid', method: 'refresh', args: [], credentials, pages: [ok({ access_token: 'new-access' })] },
    { name: 'manual callback exchanges decoded code and saves credentials', method: 'exchangeAuthorizationCode', args: ['https://127.0.0.1/?code=sample%40%2B&session=ignored'], credentials, pages: [ok({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 1800 })] },
];
for (const fixture of oauthCases) {
    let stored = structuredClone(fixture.credentials); const requests = [], saved = [];
    const client = new SchwabOAuth({ request: async (url, method, headers, body) => {
        requests.push({ path: new URL(url).pathname, method, headers, body }); return fixture.pages[requests.length - 1];
    } }, { loadSchwab: () => structuredClone(stored), saveSchwab: async value => { stored = structuredClone(value); saved.push(stored); } }, value => Buffer.from(value).toString('base64'), undefined, () => 100000);
    let result, error;
    try { result = await client[fixture.method](...fixture.args); } catch (failure) { error = failure.message; }
    fixtures.push({ kind: 'oauth', ...fixture, requests, saved, ...(error ? { error } : { result }) });
}
for (const fixture of [
    { name: 'notification log retains encoded message, date and seven-day TTL', method: 'log', args: ['Info', 'test message', { symbol: 'AAPL' }] },
    { name: 'order log retains payload and seven-day TTL', method: 'logOrder', args: [{ orderType: 'STOP', price: 10 }, { symbol: 'AAPL' }] },
    { name: 'breakout log retains state and three-day TTL', method: 'logBreakoutTradeState', args: ['AAPL', { quantity: 100 }] },
]) {
    const requests = [];
    const api = new FirestoreApi({ request: async (url, method, headers, body) => {
        requests.push({ path: new URL(url).pathname, method, headers, body: JSON.parse(body) }); return ok({ fields: {} });
    } }, 'test-project');
    const repository = new LogRepository(api, () => 'schwab', () => Date.parse('2026-10-01T13:30:00Z'));
    await repository[fixture.method](...fixture.args);
    fixtures.push({ kind: 'log', ...fixture, pages: [ok({ fields: {} })], requests, result: null });
}
const encoded = JSON.stringify(fixtures, null, 2) + '\n';
for (const file of [resolve(import.meta.dirname, '../src/trading/service-fixtures.json'), resolve(import.meta.dirname, '../../bookmap-plugin/src/test/resources/service-fixtures.json')]) {
    if (process.argv.includes('--check')) assert.equal(readFileSync(file, 'utf8').replaceAll('\r\n', '\n'), encoded, `Stale fixture ${file}`);
    else writeFileSync(file, encoded);
}
console.log(`Verified ${fixtures.length} Firestore/OAuth scenarios through production TS libraries.`);
