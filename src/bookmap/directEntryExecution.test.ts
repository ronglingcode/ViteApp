import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateEntryTargets } from '../algorithms/entryTargets.ts';
import { sharesForRisk } from '../algorithms/riskSizing.ts';
import { createBracketedEquityEntry } from '../api/schwab/entryOrderFactory.ts';
import { evaluateEntryPriceAndVolumeRules } from '../controllers/entryRuleDecision.ts';
import ts from 'typescript';
import * as Sizing from '../trading/core/algorithms/entrySizing.ts';
import { nativeViews } from '../trading/core/controllers/nativeViews.ts';
import { createExecutionInputs } from '../trading/core/controllers/executionInputs.ts';
import { TradeState } from '../trading/core/state/tradeState.ts';

const fixtures = JSON.parse(readFileSync(new URL('./direct-entry-fixtures.json', import.meta.url), 'utf8'));

test('entry methods use default exit partials except for 0.1R', () => {
    const source = readFileSync(new URL('../utils/helper.ts', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
    const helper: any = {};
    new Function('require', 'exports', compiled.outputText)(
        (id: string) => id === '../config/globalSettings' ? { batchCount: 10 } : Sizing, helper);
    assert.deepEqual(helper.returnDefaultEntryMethods(), ['1 R', '0.5 R', '0.3 R', '0.2 R', '0.1 R']);
    for (const [method, risk, count] of [['1 R', 1, 10], ['0.5 R', 0.5, 10], ['0.3 R', 0.3, 10], ['0.2 R', 0.2, 10], ['0.1 R', 0.1, 1]]) {
        assert.equal(helper.getRiskMultiplierFromEntryMethod(method), risk);
        assert.equal(helper.getPartialCountFromEntryMethod(method), count);
    }
});
test('native entry fixtures agree with production risk, rule, target and bracket helpers', () => {
    for (const fixture of fixtures.filter((value: any) => !value.error)) {
        const context = fixture.state.entryContext, entry = fixture.entry;
        const body = fixture.requests[0].body;
        const orderPrice = fixture.orderEntry ?? (entry.isLong ? 10.01 : 9.99);
        const orderStop = fixture.orderStop ?? (entry.isLong ? 9.49 : 10.51);
        const count = fixture.count ?? 10;
        const fixedQuantity = Sizing.fixedSharesFromMethod(fixture.action.entry_method) ?? (!fixture.action.entry_method ? context.fixedQuantity : 0);
        const targetRisk = fixedQuantity > 0 ? orderStop : entry.stopOutPrice;
        let quantity = fixedQuantity > 0 ? fixedQuantity : Math.min(
            context.maxQuantity > 0 ? context.maxQuantity : Infinity,
            sharesForRisk(Math.abs(orderPrice - targetRisk), entry.multiplier, context.riskDollars));
        const targets = calculateEntryTargets(quantity, orderPrice, targetRisk, entry.isLong, fixture.action.orderbook, count);
        if (fixture.halfBuyingPower) {
            quantity /= 2;
            targets.forEach(target => { target.quantity /= 2; });
        }
        assert.equal(quantity, entry.submitEntryResult.totalQuantity, fixture.name);
        assert.deepEqual(targets, entry.submitEntryResult.profitTargets, fixture.name);
        assert.deepEqual(createBracketedEquityEntry('AAPL', entry.isLong, body.orderType, quantity, orderPrice, targets, orderStop), body, fixture.name);
        const decision = evaluateEntryPriceAndVolumeRules({ ...context, entryPrice: 10, isLong: entry.isLong, initialSize: context.liquidityScale });
        const methodMatch = fixture.action.entry_method?.trim().match(/(?:^|\s)(\d+(?:\.\d+)?)\s*R$/i);
        const methodMultiplier = methodMatch && Number(methodMatch[1]) > 0 ? Number(methodMatch[1]) : 1;
        assert.equal(decision.multiplier * methodMultiplier, entry.multiplier, fixture.name);
    }
});
test('entry area and no-trade-zone boundary behavior remains precise', () => {
    const input = { isLong: true, entryPrice: 10, initialSize: 1, openPrice: 10, secondsSinceMarketOpen: 100,
        vwap: 10, atr: 1, watchAreas: [], noTradeZones: [{ low: 10, high: 11 }], volumes: [] };
    assert.equal(evaluateEntryPriceAndVolumeRules(input).multiplier, 1);
    assert.equal(evaluateEntryPriceAndVolumeRules({ ...input, entryPrice: 10.01 }).multiplier, 0);
});

test('configured share options preserve order and ten integer partials', () => {
    assert.deepEqual(Sizing.entryMethods([100, 50, 100, 9, 10.5, NaN]), ['1 R', '0.5 R', '0.3 R', '0.2 R', '0.1 R', '100 sh', '50 sh']);
    assert.equal(Sizing.fixedSharesFromMethod('100 sh'), 100);
    assert.equal(Sizing.fixedSharesFromMethod('0.1 R'), undefined);
    for (const quantity of [50, 100, 75]) {
        const targets = calculateEntryTargets(quantity, 10, 9, true, undefined, Sizing.FIXED_SHARE_PARTIALS);
        assert.equal(targets.length, 10);
        assert.equal(targets.reduce((sum, target) => sum + target.quantity, 0), quantity);
        assert.ok(targets.every(target => Number.isInteger(target.quantity) && target.quantity > 0));
    }
});

test('native panel takes share buttons from the symbol plan and hides them for an empty list', () => {
    for (const fixedShares of [[100, 50], []]) {
        const messages = nativeViews({ type: 'account_ready', symbol: 'AAPL', timestamp: 1,
            plan: { fixedShares, long: { gapAndGoPlan: { planConfigs: {}, support: { low: 9, high: 10 } } }, short: {} } });
        const config = messages.find(message => message.type === 'trade_button_config')!;
        assert.deepEqual(config.tradebooks[0].entryMethods, [...['1 R', '0.5 R', '0.3 R', '0.2 R', '0.1 R'], ...fixedShares.map(quantity => `${quantity} sh`)]);
    }
});

test('symbol share options reach the executor through execution inputs', () => {
    const fixtures = JSON.parse(readFileSync(new URL('../trading/state-fixtures.json', import.meta.url), 'utf8'));
    const args = structuredClone(fixtures.find((fixture: any) => fixture.kind === 'inputs').args);
    args[1].fixedShares = [100, 50];
    args[6] = new TradeState('2026-10-01', 25000, args[10] - 1000, args[6]);
    const snapshot = (createExecutionInputs as any)(...args);
    assert.deepEqual(snapshot.entryContext.fixedShares, [100, 50]);
    args[1].fixedShares.push(200);
    assert.deepEqual(snapshot.entryContext.fixedShares, [100, 50]);
});

test('live ViteApp share buttons submit exact quantities and ten partials', () => {
    const source = readFileSync(new URL('../controllers/orderFlow.ts', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
    const flow: any = {}, requests: any[] = [];
    const mocks: Record<string, any> = {
        '../trading/core/algorithms/entrySizing': Sizing,
        '../models/models': { OrderType: { STOP: 'STOP', LIMIT: 'LIMIT', MARKET: 'MARKET' }, getCurrentPrice: () => 10, getFixedQuantityFromInput: () => 999 },
        '../config/config': { getProfileSettingsForSymbol: () => ({ isEquity: true }) },
        '../firestore': { logInfo: () => {} },
        '../algorithms/riskManager': { addCents: (price: number) => price + 0.01, minusCents: (price: number) => price - 0.01 },
        '../algorithms/takeProfit': { BatchCount: 5, getEntryProfitTargets: (_: string, quantity: number, entry: number, stop: number, isLong: boolean, walls: any, __: any, count: number) => calculateEntryTargets(quantity, entry, stop, isLong, walls, count) },
        '../api/broker': { submitEntryOrderWithMultipleBrackets: (_: string, quantity: number, isLong: boolean, type: string, entry: number, targets: any[]) => requests.push({ quantity, isLong, type, targets }) },
    };
    new Function('require', 'exports', compiled.outputText)((id: string) => mocks[id] ?? {}, flow);
    for (const quantity of [50, 100, 75]) for (const isLong of [true, false]) for (const market of [true, false]) {
        const plan = { planConfigs: { sizingCount: 5 } }, parameters = { entryMethod: `${quantity} sh` };
        if (market) flow.submitMarketEntryOrders('AAPL', 10, isLong ? 9 : 11, 9, isLong, 0.5, plan, 'test', {}, parameters);
        else flow.submitBreakoutOrders('AAPL', 10, isLong ? 9 : 11, 9, isLong, 0.5, plan, 'test', {}, '', parameters);
        const request = requests.at(-1);
        assert.equal(request.quantity, quantity);
        assert.equal(request.targets.length, 10);
        assert.equal(plan.planConfigs.sizingCount, 10);
        assert.equal(request.type, market ? 'MARKET' : 'STOP');
    }
});
