// Exercise the live browser handler/order-flow with a recording broker, then verify Java parity.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import * as wallOut from '../src/trading/core/controllers/wallOut.ts';
import { createClosingEquityOrder } from '../src/api/schwab/closingOrderFactory.ts';
const root = resolve(import.meta.dirname, '..');
const seed = JSON.parse(readFileSync(resolve(root, 'src/bookmap/direct-execution-fixtures.json'), 'utf8'))[0].state;
const fixtures = [];

async function capture(name, count, edit = () => {}, expectedPrice = 105.08, expectedIds = ['202', '204'].slice(0, count)) {
    const state = structuredClone(seed), requests = [], modules = new Map();
    state.entries = [];
    state.pairs.forEach((pair, index) => {
        pair.originalPartial = index + 1;
        pair.LIMIT.quantity = pair.STOP.quantity = index === 0 ? 30 : 5;
    });
    const snapshot = { priceUnit: 'real', tickSize: 0.01, effectiveWallThreshold: 20000,
        largeAsks: [[105.2, 9000], [105.05, 4999], [105.1, 5000]],
        largeBids: [[104.8, 9000], [104.95, 4999], [104.9, 5000]] };
    edit(state, snapshot);
    const mocks = {
        'models/models': { getPositionNetQuantity: () => state.netQuantity, getExitOrdersPairs: () => state.pairs,
            getExitPairs: () => state.pairs, generateLogTags: () => ({}),
            getCurrentPrice: () => state.currentPrice },
        'models/tradingState': { getPartialsCount: () => state.pairs.length,
            getBreakoutTradeState: () => ({ hasValue: state.hasPlan, entryPrice: state.entryPrice,
                plan: { coreTarget: state.coreTarget, coreCount: state.coreCount } }) },
        'utils/helper': { getBatchIndex: index => index, speak: () => {} },
        'config/globalSettings': { enableCoreTargetExitFeature: state.coreRuleEnabled },
        firestore: { logInfo: () => {}, logError: () => {} },
        'controllers/handler': { hasSplitPartials: () => state.splitPartials },
        'controllers/adjustExitsHandler': { afterAdjustSingleExit: () => {} },
        'controllers/exitRulesCheckerNew': { isAllowedToAdjustSingleLimitOrder: (_, index, order, pair, price) =>
            load('controllers/coreTargetExitRules').checkPriceAdjustment(state.symbol, [pair], price, false).allowed },
        'trading/core/controllers/wallOut': wallOut,
        'api/broker': { replaceExitPairWithNewPrice: (pair, price, stop) => {
            assert.equal(stop, false, 'Wall Out must never modify stops');
            requests.push({ method: 'PUT', orderId: pair.LIMIT.orderID,
                body: createClosingEquityOrder(state.symbol, 'LIMIT', pair.LIMIT.quantity, price, pair.LIMIT.isBuy) });
        } },
    };
    const real = new Set(['controllers/wallOutHandler', 'controllers/orderFlow', 'controllers/coreTargetExitRules',
        'controllers/coreTargetRule', 'trading/core/controllers/coreTargetRule']);
    function load(id) {
        if (mocks[id]) return mocks[id];
        if (modules.has(id)) return modules.get(id);
        if (!real.has(id)) return {};
        const file = resolve(root, 'src', id + '.ts'), exports = {};
        modules.set(id, exports);
        const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        new Function('require', 'exports', code)(path => load(resolve(dirname(file), path)
            .replaceAll('\\', '/').slice(resolve(root, 'src').length + 1).replace(/\.ts$/, '')), exports);
        return exports;
    }
    let error = false;
    try { await load('controllers/wallOutHandler').wallOutPartials(state.symbol, count, snapshot); }
    catch { error = true; }
    assert.equal(error, expectedPrice === null, name);
    assert.deepEqual(requests.map(request => request.orderId), expectedPrice === null ? [] : expectedIds, name);
    for (const request of requests) assert.equal(Number(request.body.price), expectedPrice, name);
    fixtures.push({ name, count, state, snapshot, requests, error });
}

await capture('long exact 5k nearest unsorted ask', 1);
await capture('two distinct smallest pairs share the nearest wall', 2);
await capture('short exact 5k nearest unsorted bid', 2, state => {
    state.netQuantity = -100;
    state.pairs.forEach(pair => { pair.LIMIT.isBuy = pair.STOP.isBuy = true; pair.LIMIT.price = 99; pair.STOP.price = 110; });
}, 104.92);
await capture('single pair remaining clamps Wall Out 2', 2, state => { state.pairs = state.pairs.slice(1, 2); }, 105.08, ['202']);
await capture('coarse tick offsets by at least two cents', 1, (_, book) => { book.tickSize = 0.05; }, 105.05);
await capture('near wall still changes limit when target crosses current price', 1, (_, book) => { book.largeAsks = [[105.01, 5000]]; }, 104.99);
await capture('no qualifying wall sends nothing', 2, (_, book) => { book.largeAsks = [[106, 4999]]; }, null);
await capture('no opposing wall sends nothing', 1, (_, book) => { book.largeAsks = []; }, null);
await capture('missing tick size sends nothing', 1, (_, book) => { delete book.tickSize; }, null);
await capture('unsupported price unit sends nothing', 1, (_, book) => { book.priceUnit = 'ticks'; }, null);
await capture('no position sends nothing', 1, state => { state.netQuantity = 0; }, null);
await capture('unsplit protective orders send nothing', 1, state => { state.splitPartials = false; }, null);
await capture('incomplete second pair blocks both replacements', 2, state => { delete state.pairs[2].STOP; }, null);
await capture('protected second pair blocks both replacements', 2, state => {
    state.coreRuleEnabled = true; state.coreCount = 7;
    state.pairs[2].LIMIT.quantity = state.pairs[2].STOP.quantity = 40;
    const fourth = structuredClone(state.pairs[1]); fourth.originalPartial = 4;
    fourth.LIMIT.orderID = '206'; fourth.STOP.orderID = '207';
    state.pairs.push(fourth);
}, null);

const output = JSON.stringify(fixtures, null, 2) + '\n';
for (const file of ['src/bookmap/wall-out-fixtures.json', '../bookmap-plugin/src/test/resources/wall-out-fixtures.json']) {
    if (process.argv.includes('--check')) assert.deepEqual(JSON.parse(readFileSync(resolve(root, file), 'utf8')), fixtures, `Regenerate ${file}`);
    else writeFileSync(resolve(root, file), output);
}
console.log(`Verified ${fixtures.length} Wall Out cases against the live browser handler.`);
