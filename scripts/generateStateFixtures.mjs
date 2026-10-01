import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as Ledger from '../src/trading/core/account/tradeLedger.ts';
import * as State from '../src/trading/core/state/tradeState.ts';
import * as Config from '../src/trading/core/configuration/tradingConfig.ts';
import { createExecutionInputs, defaultTradingPolicy } from '../src/trading/core/controllers/executionInputs.ts';
const fixtures = [], base = Date.parse('2026-10-01T13:30:00Z');
const fill = (buy, quantity, price, offset = 0) => ({ symbol: 'AAPL', orderID: String(offset), timestamp: base + offset, quantity, price, isBuy: buy, positionEffectIsOpen: buy });
function add(name, kind, method, args) {
    const fixture = { name, kind, method, args };
    try { fixture.result = (kind === 'ledger' ? Ledger : kind === 'state' ? State : Config)[method](...args); } catch (e) { fixture.error = e.message; }
    fixtures.push(fixture); return fixture.result;
}
add('no executions', 'ledger', 'projectTradeLedger', [{}]);
add('open long and weighted adds', 'ledger', 'projectTradeLedger', [{ AAPL: [fill(true, 100, 10), fill(true, 50, 12, 60000), fill(false, 50, 13, 61000)] }]);
add('closed long and reopened short', 'ledger', 'projectTradeLedger', [{ AAPL: [fill(true, 100, 10), fill(false, 100, 12, 1000), fill(false, 40, 11, 2000), fill(true, 40, 10, 3000)] }]);
const reverse = add('one fill reverses a long into short', 'ledger', 'projectTradeLedger', [{ AAPL: [fill(true, 100, 10), fill(false, 150, 12, 1000)] }]);
assert.equal(reverse.realizedPnL, 200); assert.equal(reverse.tradesCount, 2);
assert.equal(reverse.trades.AAPL[0].isClosed, true); assert.equal(reverse.trades.AAPL[1].entries[0].quantity, 50);
add('one fill reverses a short into long', 'ledger', 'projectTradeLedger', [{ AAPL: [fill(false, 100, 10), fill(true, 150, 8, 1000)] }]);
add('sort and aggregate same minute entries', 'ledger', 'projectTradeLedger', [{ AAPL: [fill(false, 100, 12, 60000), fill(true, 50, 10, 2), fill(true, 50, 11, 1)] }]);
add('breakeven count retains five percent daily max threshold', 'ledger', 'projectTradeLedger', [{ AAPL: [fill(true, 100, 10), fill(false, 100, 12, 1)] }]);
const trade = Ledger.groupTradeExecutions('AAPL', [fill(true, 100, 10), fill(true, 10, 11, 60000), fill(false, 10, 12, 120000), fill(true, 10, 13, 180000)])[0];
add('added partial stack after a reload', 'ledger', 'addedPartialStack', [trade, 100]);
add('empty add stack', 'ledger', 'addedPartialStack', [undefined, 100]);
add('default long state', 'state', 'defaultBreakout', [true, base + 123]);
add('default short state', 'state', 'defaultBreakout', [false, base + 456]);
const entry = { isLong: true, useMarketOrder: true, entryPrice: 10, stopOutPrice: 9, multiplier: 0.5, basePlan: { planConfigs: { requireReversal: true, sizingCount: 5 }, coreTarget: 13, coreCount: 3, runnerCount: 0, runnerTriggerCondition: '' }, submitEntryResult: { totalQuantity: 100, isSingleOrder: false, profitTargets: [{ target: 11, quantity: 100 }], tradeBookID: 'GapGiveAndGoBookmapReversal' } };
add('accepted long state and timestamp', 'state', 'acceptedBreakout', [entry, base + 123]);
add('accepted short state and pullback', 'state', 'acceptedBreakout', [{ ...entry, isLong: false, stopOutPrice: 11 }, base + 456]);
function store(name, restored, actions = []) {
    const fixture = { name, kind: 'store', args: ['2026-10-01', 25000, base, restored], actions };
    const state = new State.TradeState(...fixture.args);
    try {
        for (const [method, ...args] of actions) state[method](...args);
        fixture.result = state.snapshot();
    } catch (e) { fixture.error = e.message; }
    fixtures.push(fixture); return fixture.result;
}
const saved = store('new state and accepted entry', null, [['acceptEntry', 'AAPL', entry, { average: 1, mutiplier: 2, minimumMultipler: 1, maxQuantity: 1000 }, base + 123]]);
assert.equal(saved.stateBySymbol.AAPL.breakoutTradeStateForLong.initialQuantity, 100);
assert.equal(saved.stateBySymbol.AAPL.breakoutTradeStateForLong.plan.planConfigs.sizingCount, 5);
store('same day restores captured plan', saved);
store('different day resets state', { ...saved, date: '9/30/2026' });
store('ISO date is compatible', { ...saved, date: '2026-10-01' });
store('accepted add preserves active state', saved, [['acceptEntry', 'AAPL', { preserveExistingTrade: true }, {}, base + 1000]]);
store('core update changes active and captured plan', saved, [['updateCorePlan', 'AAPL', true, 14, 2]]);
store('bad core count rejected', saved, [['updateCorePlan', 'AAPL', true, 14, 8]]);
store('core target wrong direction rejected', saved, [['updateCorePlan', 'AAPL', true, 9, 2]]);
const finalTargets = [{ partialCount: 5, rrr: 1, level: 0, atr: 0, text: 'first' }, { partialCount: 5, rrr: 2, level: 0, atr: 0, text: 'second' }];
const plan = { symbol: 'AAPL', corePlan: 'A specific momentum plan with support, risk, invalidation and follow-through rules.', analysis: { gap: { pdc: 10 }, watchAreas: [], noTradeZones: [] }, atr: { average: 1, mutiplier: 2, minimumMultipler: 1, maxQuantity: 1000 }, vwapCorrection: { volumeSum: 0, tradingSum: 0 }, marketCapInMillions: 10000, long: { enabled: true, firstTargetToAdd: 'vwap', finalTargets, gapAndGoPlan: { ...entry.basePlan, support: { low: 9, high: 10 }, recentPullback: 10 } }, short: { enabled: false, finalTargets: [] } };
add('valid plan with live add target before history loads', 'config', 'validateTradingPlan', [plan]);
add('missing core thesis', 'config', 'validateTradingPlan', [{ ...plan, corePlan: 'short' }]);
add('missing analysis', 'config', 'validateTradingPlan', [{ ...plan, analysis: {} }]);
add('missing atr', 'config', 'validateTradingPlan', [{ ...plan, atr: {} }]);
add('missing rationale', 'config', 'validateTradingPlan', [{ ...plan, long: { ...plan.long, gapAndGoPlan: { ...plan.long.gapAndGoPlan, recentPullback: 0 } } }]);
add('entry flag must be boolean', 'config', 'validateTradingPlan', [{ ...plan, long: { ...plan.long, gapAndGoPlan: { ...plan.long.gapAndGoPlan, support: { low: 9, high: 10, requireEntryWithinRange: 'false' } } } }]);
add('missing final targets', 'config', 'validateTradingPlan', [{ ...plan, long: { ...plan.long, finalTargets: [] } }]);
add('tradebook definitions', 'config', 'createTradebookDefinitions', [plan]);
const range = { ...entry.basePlan, support: { low: 9, high: 8, requireEntryWithinRange: true }, resistance: { low: 11, high: 12 }, previousConsolidationArea: { low: 8, high: 12 } };
add('range normalized and constructed even for disabled directions', 'config', 'createTradebookDefinitions', [{ ...plan, long: { enabled: false }, rangeBoundReversalPlan: range }]);
add('range overlap rejected', 'config', 'validateTradingPlan', [{ ...plan, rangeBoundReversalPlan: { ...range, resistance: { low: 8, high: 10 } } }]);
add('stock selections config', 'config', 'readTradingConfig', [{ plans: [plan], stockSelections: ['AAPL'], activeProfileName: 'schwab' }]);
add('watchlist attention limit', 'config', 'readTradingConfig', [{ plans: [plan], stockSelections: ['AAPL', 'TSLA'], activeProfileName: 'schwab' }]);
add('missing selected plan', 'config', 'readTradingConfig', [{ plans: [plan], stockSelections: ['TSLA'] }]);
add('missing config', 'config', 'readTradingConfig', [null]);
function inputs(name, netQuantity, restored, options = {}) {
    const market = { symbol: 'AAPL', date: '2026-10-01', candles: [{ datetime: base - 60000, volume: 1000 }, { datetime: base, volume: 2000 }], currentPrice: 11, vwap: 10.5, liquidityScale: .5, openPrice: 10, highOfDay: 12, lowOfDay: 9, premarketHigh: 11, premarketLow: 8 };
    const pair = (id, price, quantity = 10) => ({ symbol: 'AAPL', source: 'OCO', parentOrderID: id, STOP: { orderID: id + 's', quantity, price: 9, isBuy: netQuantity < 0 }, LIMIT: { orderID: id + 'l', quantity, price, isBuy: netQuantity < 0 } });
    const account = { positions: { AAPL: { netQuantity, averagePrice: 10 } }, entryOrders: {}, exitPairs: { AAPL: [pair('one', 12), pair('two', 11), { symbol: 'AAPL', source: 'OCO', parentOrderID: 'three', STOP: { orderID: 'three', quantity: 10, price: 9, isBuy: netQuantity < 0 } }] }, currentBalance: 25000 };
    const ledger = Ledger.projectTradeLedger({ AAPL: [fill(netQuantity >= 0, 100, 10), fill(netQuantity < 0, 10, 11, 60000)] });
    const args = ['AAPL', plan, market, { bidPrice: 10.99, askPrice: 11.01 }, account, ledger, restored, ['AAPL'], { AAPL: market }, { customStopLong: 9.5, fixedQuantity: 0 }, base + 1000, 2, defaultTradingPolicy];
    Object.assign(account, options.account); args[12] = { ...defaultTradingPolicy, ...options.policy };
    const result = createExecutionInputs(...args.slice(0, 6), new State.TradeState('2026-10-01', 25000, base, restored), ...args.slice(7));
    fixtures.push({ name, kind: 'inputs', args, result }); return result;
}
const longInputs = inputs('local execution inputs long with captured sizing and stop-only pair', 90, saved);
assert.equal(longInputs.entryContext.availableBuyingPower, 97500 - 90 * 11);
assert.equal(longInputs.pairs[0].parentOrderID, 'two'); assert.equal(longInputs.pairs[0].originalPartial, 3);
assert.deepEqual(longInputs.entryContext.volumes, [2000]); assert.equal(longInputs.entryContext.addTargetLong, 10.5);
inputs('local execution inputs short ordered limits descending', -90, { ...saved, stateBySymbol: { AAPL: { ...saved.stateBySymbol.AAPL, breakoutTradeStateForShort: State.acceptedBreakout({ ...entry, isLong: false, stopOutPrice: 11 }, base) } } });
inputs('local execution inputs flat reload direction', 0, null);
inputs('single large exit disables split partials', 100, { ...saved, stateBySymbol: { AAPL: { ...saved.stateBySymbol.AAPL, breakoutTradeStateForLong: State.acceptedBreakout({ ...entry, submitEntryResult: { ...entry.submitEntryResult, isSingleOrder: true, totalQuantity: 10 } }, base) } } }, { account: { exitPairs: { AAPL: [{ STOP: { orderID: 'large', quantity: 100, price: 9 } }] } } });
const text = JSON.stringify(fixtures, null, 2) + '\n';
for (const url of [new URL('../src/trading/state-fixtures.json', import.meta.url), new URL('../../bookmap-plugin/src/test/resources/state-fixtures.json', import.meta.url)]) {
    if (process.argv.includes('--check')) { if (readFileSync(url, 'utf8') !== text) throw new Error(`Fixture drift: ${url}`); } else writeFileSync(url, text);
}
console.log(`Verified ${fixtures.length} account/state/config scenarios through production TS core.`);
