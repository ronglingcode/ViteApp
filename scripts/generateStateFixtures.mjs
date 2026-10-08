import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as Ledger from '../src/trading/core/account/tradeLedger.ts';
import * as State from '../src/trading/core/state/tradeState.ts';
import * as Config from '../src/trading/core/configuration/tradingConfig.ts';
import * as Views from '../src/trading/core/controllers/nativeViews.ts';
import * as Workflows from '../src/trading/core/controllers/workflows.ts';
import { createExecutionInputs, defaultTradingPolicy } from '../src/trading/core/controllers/executionInputs.ts';
const fixtures = [], base = Date.parse('2026-10-01T13:30:00Z');
const fill = (buy, quantity, price, offset = 0) => ({ symbol: 'AAPL', orderID: String(offset), timestamp: base + offset, quantity, price, isBuy: buy, positionEffectIsOpen: buy });
function add(name, kind, method, args) {
    const fixture = { name, kind, method, args };
    try { fixture.result = (kind === 'ledger' ? Ledger : kind === 'state' ? State : kind === 'workflow' ? Workflows : kind === 'views' ? Views : Config)[method](...args); } catch (e) { fixture.error = e.message; }
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
const automaticLongPlan = { ...plan, long: { ...plan.long, firstTargetToAdd: '-1' } };
const automaticShortPlan = { ...plan, symbol: 'PCVX', long: { ...plan.long, enabled: false }, short: { enabled: true, firstTargetToAdd: '-1', finalTargets, gapAndCrapPlan: { ...entry.basePlan, resistance: { low: 11, high: 12 }, earnings: true } } };
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
    if (options.plan) args[1] = options.plan;
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
const reset = add('reset clips final target to remaining position', 'workflow', 'profitResetTargets', [[{ quantity: 10, target: 11 }, { quantity: 10, target: 12 }, { quantity: 10, target: 13 }], 15]);
assert.equal(reset.reduce((sum, target) => sum + target.quantity, 0), 15);
add('reset insufficient targets', 'workflow', 'profitResetTargets', [[{ quantity: 10, target: 11 }, { quantity: 10, target: 12 }], 25]);
for (const phase of ['idle', 'needs_tighten', 'done']) for (const quantity of [0, 50, 80, 100]) add(`discipline ${phase} ${quantity}`, 'workflow', 'stopDiscipline', [phase, quantity, 100, true, [{ STOP: { quantity: 30, price: 9.5 } }], 9, 11]);
const pending = { orderID: 'old', isBuy: true, price: 10, exitStopPrice: 9 };
add('pending stop widens inside five minutes', 'workflow', 'pendingStopRefresh', [[pending], 0, 1, '', 8, 12]);
add('pending old replacement suppressed', 'workflow', 'pendingStopRefresh', [[pending], 0, 1, 'old', 8, 12]);
add('pending stop does not tighten', 'workflow', 'pendingStopRefresh', [[pending], 0, 1, '', 9.5, 12]);
add('pending timer stops after five minutes', 'workflow', 'pendingStopRefresh', [[pending], 0, 300, '', 8, 12]);
add('pending filled entry not replaced', 'workflow', 'pendingStopRefresh', [[pending], 1, 1, '', 8, 12]);
const touchPosition = { positionKey: 'long:123:10.23:10', entryPrice: 10.23, entryVwap: 11, isLong: true };
add('first VWAP touch pending', 'workflow', 'firstVwapTouch', [{}, touchPosition, 10.5, 11]);
const touched = add('first VWAP touch alerts once', 'workflow', 'firstVwapTouch', [{}, touchPosition, 11, 11]);
assert.equal(touched.notify, true);
add('first VWAP touch does not repeat', 'workflow', 'firstVwapTouch', [touched.state, touchPosition, 12, 11]);
add('new VWAP position resets reminder', 'workflow', 'firstVwapTouch', [touched.state, { ...touchPosition, positionKey: 'new' }, 12, 11]);
add('short first dip to VWAP', 'workflow', 'firstVwapTouch', [{}, { positionKey: 'short', entryPrice: 12, entryVwap: 11, isLong: false }, 10, 11]);
add('entered near VWAP no reminder', 'workflow', 'firstVwapTouch', [{}, { ...touchPosition, entryPrice: 11 }, 12, 11]);
add('flat VWAP reminder preserves state', 'workflow', 'firstVwapTouch', [touched.state, null, 12, 11]);
add('partial completion requires removed pair', 'workflow', 'completedPartials', [100, 40, 8, 10]);
add('no initial quantity partial fallback', 'workflow', 'completedPartials', [0, 40, 8, 10]);
for (const input of fixtures.filter(f => f.kind === 'inputs')) {
    const args = structuredClone(input.args), view = { type: 'account_ready', symbol: args[0], timestamp: args[10], plan: args[1], market: args[2], account: args[4], ledger: args[5], state: args[6], policy: { ...args[12], coreTargetEnabled: true }, history: { dailyBars: [{ high: 12, low: 8, close: 10 }] } };
    view.plan.keyLevels = { otherLevels: [{ price: 10.5, label: 'key' }, { price: 10.5, label: 'duplicate' }, { price: -1 }], zones: [{ low: 11, high: 9, label: 'zone', color: 'red' }, { low: 9, high: 11 }, { low: 0, high: 1 }] };
    view.plan.analysis.waitForBidRetest = 'yes'; view.plan.analysis.waitForOfferRetest = 'warning';
    view.account.executions = { AAPL: [{ price: 11, quantity: 30, isBuy: false, positionEffectIsOpen: false, timestamp: args[10] }] };
    const projected = add('local views: ' + input.name, 'views', 'nativeViews', [view]);
    assert.equal(projected[1].levels.length, 1); assert.equal(projected[1].zones.filter(zone => zone.low === 9 && zone.high === 11).length, 1);
    add('live VWAP: ' + input.name, 'views', 'nativeViews', [{ type: 'market_update', symbol: args[0], timestamp: args[10], market: { vwap: 11, latestPriceTime: args[10] - 1, closedVwap: { datetime: args[10] - 60000, value: 10.05 } } }]);
}
add('empty held-symbol display clears old buttons and levels', 'views', 'nativeViews', [{ type: 'account_ready', symbol: 'MSFT', timestamp: base, account: { positions: { MSFT: { netQuantity: -100, averagePrice: 20 } } } }]);
add('risk clips protective coverage at current remaining position', 'views', 'positionRisk', [30, 10, [{ STOP: { price: 9, quantity: 100 } }], 8, 12]);
add('risk includes unprotected position day extreme', 'views', 'positionRisk', [-100, 10, [{ STOP: { price: 11, quantity: 30 } }], 8, 12]);
for (const available of [2000, 1000, 600, 500, 0]) add('buying power allocation ' + available, 'workflow', 'buyingPowerTargets', [[{ target: 11, quantity: 40 }, { target: 12, quantity: 60 }], 10, available]);
const closedView = { type: 'market_ready', symbol: 'AAPL', timestamp: base + 90000, market: { vwaps: [{ datetime: base - 60000, value: 10 }, { datetime: base, value: 11 }, { datetime: base + 60000, value: 12 }] } };
const seeded = add('VWAP seeds only closed history points', 'views', 'nativeViews', [closedView]).filter(message => message.type === 'vwap_update');
assert.deepEqual(seeded.map(message => message.vwap), [10, 11]); assert.deepEqual(seeded.map(message => message.effectiveTimeMs), [base, base + 60000]);
assert.deepEqual(add('VWAP partial minute has no closed point', 'views', 'nativeViews', [{ type: 'market_update', symbol: 'AAPL', timestamp: base, market: { vwap: 12 } }]), []);
assert.equal(add('negative long add target selects automatic threshold', 'config', 'validateTradingPlan', [automaticLongPlan]), '');
assert.equal(add('negative short add target selects automatic threshold', 'config', 'validateTradingPlan', [automaticShortPlan]), '');
add('selected short plan with automatic add target loads', 'config', 'readTradingConfig', [{ plans: [automaticShortPlan], stockSelections: ['PCVX'], activeProfileName: 'schwab' }]);
for (const target of ['0', '', 'invalid', 'NaN', 'Infinity', '-Infinity', undefined]) {
    const invalid = { ...plan, long: { ...plan.long, firstTargetToAdd: target } };
    assert.equal(add('invalid add target ' + String(target), 'config', 'validateTradingPlan', [invalid]), 'AAPL missing first target to add');
}
assert.equal(inputs('automatic long add threshold preserved in execution inputs', 90, saved, { plan: automaticLongPlan }).entryContext.addTargetLong, -1);
assert.equal(inputs('automatic short add threshold preserved in execution inputs', -90, saved, { plan: automaticShortPlan }).entryContext.addTargetShort, -1);
for (const [name, args] of [
    ['long uses current price and day low', [103, 10, 9, 11, 10]],
    ['short uses current price and day high', [-53, 10, 9, 11, 10]],
    ['small position avoids zero quantity pairs', [3, 10, 9, 11, 10]],
    ['fractional remainder preserved', [3.5, 10, 9, 11, 10]],
    ['prices rounded to cents', [50, 10.123, 9.456, 11.456, 10]],
    ['flat reset blocked', [0, 10, 9, 11, 10]],
    ['missing current price blocked', [50, 0, 9, 11, 10]],
    ['missing day low blocked', [50, 10, 0, 11, 10]],
    ['zero risk long blocked', [50, 10, 10, 11, 10]],
    ['wrong side short stop blocked', [-50, 10, 9, 9.5, 10]],
    ['nonpositive short target blocked', [-50, 10, 9, 16, 10]],
]) {
    const reset = add('fallback reset: ' + name, 'workflow', 'fallbackProfitReset', args);
    if (reset) {
        assert.equal(reset.targets.reduce((sum, item) => sum + item.quantity, 0), Math.abs(args[0]));
        assert.ok(reset.targets.every(item => item.quantity > 0));
        if (args[1] === 10 && args[2] === 9 && args[3] === 11) assert.equal(reset.targets[0].target, args[0] > 0 ? 12 : 8);
    }
}
const text = JSON.stringify(fixtures, null, 2) + '\n';
for (const url of [new URL('../src/trading/state-fixtures.json', import.meta.url), new URL('../../bookmap-plugin/src/test/resources/state-fixtures.json', import.meta.url)]) {
    if (process.argv.includes('--check')) { if (readFileSync(url, 'utf8') !== text) throw new Error(`Fixture drift: ${url}`); } else writeFileSync(url, text);
}
console.log(`Verified ${fixtures.length} account/state/config scenarios through production TS core.`);
