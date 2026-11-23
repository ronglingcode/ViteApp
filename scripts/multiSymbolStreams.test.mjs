import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('browser worker subscribes both stocks on one socket per vendor and closes them on stop', () => {
    const sockets = [], messages = [], trades = [];
    let listener;
    class FakeSocket {
        static OPEN = 1;
        readyState = 1;
        sent = [];
        closed = false;
        constructor() { sockets.push(this); }
        send(value) { this.sent.push(JSON.parse(value)); }
        close() { this.closed = true; }
        receive(value) { this.onmessage({ data: JSON.stringify(value) }); }
    }
    const mocks = {
        '../streaming/levelOneQuoteParse': { createSchwabLevelOneQuote: quote => ({ symbol: quote.key, bidPrice: quote['1'] }) },
        '../streaming/timeSaleParse': { createMassiveTimeSale: data => ({ record: { symbol: data.sym, lastPrice: data.p }, shouldFilter: false }) },
        './tradeFlushBuffer': { TradeFlushBuffer: class { start() {} stop() {} push(value) { trades.push(value); } } },
        '../trading/libraries/broker/schwab/streamingProtocol.ts': { parseStreamMessage: () => ({ login: 'success' }) },
        '../health/massiveStreamStatus.ts': { massiveStreamStatus() {} },
    };
    const js = ts.transpileModule(readFileSync(new URL('../src/workers/marketDataWorker.ts', import.meta.url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function('require', 'exports', 'WebSocket', 'self', js)(name => {
        assert.ok(name in mocks, `Unexpected dependency ${name}`); return mocks[name];
    }, {}, FakeSocket, { postMessage: message => messages.push(message), addEventListener: (_type, callback) => { listener = callback; } });
    const payload = {
        symbols: ['AAPL', 'TSLA'], massive: { authParams: 'fake-key' },
        schwab: { socketUrl: 'wss://schwab.invalid', loginRequest: { command: 'LOGIN' },
            levelOneSubscribeRequest: { service: 'LEVELONE_EQUITIES', parameters: { keys: 'AAPL,TSLA' } },
            activitySubscribeRequest: { service: 'ACCT_ACTIVITY' } },
    };
    const start = () => listener({ data: { type: 'start', payload } });
    start(); assert.equal(sockets.length, 2);
    const [massive, schwab] = sockets;
    massive.onopen(); schwab.onopen();
    massive.receive([{ ev: 'status', status: 'auth_success' }]);
    schwab.receive({ response: [{ service: 'ADMIN', command: 'LOGIN' }] });
    assert.equal(massive.sent.at(-1).params, 'T.AAPL,T.TSLA');
    assert.equal(schwab.sent[1].parameters.keys, 'AAPL,TSLA');
    assert.equal(schwab.sent.filter(request => request.service === 'ACCT_ACTIVITY').length, 1);
    massive.receive([{ ev: 'T', sym: 'AAPL', p: 10 }, { ev: 'T', sym: 'TSLA', p: 200 }]);
    schwab.receive({ data: [{ service: 'LEVELONE_EQUITIES', command: 'SUBS', content: [{ key: 'AAPL', '1': 9 }, { key: 'TSLA', '1': 199 }] }] });
    assert.deepEqual(trades.map(trade => trade.record.symbol), ['AAPL', 'TSLA']);
    assert.deepEqual(messages.find(message => message.type === 'quote').quotes.map(quote => quote.symbol), ['AAPL', 'TSLA']);
    start(); assert.equal(sockets.filter(socket => !socket.closed).length, 2);
    listener({ data: { type: 'stop' } }); assert.ok(sockets.every(socket => socket.closed));
});

test('browser fallback shares vendor sockets and routes both symbols independently', async () => {
    const sockets = [], trades = [], quotes = [];
    class FakeSocket {
        static CLOSED = 3;
        readyState = 0;
        sent = [];
        constructor(url) { this.url = url; sockets.push(this); }
        send(value) { this.sent.push(JSON.parse(value)); }
        close() { this.readyState = FakeSocket.CLOSED; this.onclose?.(); }
        receive(value) { this.onmessage({ data: JSON.stringify(value) }); }
    }
    const states = new Map(['AAPL', 'TSLA'].map(symbol => [symbol, { schwabLevelOneQuote: {} }]));
    const mocks = {
        '../../models/models': {
            getWatchlist: () => [{ symbol: 'AAPL' }, { symbol: 'TSLA' }],
            getWatchlistSymbolsInString: () => 'AAPL,TSLA', getSymbolData: symbol => states.get(symbol),
        },
        '../../data/db': {
            levelOneQuoteSource: 'schwab', levelOneQuoteSourceSchwab: 'schwab',
            updateFromLevelOneQuote: quote => quotes.push(quote),
            tryUpdateMaxTimeSaleTimestamp: () => true, updateFromTimeSale: trade => trades.push(trade),
        },
        '../../utils/helper': {}, '../../ui/chart': {}, '../../firestore': {},
        '../../models/levelOneQuote': { updateQuoteIfNotEmpty: Object.assign },
        '../../trading/libraries/broker/schwab/streamingProtocol.ts': { parseStreamMessage: () => ({ login: 'success' }) },
        '../../config/secret': { massive: () => ({ apiKey: 'fake-key' }) },
        '../../streaming/timeSaleParse': { createMassiveTimeSale: data => ({ record: { symbol: data.sym, lastPrice: data.p, receivedTime: new Date() }, shouldFilter: false }) },
        '../../health/integrationHealth.ts': { integrationHealth: { startStream() {}, streamPhase() {}, receiveTrades() {}, stream: {} } },
        '../../health/massiveStreamStatus.ts': { massiveStreamStatus() {} },
    };
    function load(path) {
        const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
        }).outputText;
        const module = { exports: {} };
        new Function('require', 'module', 'exports', 'WebSocket', 'window', js)(name => {
            assert.ok(name in mocks, `Unexpected dependency ${name}`); return mocks[name];
        }, module, module.exports, FakeSocket, { HybridApp: { Secrets: { schwab: { streamerSocketUrl: 'wss://schwab.invalid', accessToken: 'fake-token' } } } });
        return module.exports;
    }
    const schwab = load('../src/api/schwab/streaming.ts'), massive = load('../src/api/massive/streaming.ts');
    await Promise.all([schwab.createWebSocket(), massive.createWebSocket(), schwab.createWebSocket(), massive.createWebSocket()]);
    assert.equal(sockets.length, 2);
    for (const socket of sockets) { socket.readyState = 1; socket.onopen(); }
    sockets[0].receive({ response: [{ service: 'ADMIN', command: 'LOGIN', content: { code: 0 } }] });
    sockets[1].receive([{ ev: 'status', status: 'auth_success' }]);
    assert.equal(sockets[0].sent.find(request => request.service === 'LEVELONE_EQUITIES').parameters.keys, 'AAPL,TSLA');
    assert.equal(sockets[0].sent.filter(request => request.service === 'ACCT_ACTIVITY').length, 1);
    assert.equal(sockets[1].sent.at(-1).params, 'T.AAPL,T.TSLA');
    sockets[0].receive({ data: [{ service: 'LEVELONE_EQUITIES', command: 'SUBS', timestamp: Date.now(), content: [{ key: 'AAPL', '1': 10 }, { key: 'TSLA', '1': 200 }] }] });
    sockets[1].receive([{ ev: 'T', sym: 'AAPL', p: 11 }, { ev: 'T', sym: 'TSLA', p: 201 }]);
    assert.deepEqual(quotes.map(quote => [quote.symbol, quote.bidPrice]), [['AAPL', 10], ['TSLA', 200]]);
    assert.deepEqual(trades.map(trade => [trade.symbol, trade.lastPrice]), [['AAPL', 11], ['TSLA', 201]]);
    for (const socket of sockets.slice()) socket.close();
    await Promise.all([schwab.createWebSocket(), massive.createWebSocket()]);
    assert.equal(sockets.length, 4, 'closed connections can be replaced');
});
