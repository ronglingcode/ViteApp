// Run live ViteApp handlers with in-memory account/UI adapters and a recording broker.
// No network, browser session, or credentials are used.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { calculateEntryTargets } from '../src/algorithms/entryTargets.ts';
import { createBracketedEquityEntry } from '../src/api/schwab/entryOrderFactory.ts';
import { createClosingEquityOrder } from '../src/api/schwab/closingOrderFactory.ts';
const root = resolve(import.meta.dirname, '..');
const seed = JSON.parse(readFileSync(resolve(root, 'src/bookmap/direct-entry-fixtures.json'), 'utf8'))[0].state;
const fixtures = [];
const clone = value => structuredClone(value);

async function capture(name, key, edit = () => {}, shift = false, price = 10) {
    const state = clone(seed), context = state.entryContext;
    state.netQuantity = 1000; state.averagePrice = 10;
    context.lowOfDay = 9.5; context.highOfDay = 10.5;
    Object.assign(context, { reloadIsLong: true, lastExitSize: 0, crosshairPrice: 10,
        todayRange: 1, allowAddIfBelow: 1000, maxRiskMultipleWithExistingPosition: 1.2,
        activeBasePlan: clone(context.definitions[0].basePlan), addTargetLong: 20, addTargetShort: 1,
        isGappedUp: true, premarketHigh: 11, premarketLow: 9,
        longState: { initialQuantity: 1000, partialsCount: 10, addCount: 0, tradebookID: 'RangeBoundBidReversal', stopTightenPhase: 'idle' },
        shortState: { initialQuantity: 1000, partialsCount: 10, addCount: 0, tradebookID: 'RangeBoundOfferReversal', stopTightenPhase: 'idle' } });
    state.pairs = [0, 1, 2, 3].map(index => ({
        LIMIT: { orderID: `${201 + index * 2}`, quantity: 250, orderType: 'LIMIT', price: 12 + index, isBuy: false },
        STOP: { orderID: `${202 + index * 2}`, quantity: 250, orderType: 'STOP', price: 9.5, isBuy: false }, originalPartial: index + 1,
    }));
    edit(state);
    const requests = [], timers = [], messages = [], modules = new Map();
    const direction = isLong => context[isLong ? 'longState' : 'shortState'];
    const tradeState = isLong => ({ initialQuantity: direction(isLong).initialQuantity,
        submitEntryResult: { tradeBookID: direction(isLong).tradebookID },
        plan: { planConfigs: { sizingCount: direction(isLong).partialsCount } } });
    const plan = { atr: { average: context.atr, mutiplier: context.todayRange / context.atr, maxQuantity: context.maxQuantity },
        analysis: { watchAreas: context.watchAreas, noTradeZones: context.noTradeZones } };
    const model = {
        OrderType: { MARKET: 'MARKET', STOP: 'STOP', LIMIT: 'LIMIT' },
        getPositionNetQuantity: () => state.netQuantity,
        getAveragePrice: () => state.averagePrice,
        getPosition: () => state.netQuantity ? { netQuantity: state.netQuantity } : undefined,
        getExitPairs: () => state.pairs, getExitOrdersPairs: () => state.pairs,
        getEntryOrders: () => state.entries,
        hasEntryOrdersInSameDirection: (_, isLong) => state.entries.some(order => order.isBuy === isLong),
        getEntryOrdersInSameDirection: (_, isLong) => state.entries.filter(order => order.isBuy === isLong),
        getCurrentPrice: () => state.currentPrice, getSymbolData: () => context,
        getRealizedProfitLoss: () => context.realizedPnl,
        getLastExitSize: () => context.lastExitSize, isLongForReload: () => context.reloadIsLong,
        generateLogTags: () => ({}), getTodayRange: () => context.todayRange,
        getCurrentVwap: () => context.vwap, getAtr: () => plan.atr,
        getFixedQuantityFromInput: () => context.fixedQuantity,
        getBrokerAccount: () => ({ currentBalance: context.availableBuyingPower / 3.9, positions: new Map() }),
        getWatchlist: () => [],
    };
    // Names expected by the live symbol-data readers.
    Object.assign(context, { premktHigh: context.premarketHigh, premktLow: context.premarketLow });
    const helper = {
        roundPrice: (_, value) => Math.round(value * 100) / 100,
        getDelta: () => 1, isFutures: () => false,
        getCurrentMarketTime: () => new Date(0), getSecondsSinceMarketOpen: () => context.secondsSinceMarketOpen,
        speak: () => {}, roundToCents: value => Math.round(value * 100) / 100,
    };
    const record = (method, orderId, body) => requests.push({ method, orderId, ...(body ? { body } : {}) });
    const marketPair = pair => {
        const leg = pair.LIMIT ?? pair.STOP;
        record('PUT', leg.orderID, createClosingEquityOrder('AAPL', 'MARKET', leg.quantity, 0, leg.isBuy));
    };
    const mocks = {
        'models/models': model, 'utils/helper': helper,
        firestore: new Proxy({}, { get: () => message => messages.push(String(message)) }),
        'models/tradingPlans/tradingPlans': { getTradingPlans: () => plan },
        'models/tradingState': { getSymbolState: () => ({ activeBasePlan: context.activeBasePlan }),
            getBreakoutTradeState: (_, isLong) => tradeState(isLong),
            getPartialsCount: (_, isLong) => direction(isLong).partialsCount,
            getAddCount: (_, isLong) => direction(isLong).addCount,
            setLowestExitBatchCount: () => {}, clearPendingOrder: () => {}, onPlaceBreakoutTrade: () => {} },
        'controllers/partialStopDisciplineController': { getPhase: (_, isLong) => direction(isLong).stopTightenPhase },
        'replay/runtime': { capabilities: { liveBroker: true } },
        'algorithms/watchlist': { getWatchlistLimitBlockReason: () => context.watchlistBlockReason },
        'algorithms/vwap': { getStrongPremarketVwapTrend: () => 0 },
        'tradebooks/tradebooksManager': { getTradebookByID: (_, id) => {
            const def = context.definitions.find(item => item.tradebookID === id);
            if (!def) return undefined;
            return { getAllowedReasonForEntryPrice: value => {
                const { low, high, requireEntryWithinRange } = def.entryArea;
                return { allowed: requireEntryWithinRange ? value >= low && value <= high : def.isLong ? value >= low : value <= high, reason: 'entry boundary' };
            }, getAllowedReasonToAddPartial: () => ({ allowed: true }) };
        } },
        'ui/chart': { getStopLossPrice: (_, isLong) => context[isLong ? 'customStopLong' : 'customStopShort'] || context[isLong ? 'lowOfDay' : 'highOfDay'],
            getCrossHairPrice: () => context.crosshairPrice },
        'config/config': { getProfileSettingsForSymbol: () => ({ isEquity: true }) },
        'algorithms/takeProfit': { BatchCount: state.batchCount,
            getPartialsCountForRiskMultiplier: multiple => Math.max(1, Math.min(state.batchCount, Math.round(multiple * state.batchCount))),
            getEntryProfitTargets: (_, shares, entry, risk, isLong, walls, __, count) => calculateEntryTargets(shares, entry, risk, isLong, walls, count) },
        'utils/calculator': { updateStopPriceFromCurrentQuote: (_, value, isLong) => isLong ? Math.max(value, state.ask) : Math.min(value, state.bid) },
        'api/broker': {
            rebuildBrokerAccount: () => {},
            cancelOrders: orders => orders.forEach(order => record('DELETE', typeof order === 'string' ? order : order.orderID)),
            submitEntryOrderWithBracket: (_, quantity, isLong, type, entry, target, stop) => {
                record('POST', '', createBracketedEquityEntry('AAPL', isLong, type, quantity, entry, [{ target, quantity }], stop));
            },
            submitEntryOrderWithMultipleBrackets: (_, quantity, isLong, type, entry, targets, stop) =>
                record('POST', '', createBracketedEquityEntry('AAPL', isLong, type, quantity, entry, targets, stop)),
            flattenPosition: () => {
                let remaining = Math.abs(state.netQuantity);
                state.pairs.forEach(pair => { marketPair(pair); remaining -= (pair.LIMIT ?? pair.STOP).quantity; });
                if (remaining > 0) record('POST', '', createClosingEquityOrder('AAPL', 'MARKET', remaining, 0, state.netQuantity < 0));
            },
            marketOutExitPairsButOne: () => {
                if (state.pairs.length < 2) return;
                const selected = state.pairs.slice(0, -1);
                selected.forEach(pair => record('DELETE', (pair.LIMIT ?? pair.STOP).orderID));
                record('POST', '', createClosingEquityOrder('AAPL', 'MARKET', selected.reduce((sum, pair) => sum + (pair.LIMIT ?? pair.STOP).quantity, 0), 0, state.netQuantity < 0));
            },
        },
    };
    const real = new Set(['controllers/handler', 'controllers/orderFlow', 'controllers/entryHandler',
        'controllers/entryRulesChecker', 'algorithms/riskManager', 'algorithms/riskSizing', 'tradebooks/tradebookIds']);
    const rules = {
        isOverDailyMaxLoss: () => context.realizedPnl <= -context.dailyMaxLoss,
        isEntryMoreThanHalfDailyRange: (_, isLong, entry) => context.todayRange !== 0 && context.secondsSinceMarketOpen >= 0
            && Math.abs(entry - context[isLong ? 'lowOfDay' : 'highOfDay']) / context.todayRange >= 0.5,
    };
    mocks['algorithms/rules'] = rules;
    function load(id) {
        if (mocks[id]) return mocks[id];
        if (modules.has(id)) return modules.get(id);
        if (!real.has(id)) return {};
        const file = resolve(root, 'src', id + '.ts');
        const exported = {}; modules.set(id, exported);
        const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
        const require = specifier => load(resolve(dirname(file), specifier).replace(resolve(root, 'src') + '/', '').replaceAll('\\', '/').replace(/^.*\/src\//, '').replace(/\.ts$/, ''));
        new Function('require', 'exports', 'setTimeout', compiled.outputText)(require, exported, callback => { timers.push(callback); return 1; });
        return exported;
    }
    const handler = load('controllers/handler');
    if (key === 'KeyA') await handler.reloadPartialPressed('AAPL', shift, price);
    else await handler.swapPositionKeyPressed('AAPL');
    while (timers.length) timers.shift()();
    fixtures.push({ name, state, action: { symbol: 'AAPL', keyCode: key, shiftKey: shift, price }, requests, error: requests.length === 0, messages });
}
await capture('long market reload', 'KeyA', () => {}, true);
await capture('long limit reload', 'KeyA', () => {}, false, 9.8);
await capture('long stop reload', 'KeyA', () => {}, false, 10.2);
await capture('short market reload', 'KeyA', state => {
    state.netQuantity = -1000; state.entryContext.reloadIsLong = false;
    state.pairs.forEach(pair => { pair.LIMIT.isBuy = pair.STOP.isBuy = true; pair.LIMIT.price = 8; pair.STOP.price = 10.5; });
}, true);
await capture('reload cancels earliest when four entries exist', 'KeyA', state => {
    state.entries = [1, 2, 3, 4].map(number => ({ orderID: `${number}`, orderType: 'LIMIT', quantity: 10, price: 9.8, exitStopPrice: 9.5, isBuy: true }));
}, true);
await capture('reload boundary blocks low risk override', 'KeyA', state => { state.entryContext.definitions[0].entryArea.low = 11; }, true);
await capture('reload low risk overrides tighten discipline', 'KeyA', state => { state.entryContext.longState.stopTightenPhase = 'needs_tighten'; }, true);
await capture('reload high risk requires tightening', 'KeyA', state => {
    state.pairs.forEach(pair => { pair.STOP.price = 8.9; }); state.entryContext.longState.stopTightenPhase = 'needs_tighten';
}, true);
await capture('reload watchlist blocks high risk add', 'KeyA', state => {
    state.pairs.forEach(pair => { pair.STOP.price = 8.9; }); state.entryContext.watchlistBlockReason = 'watchlist limit';
}, true);
await capture('reload daily loss includes existing position risk', 'KeyA', state => {
    state.pairs.forEach(pair => { pair.STOP.price = 8.9; }); state.entryContext.realizedPnl = -3100;
}, true);
await capture('reload new risk includes pending entries', 'KeyA', state => {
    state.pairs.forEach(pair => { pair.STOP.price = 8.9; }); state.entryContext.realizedPnl = -2800;
    state.entries = [{ orderID: '101', orderType: 'LIMIT', quantity: 500, price: 10, exitStopPrice: 9.5, isBuy: true }];
}, true);
await capture('reload respects 52 percent risk budget', 'KeyA', state => {
    state.pairs.forEach(pair => { pair.STOP.price = 7.9; });
}, true);
await capture('reload after third add respects half daily range', 'KeyA', state => {
    state.pairs.forEach(pair => { pair.STOP.price = 8.9; }); state.entryContext.longState.addCount = 3;
}, true);
await capture('reload flat last trade uses one risk target', 'KeyA', state => { state.netQuantity = 0; state.pairs = []; }, true);
await capture('swap closes and reenters original long direction', 'KeyW');
await capture('swap closes and reenters original short direction', 'KeyW', state => {
    state.netQuantity = -1000; state.pairs.forEach(pair => { pair.LIMIT.isBuy = pair.STOP.isBuy = true; });
});
await capture('swap pending entry keeps final pair', 'KeyW', state => {
    state.entries = [{ orderID: '101', orderType: 'STOP', quantity: 100, price: 10.5, isBuy: true }];
});
await capture('swap requires active plan', 'KeyW', state => { delete state.entryContext.activeBasePlan; });
await capture('swap requires position', 'KeyW', state => { state.netQuantity = 0; state.pairs = []; });
const output = JSON.stringify(fixtures, null, 2) + '\n';
for (const file of ['src/bookmap/extended-execution-fixtures.json', '../bookmap-plugin/src/test/resources/extended-execution-fixtures.json']) {
    if (process.argv.includes('--check')) assert.equal(readFileSync(resolve(root, file), 'utf8'), output, `Regenerate ${file}`);
    else writeFileSync(resolve(root, file), output);
}
console.log(`${process.argv.includes('--check') ? 'Verified' : 'Generated'} ${fixtures.length} fixtures from ViteApp handlers with a recording broker.`);
