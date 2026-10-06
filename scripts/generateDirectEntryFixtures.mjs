// Regenerate sanitized parity fixtures from production pure TS helpers.
// Run: node --experimental-strip-types scripts/generateDirectEntryFixtures.mjs
import { writeFileSync } from 'node:fs';
import { calculateEntryTargets } from '../src/algorithms/entryTargets.ts';
import { createBracketedEquityEntry } from '../src/api/schwab/entryOrderFactory.ts';
const plan = { planConfigs: { sizingCount: 10 }, coreTarget: 12, coreCount: 3 };
const definition = (tradebookID, isLong) => ({ tradebookID, isLong, enabled: true, basePlan: plan, entryArea: { low: 9, high: 11 } });
const context = { observedAt: 1, definitions: [definition('RangeBoundBidReversal', true), definition('RangeBoundOfferReversal', false)],
    attendanceAllowed: true, watchlistBlockReason: '', realizedPnl: 0, dailyMaxLoss: 4000, riskDollars: 1000,
    liquidityScale: 1, secondsSinceMarketOpen: 300, openPrice: 10, vwap: 10, atr: 1,
    maxQuantity: 0, watchAreas: [], noTradeZones: [], volumes: [500000, 300000, 250000],
    highOfDay: 10, lowOfDay: 9.5, customEntryPrice: 0, customStopLong: 9.5, customStopShort: 10.5,
    fixedQuantity: 0, availableBuyingPower: 1_000_000 };
const state = { symbol: 'AAPL', revision: 1, observedAt: 1, quoteObservedAt: 1,
    netQuantity: 0, currentPrice: 10, bid: 10, ask: 10, batchCount: 10, splitPartials: false,
    hasPlan: false, coreRuleEnabled: true, rulesSupported: true, entries: [], pairs: [], entryContext: context };
const action = { tradebook_id: 'RangeBoundBidReversal', entry_method: '1 R', symbol: 'AAPL', priceUnit: 'real' };
const fixtures = [];
const clone = value => structuredClone(value);
function add(name, edit = () => {}, expected = {}) {
    const fixture = { name, state: clone(state), action: clone(action), key: '', error: false };
    edit(fixture);
    Object.assign(fixture, expected);
    if (!fixture.error) {
        const isLong = fixture.action.tradebook_id === 'RangeBoundBidReversal';
        const entryPrice = fixture.entryPrice ?? 10;
        const stopOutPrice = fixture.stopOutPrice ?? (isLong ? 9.5 : 10.5);
        const orderEntry = fixture.orderEntry ?? (isLong ? 10.01 : 9.99);
        const orderStop = fixture.orderStop ?? (isLong ? 9.49 : 10.51);
        const multiplier = fixture.multiplier ?? 1;
        const count = fixture.count ?? 10;
        const shares = fixture.shares ?? 1960;
        const targets = calculateEntryTargets(fixture.halfBuyingPower ? shares * 2 : shares, orderEntry,
            fixture.state.entryContext.fixedQuantity > 0 ? orderStop : stopOutPrice, isLong, fixture.action.orderbook, count);
        if (fixture.halfBuyingPower) targets.forEach(target => { target.quantity /= 2; });
        const body = createBracketedEquityEntry('AAPL', isLong, fixture.type ?? 'STOP', shares, orderEntry, targets, orderStop);
        fixture.requests = [{ method: 'POST', orderId: '', body }];
        fixture.entry = { isLong, useMarketOrder: fixture.type === 'MARKET', entryPrice, stopOutPrice, multiplier,
            submitEntryResult: { totalQuantity: shares, profitTargets: targets, isSingleOrder: false, tradeBookID: fixture.action.tradebook_id } };
    }
    fixtures.push(fixture);
}
add('long full risk stop with ten protective pairs');
add('short full risk stop', f => { f.action.tradebook_id = 'RangeBoundOfferReversal'; f.state.entryContext.customEntryPrice = 10; });
add('small entry has one pair', f => { f.action.entry_method = '0.1 R'; }, { multiplier: 0.1, count: 1, shares: 196 });
add('half risk long entry has five pairs', f => { f.action.entry_method = '0.5 R'; }, { multiplier: 0.5, count: 5, shares: 980 });
add('half risk short entry has five pairs', f => { f.action.entry_method = '0.5 R'; f.action.tradebook_id = 'RangeBoundOfferReversal'; f.state.entryContext.customEntryPrice = 10; }, { multiplier: 0.5, count: 5, shares: 980 });
add('half risk fixed quantity keeps five pairs', f => { f.action.entry_method = '0.5 R'; f.state.entryContext.fixedQuantity = 23; }, { multiplier: 0.5, count: 5, shares: 23 });
add('half risk thin volume reduces risk and pairs further', f => { f.action.entry_method = '0.5 R'; f.state.entryContext.volumes = [500000, 80000, 60000]; }, { multiplier: 0.25, count: 3, shares: 490 });
add('other numeric risk method uses two risk units', f => { f.action.entry_method = '2 R'; }, { multiplier: 2, shares: 3921 });
add('unparsed risk method uses default risk', f => { f.action.entry_method = 'unparsed method'; });
add('market estimate uses larger long Bookmap price', f => { f.action.use_market_order = true; f.action.estimated_entry_price = 10.2; },
    { type: 'MARKET', entryPrice: 10.2, orderEntry: 10.21, shares: 1408 });
add('short market estimate uses smaller Bookmap price', f => { f.action.tradebook_id = 'RangeBoundOfferReversal'; f.action.use_market_order = true; f.action.estimated_entry_price = 9.8; },
    { type: 'MARKET', entryPrice: 9.8, orderEntry: 9.79, shares: 1408 });
add('hover stop entry uses price and ignores shift market', f => { f.key = 'KeyB'; f.action.source = 'bookmap_chart_hotkey'; f.action.price = 10.2; f.action.shiftKey = true; },
    { entryPrice: 10.2, orderEntry: 10.21, shares: 1408 });
for (const seconds of [-1, 0, 23400, 23401]) {
    add(`common entry rules have no session gate at ${seconds} seconds`, f => { f.state.entryContext.secondsSinceMarketOpen = seconds; });
}
add('common entry rules do not cap size multiplier at one', f => { f.state.entryContext.liquidityScale = 2; }, { multiplier: 2, shares: 3921 });
add('manual prices do not require day levels', f => { f.state.entryContext.highOfDay = 0; f.state.entryContext.lowOfDay = 0; f.state.entryContext.customEntryPrice = 10; });
add('protective stop side is left to broker', f => { f.state.entryContext.customStopLong = 10.5; }, { stopOutPrice: 10.5, orderStop: 10.49, shares: 2040 });
add('liquidity downgrade reduces risk and pairs', f => { f.state.entryContext.liquidityScale = 0.35; }, { multiplier: 0.35, count: 4, shares: 686 });
add('thin volume halves initial risk', f => { f.state.entryContext.volumes = [500000, 80000, 60000]; }, { multiplier: 0.5, count: 5, shares: 980 });
add('opposing vwap halves risk only with watch areas', f => { f.state.entryContext.watchAreas = [20]; f.state.entryContext.vwap = 10.1; }, { multiplier: 0.5, count: 5, shares: 980 });
add('fixed quantity keeps requested pair count and uses slipped stop for targets', f => { f.state.entryContext.fixedQuantity = 23; }, { shares: 23 });
add('buying power halves integral legs while keeping the plan risk multiplier', f => { f.state.entryContext.availableBuyingPower = 15000; }, { shares: 980, halfBuyingPower: true });
// Native execution warns and dispatches; the broker owns these rejection decisions.
add('native buying power exhausted warns and dispatches half size', f => { f.state.entryContext.availableBuyingPower = 1; }, { shares: 980, halfBuyingPower: true });
add('native fractional half legs passed to broker', f => { f.state.entryContext.fixedQuantity = 23; f.state.entryContext.availableBuyingPower = 200; }, { shares: 11.5, halfBuyingPower: true });
add('ATR cap applies before even target split', f => { f.state.entryContext.maxQuantity = 27; }, { shares: 27 });
add('Bookmap walls deduplicate sort and fill remaining with 3R', f => { f.action.orderbook = { priceUnit: 'real', effectiveWallThreshold: 5000,
    largeAsks: [[10.4, 6000], [10.3, 5000], [10.3, 7000], [10.5, 4000], [10.6, 8000], [10.7, 9000]], largeBids: [] }; });
add('quote makes breakout limit', f => { f.state.currentPrice = 10.1; }, { type: 'LIMIT' });
add('Bookmap day lows expand default stop', f => { f.state.entryContext.customStopLong = 0; f.action.bookmapDayHighLow = { high: 10, low: 9.4, priceUnit: 'real' }; },
    { stopOutPrice: 9.4, orderStop: 9.39, shares: 1639 });
for (const [name, edit] of [
    ['attendance blocked', f => { f.state.entryContext.attendanceAllowed = false; }],
    ['daily loss at limit', f => { f.state.entryContext.realizedPnl = -4000; }],
    ['watchlist limit', f => { f.state.entryContext.watchlistBlockReason = 'too many symbols'; }],
    ['liquidity unavailable', f => { f.state.entryContext.liquidityScale = 0; }],
    ['opposing watch area', f => { f.state.entryContext.watchAreas = [10.1]; }],
    ['inside no trade zone', f => { f.state.entryContext.noTradeZones = [{ low: 9.9, high: 10.1 }]; }],
    ['outside required entry range', f => { f.state.entryContext.definitions[0].entryArea = { low: 11, high: 12, requireEntryWithinRange: true }; }],
    ['retest blocked', f => { f.action.retest_blocked = true; }],
    ['wrong chart side', f => { f.key = 'KeyS'; f.action.source = 'bookmap_chart_hotkey'; f.action.price = 10; }],
]) add(name, edit, { error: true });
const json = JSON.stringify(fixtures, null, 2) + '\n';
writeFileSync(new URL('../src/bookmap/direct-entry-fixtures.json', import.meta.url), json);
writeFileSync(new URL('../../bookmap-plugin/src/test/resources/direct-entry-fixtures.json', import.meta.url), json);
