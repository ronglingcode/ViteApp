import { SelectedStop, StopClaims } from '../trading/core/controllers/selectedStop.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as Sizing from '../trading/core/algorithms/entrySizing.ts';
import { createBracketedEquityEntry } from '../api/schwab/entryOrderFactory.ts';
import { createClosingEquityOrder } from '../api/schwab/closingOrderFactory.ts';

// Exercise the live entry handler and order flow with a recording broker only.
function capture(isLong: boolean, opposite: boolean, quote: number, armed = true) {
    const requests: any[] = [];
    const selection = new SelectedStop(), claims = new StopClaims(selection);
    if (armed) selection.select('AAPL', isLong ? 9 : 13);
    const pairs = [1, 2].map(id => ({ symbol: 'AAPL',
        LIMIT: { orderID: `target-${id}`, quantity: 10, isBuy: opposite ? isLong : !isLong },
        STOP: { orderID: `stop-${id}`, quantity: 10, isBuy: opposite ? isLong : !isLong },
    }));
    const mocks: Record<string, any> = {
        './selectedStop': { prepare: (symbol: string, side: boolean, entry: number, tags: object) => {
            try { return claims.prepare(tags, symbol, side, entry); } catch { return undefined; }
        } },
        '../trading/core/algorithms/entrySizing': Sizing,
        '../models/models': {
            OrderType: { STOP: 'STOP', LIMIT: 'LIMIT' },
            getSymbolData: () => ({ bidPrice: quote, askPrice: quote }),
            getCurrentPrice: () => isLong ? 10 : 12,
            getExitPairs: () => pairs, getEntryOrdersInSameDirection: () => [],
            getFixedQuantityFromInput: () => 20,
        },
        '../firestore': { logInfo: () => {} },
        '../models/tradingState': { onPlaceBreakoutTrade: () => {} },
        '../config/config': { getProfileSettingsForSymbol: () => ({ isEquity: true }) },
        '../algorithms/takeProfit': { BatchCount: 10,
            getEntryProfitTargets: () => [{ target: isLong ? 13 : 9, quantity: 20 }] },
        '../api/broker': {
            replaceExitPairWithNewPrice: (pair: any, price: number) => requests.push({ method: 'PUT',
                orderID: pair.STOP.orderID, body: createClosingEquityOrder('AAPL', 'STOP', 10, price, isLong) }),
            submitEntryOrderWithMultipleBrackets: (_: string, quantity: number, side: boolean,
                type: 'STOP' | 'LIMIT' | 'MARKET', entry: number, targets: any[], stop: number, tags: object) => {
                claims.submit(tags, 'AAPL', side, entry, stop);
                requests.push({ method: 'POST', body: createBracketedEquityEntry('AAPL', side, type, quantity, entry, targets, stop) });
            },
        },
        '../trading/core/controllers/workflows': {
            buyingPowerTargets: (targets: any[]) => ({ targets, totalQuantity: 20, insufficient: false }) },
    };
    const modules: Record<string, any> = {};
    const paths: Record<string, string> = {
        './orderFlow': '../controllers/orderFlow.ts',
        '../utils/calculator': '../utils/calculator.ts',
        '../algorithms/riskManager': '../algorithms/riskManager.ts',
    };
    function load(id: string, path?: string): any {
        if (mocks[id]) return mocks[id];
        if (modules[id]) return modules[id];
        const file = path ?? paths[id];
        if (!file) return {};
        const exports = modules[id] = {};
        const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
        });
        new Function('require', 'exports', compiled.outputText)(load, exports);
        return exports;
    }
    // Risk sizing is fixed here; the production cent-offset helpers still run.
    load('../algorithms/riskManager').getAvailableBuyingPower = () => 1_000_000;
    load('entryHandler', '../controllers/entryHandler.ts').breakoutEntryWithoutRules(
        'AAPL', isLong, 11, isLong ? 9 : 13, isLong ? 9 : 13, {}, 1,
        { planConfigs: { sizingCount: 10 } }, 'test', '');
    return requests;
}

for (const isLong of [false, true]) {
    for (const adjusted of [false, true]) {
        test(`${isLong ? 'B against short' : 'S against long'} keeps entry one cent beyond ${adjusted ? 'quote-adjusted' : 'hovered'} stop`, () => {
            const stop = adjusted ? (isLong ? 11.01 : 10.99) : 11;
            const requests = capture(isLong, true, adjusted ? stop : (isLong ? 10 : 12));
            assert.deepEqual(requests.map(request => request.method), ['PUT', 'PUT', 'POST']);
            for (const request of requests.slice(0, 2)) {
                assert.equal(request.body.stopPrice, stop);
            }
            const entry = requests[2].body;
            assert.equal(entry.orderType, 'STOP');
            assert.equal(entry.stopPrice, Number((stop + (isLong ? 0.01 : -0.01)).toFixed(2)));
            assert.equal(entry.orderLegCollection[0].instruction, isLong ? 'BUY' : 'SELL_SHORT');
        });
    }
    test(`${isLong ? 'B' : 'S'} keeps same-direction protective stops`, () => {
        assert.deepEqual(capture(isLong, false, isLong ? 10 : 12).map(request => request.method), ['POST']);
    });
}

for (const side of [false, true]) test(`missing selected stop blocks ${side ? 'long' : 'short'} before opposite-position changes`, () => {
    assert.deepEqual(capture(side, true, side ? 10 : 12, false), []);
});
