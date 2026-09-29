import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateEntryTargets } from '../algorithms/entryTargets.ts';
import { sharesForRisk } from '../algorithms/riskSizing.ts';
import { createBracketedEquityEntry } from '../api/schwab/entryOrderFactory.ts';
import { evaluateEntryPriceAndVolumeRules } from '../controllers/entryRuleDecision.ts';

const fixtures = JSON.parse(readFileSync(new URL('./direct-entry-fixtures.json', import.meta.url), 'utf8'));
test('native entry fixtures agree with production risk, rule, target and bracket helpers', () => {
    for (const fixture of fixtures.filter((value: any) => !value.error)) {
        const context = fixture.state.entryContext, entry = fixture.entry;
        const body = fixture.requests[0].body;
        const orderPrice = fixture.orderEntry ?? (entry.isLong ? 10.01 : 9.99);
        const orderStop = fixture.orderStop ?? (entry.isLong ? 9.49 : 10.51);
        const count = fixture.count ?? 10;
        const targetRisk = context.fixedQuantity > 0 ? orderStop : entry.stopOutPrice;
        let quantity = context.fixedQuantity > 0 ? context.fixedQuantity : Math.min(
            context.maxQuantity > 0 ? context.maxQuantity : Infinity,
            sharesForRisk(Math.abs(orderPrice - targetRisk), entry.multiplier, context.riskDollars));
        if (fixture.halfBuyingPower) quantity /= 2;
        assert.equal(quantity, entry.submitEntryResult.totalQuantity, fixture.name);
        const targets = calculateEntryTargets(quantity, orderPrice, targetRisk, entry.isLong, fixture.action.orderbook, count);
        assert.deepEqual(targets, entry.submitEntryResult.profitTargets, fixture.name);
        assert.deepEqual(createBracketedEquityEntry('AAPL', entry.isLong, body.orderType, quantity, orderPrice, targets, orderStop), body, fixture.name);
        const decision = evaluateEntryPriceAndVolumeRules({ ...context, entryPrice: 10, isLong: entry.isLong, initialSize: context.liquidityScale });
        assert.equal(decision.multiplier * (fixture.action.entry_method === '0.1 R' ? 0.1 : 1), entry.multiplier, fixture.name);
    }
});
test('entry area and no-trade-zone boundary behavior remains precise', () => {
    const input = { isLong: true, entryPrice: 10, initialSize: 1, openPrice: 10, secondsSinceMarketOpen: 100,
        vwap: 10, atr: 1, watchAreas: [], noTradeZones: [{ low: 10, high: 11 }], volumes: [] };
    assert.equal(evaluateEntryPriceAndVolumeRules(input).multiplier, 1);
    assert.equal(evaluateEntryPriceAndVolumeRules({ ...input, entryPrice: 10.01 }).multiplier, 0);
});
