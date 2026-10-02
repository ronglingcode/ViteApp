import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { IntegrationHealth, integrationHealth, maskedBalance } from '../src/health/integrationHealth.ts';
import { massiveStreamStatus } from '../src/health/massiveStreamStatus.ts';
import { ObservedMassiveApi } from '../src/health/observedMassiveApi.ts';
import { createMassiveTimeSale } from '../src/streaming/timeSaleParse.ts';
import { readHttp } from '../src/health/readHttp.ts';

const now = Date.parse('2026-10-01T13:30:00Z');
const account = { currentBalances: { liquidationValue: 1234.56, cashBalance: 0 }, positions: [] };
function load(file, mocks, globals = {}) {
    const js = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', ...Object.keys(globals), js)(
        name => { if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`); return mocks[name]; },
        module, module.exports, ...Object.values(globals));
    return module.exports;
}

test('zero cash/empty or omitted positions still prove a valid Schwab connection', () => {
    const health = new IntegrationHealth();
    health.begin(health.account, now); health.accountSuccess(account, now);
    assert.equal(health.readView(health.account, 90000, now).color, 'healthy');
    assert.equal(health.positionCount, 0); assert.equal(health.cash, 0);
    assert.equal(maskedBalance(health.balance), '…234.56');
    health.accountSuccess({ currentBalances: { liquidationValue: 0, cashBalance: 0 } }, now);
    assert.equal(health.balance, 0); assert.equal(health.positionCount, 0);
    assert.throws(() => health.accountSuccess({ positions: [] }), /valid balances/);
    assert.throws(() => health.accountSuccess({ ...account, positions: {} }), /positions/);
});

test('read failures remain visible with the last balance, and valid recovery clears the error', () => {
    const health = new IntegrationHealth();
    health.accountSuccess(account, now);
    assert.equal(health.readView(health.account, 90000, now + 90001).text, 'Stale');
    for (const message of ['Schwab read HTTP 401', 'Schwab read HTTP 429', 'API read timed out after 15s']) {
        health.fail(health.account, new Error(message));
        assert.equal(health.readView(health.account, 90000, now).color, 'failed');
        assert.equal(health.balance, 1234.56);
        health.accountSuccess(account, now);
        assert.equal(health.readView(health.account, 90000, now).color, 'healthy');
    }
});

test('authentication and subscription acceptance do not prove receiving trades', () => {
    const health = new IntegrationHealth(); health.startStream(['AAPL'], now);
    for (const status of [{ status: 'connected' }, { status: 'auth_success' }, { status: 'success', message: 'subscribed to: T.AAPL' }]) {
        const result = massiveStreamStatus(status); health.streamPhase(result.phase, result.error, now);
        assert.notEqual(health.streamView(now).color, 'healthy');
    }
    const failed = massiveStreamStatus({ status: 'auth_failed', message: 'invalid API key' });
    health.streamPhase(failed.phase, failed.error, now);
    assert.equal(health.streamView(now).color, 'failed');
    health.startStream([], now); assert.equal(health.streamView(now).text, 'No symbols subscribed');
});

test('fresh receipts with delayed event times cannot look live; stale prints, recovery, disconnect and restart', () => {
    const health = new IntegrationHealth(); health.startStream(['AAPL'], now);
    health.receiveTrades([{ symbol: 'AAPL', timestamp: now - 16 * 60000, receivedAt: now }]);
    assert.equal(health.streamView(now).text, 'Delayed trades');
    health.receiveTrades([{ symbol: 'AAPL', timestamp: now, receivedAt: now }]);
    assert.equal(health.streamView(now).color, 'healthy');
    assert.equal(health.streamView(now + 15001).text, 'No recent trades');
    health.receiveTrades([{ symbol: 'AAPL', timestamp: now + 15001, receivedAt: now + 15001 }]);
    assert.equal(health.streamView(now + 15001).color, 'healthy');
    health.streamPhase('disconnected');
    health.receiveTrades([{ symbol: 'AAPL', timestamp: now + 20000, receivedAt: now + 20000 }]);
    assert.equal(health.streamView(now + 20000).text, 'Disconnected');
    health.startStream(['AAPL'], now + 20000);
    assert.equal(health.stream.trades.size, 0);
    health.streamPhase('subscribed'); assert.equal(health.streamView(now + 20000).text, 'Waiting for trades');
});

test('invalid, unrelated and out-of-order trades; future timestamps flag clock differences', () => {
    const health = new IntegrationHealth(); health.startStream(['AAPL'], now);
    health.receiveTrades([{ symbol: 'SPY', timestamp: now, receivedAt: now }, { symbol: 'AAPL', timestamp: 0, receivedAt: now }]);
    assert.equal(health.stream.trades.size, 0);
    health.receiveTrades([{ symbol: 'AAPL', timestamp: now, receivedAt: now }]);
    health.receiveTrades([{ symbol: 'AAPL', timestamp: now - 10000, receivedAt: now + 1000 }]);
    assert.equal(health.stream.trades.get('AAPL').timestamp, now);
    health.receiveTrades([{ symbol: 'AAPL', timestamp: now + 6000, receivedAt: now }]);
    assert.equal(health.streamView(now).text, 'Check local clock');
});

test('new trade receipts prove recovery, while queued receipts predating a stream failure do not', () => {
    const health = new IntegrationHealth(); health.startStream(['AAPL'], now);
    health.streamPhase('failed', 'socket error', now + 1000);
    health.receiveTrades([{ symbol: 'AAPL', timestamp: now, receivedAt: now }]);
    assert.equal(health.streamView(now + 1000).color, 'failed');
    health.receiveTrades([{ symbol: 'AAPL', timestamp: now + 2000, receivedAt: now + 2000 }]);
    assert.equal(health.streamView(now + 2000).color, 'healthy');
});

test('Massive history is observed only after all pages succeed, with empty and failed responses distinguished', async () => {
    const page = { status: 'OK', results: [{ t: now, o: 10, h: 11, l: 9, c: 10, v: 100 }] };
    let calls = 0;
    const api = new ObservedMassiveApi({ request: async () => {
        calls++; return { status: calls === 2 ? 401 : 200, body: JSON.stringify({ ...page, next_url: '/second' }) };
    } }, () => 'fixture-key');
    await assert.rejects(api.getBars('AAPL', '/first'), /HTTP 401/);
    assert.equal(integrationHealth.history.lastSuccess, undefined);
    assert.equal(integrationHealth.history.pending, 0);
    const emptyApi = new ObservedMassiveApi({ request: async () => ({ status: 200, body: '{"status":"OK"}' }) }, () => 'fixture-key');
    await emptyApi.getBars('SPY', '/empty');
    assert.equal(integrationHealth.readView(integrationHealth.history, 180000).text, 'No bars returned');
    const goodApi = new ObservedMassiveApi({ request: async () => ({ status: 200, body: JSON.stringify(page) }) }, () => 'fixture-key');
    await goodApi.getBars('AAPL', '/good');
    assert.equal(integrationHealth.readView(integrationHealth.history, 180000).color, 'healthy');
});

test('actual Schwab adapter coalesces account reads and account success survives an order-history failure', async () => {
    const health = new IntegrationHealth(); let reads = 0;
    const globals = { window: { location: { hostname: 'localhost' }, HybridApp: { Secrets: { schwab: { accessToken: 'fixture' } } } } };
    const api = load('../src/api/schwab/api.ts', {
        '../../trading/libraries/broker/schwab/readApi.ts': { SchwabReadApi: class {
            async getAccount() { reads++; await Promise.resolve(); return account; }
            async getOrders() { throw new Error('Schwab read HTTP 500'); }
        } },
        '../../trading/libraries/broker/schwab/accountProjection.ts': {}, '../../trading/adapters/browserAccount.ts': {},
        '../../trading/libraries/broker/schwab/oauth.ts': { SchwabOAuth: class {} },
        '../../trading/adapters/browserCredentials.ts': {}, '../../trading/adapters/browserHttp.ts': {},
        '../../health/readHttp.ts': {}, '../../health/integrationHealth.ts': { integrationHealth: health, errorMessage: error => error.message },
        '../../utils/webRequest': {}, '../../utils/helper': {}, '../../utils/timeHelper': { getTodayString: () => '2026-10-01' },
        '../../config/secret': { schwab: () => ({ accountHash: 'fixture' }) }, '../../models/models': {}, '../../firestore': {},
        '../../config/config': { Settings: { fetchOrdersByTimeWindows: false } }, './orderFactory': {},
        '../../config/globalSettings': {}, '../../trading/adapters/browserBrokerMetadata': {}, '../../utils/errorDetails': {},
    }, globals);
    await Promise.all([api.checkAccountConnection(), api.checkAccountConnection()]);
    assert.equal(reads, 1); assert.equal(health.positionCount, 0);
    await assert.rejects(api.getAccountInfo(), /HTTP 500/);
    assert.equal(health.readView(health.account, 90000).color, 'healthy');
    assert.equal(globals.window.HybridApp.AccountCache, undefined);
    const credentials = globals.window.HybridApp.Secrets;
    globals.window.HybridApp.Secrets = undefined;
    await assert.rejects(api.checkAccountConnection());
    assert.equal(health.account.pending, 0);
    globals.window.HybridApp.Secrets = credentials;
    await api.checkAccountConnection();
    assert.equal(health.readView(health.account, 90000).color, 'healthy');
});

test('actual worker emits Massive lifecycle status and includes filtered valid trades', () => {
    const messages = []; const sockets = []; let onMessage;
    class Socket {
        static OPEN = 1; readyState = 1;
        constructor() { sockets.push(this); } send() {} close() { this.onclose?.(); }
    }
    load('../src/workers/marketDataWorker.ts', {
        '../streaming/levelOneQuoteParse': {}, '../streaming/timeSaleParse': { createMassiveTimeSale },
        './tradeFlushBuffer': { TradeFlushBuffer: class {
            constructor(post) { this.post = post; } start() {} stop() {}
            push(trade, source) { this.post({ type: 'timeSaleFlush', source, trades: [trade] }); }
        } }, '../trading/libraries/broker/schwab/streamingProtocol.ts': {}, '../health/massiveStreamStatus.ts': { massiveStreamStatus },
    }, { WebSocket: Socket, self: { postMessage: message => messages.push(message), addEventListener: (_type, callback) => { onMessage = callback; } } });
    onMessage({ data: { type: 'start', payload: { symbols: ['AAPL'], massive: { authParams: 'fixture' } } } });
    const socket = sockets[0]; socket.onopen();
    socket.onmessage({ data: JSON.stringify([{ ev: 'status', status: 'auth_success' }, { ev: 'T', sym: 'AAPL', t: now, p: 10, s: 100, c: [2] }]) });
    assert.deepEqual(messages.filter(m => m.type === 'massiveHealth').map(m => m.phase), ['authenticating', 'subscribing']);
    const trade = messages.find(m => m.type === 'timeSaleFlush').trades[0];
    assert.equal(trade.shouldFilter, true); assert.equal(trade.record.timestamp, now);
    socket.onerror(); socket.onclose();
    assert.deepEqual(messages.slice(-2).map(m => m.phase), ['failed', 'disconnected']);
});

test('fallback stream records valid receipts before chart filtering and reports socket failure', async () => {
    const health = new IntegrationHealth(); let socket;
    const api = load('../src/api/massive/streaming.ts', {
        '../../config/secret': { massive: () => ({ apiKey: 'fixture' }) },
        '../../models/models': { getWatchlist: () => [{ symbol: 'AAPL' }] },
        '../../streaming/timeSaleParse': { createMassiveTimeSale }, '../../data/db': { tryUpdateMaxTimeSaleTimestamp: () => false },
        '../../health/integrationHealth.ts': { integrationHealth: health }, '../../health/massiveStreamStatus.ts': { massiveStreamStatus },
    }, { WebSocket: class { constructor() { socket = this; } send() {} } });
    await api.createWebSocket(); socket.onopen();
    socket.onmessage({ data: JSON.stringify([{ ev: 'T', sym: 'AAPL', t: now, p: 10, s: 100, c: [2] }]) });
    assert.equal(health.stream.trades.get('AAPL').timestamp, now);
    socket.onerror(); socket.onclose(); assert.equal(health.stream.phase, 'failed');
});

test('read transport failures are bounded and never expose URLs or credentials', async () => {
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => { throw new Error('https://example.com?apiKey=secret'); };
        await assert.rejects(readHttp.request('https://fixture', 'GET', {}), error => error.message === 'API read failed before a response');
    } finally { globalThis.fetch = originalFetch; }
});

test('timed-out reads abort the fetch and release the timeout', async () => {
    let cleared = false;
    const http = load('../src/health/readHttp.ts', {}, {
        AbortController, setTimeout: callback => { callback(); return 123; }, clearTimeout: id => { cleared = id === 123; },
        fetch: async (_url, options) => { assert.equal(options.signal.aborted, true); throw new Error('aborted'); },
    });
    await assert.rejects(http.readHttp.request('https://fixture', 'GET', {}), /timed out after 15s/);
    assert.equal(cleared, true);
});

test('production UI renders zero positions, retains chart failure after a healthy probe, and coalesces manual checks', async () => {
    const health = new IntegrationHealth();
    const nodes = Object.fromEntries(['health-account', 'health-history', 'health-stream'].map(id => {
        const summary = { textContent: '' }, detail = { textContent: '' };
        return [id, { className: '', summary, detail, querySelector: selector => selector === 'summary' ? summary : detail }];
    }));
    const button = { disabled: false, addEventListener() {} }; nodes.check_api_health = button;
    let accountChecks = 0, historyChecks = 0, resolveAccount;
    const ui = load('../src/ui/integrationHealthUI.ts', {
        '../health/integrationHealth.ts': { integrationHealth: health, maskedBalance, ageText: time => time === undefined ? 'never' : '0s ago' },
        '../api/schwab/api': { checkAccountConnection: async () => {
            accountChecks++; health.begin(health.account);
            await new Promise(resolve => { resolveAccount = resolve; }); health.accountSuccess(account);
        } },
        '../trading/adapters/browserMarket.ts': { massiveApi: { getDailyCandlesForLastNDays: async symbol => {
            assert.equal(symbol, 'SPY'); historyChecks++; health.begin(health.history); health.success(health.history, 'SPY: 7 bars');
        } } }, '../trading/core/marketdata/marketClock.ts': { marketTime: () => ({ date: '2026-10-01' }) },
    }, { document: { getElementById: id => nodes[id] }, window: { addEventListener() {} }, setInterval: () => 1, clearInterval() {} });
    ui.initializeIntegrationHealthUI(); assert.equal(button.disabled, true);
    ui.startIntegrationChecks(); const first = ui.checkIntegrationsNow(true), second = ui.checkIntegrationsNow(true);
    assert.equal(first, second); assert.equal(button.disabled, true);
    resolveAccount(); await first;
    assert.equal(accountChecks, 1); assert.equal(historyChecks, 1); assert.equal(button.disabled, false);
    assert.match(nodes['health-account'].summary.textContent, /Connected.*…234\.56/);
    assert.match(nodes['health-account'].detail.textContent, /Positions: 0/);
    health.historyLoads.set('AAPL', 'Failed after 3 attempts; live chart updates blocked');
    ui.renderIntegrationHealth(); assert.equal(nodes['health-history'].className, 'warning');
    assert.match(nodes['health-history'].summary.textContent, /Chart load issue/);
    health.fail(health.account, new Error('Schwab read HTTP 401')); ui.renderIntegrationHealth();
    assert.equal(nodes['health-account'].className, 'failed');
    await ui.checkIntegrationsNow(); assert.equal(accountChecks, 1); assert.equal(historyChecks, 1);
});
