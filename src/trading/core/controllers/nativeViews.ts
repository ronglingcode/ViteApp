import type { StateObject } from '../state/tradeState.ts';
import { createTradebookDefinitions } from '../configuration/tradingConfig.ts';
import { calculateCamPivots } from '../marketdata/levels.ts';
import { completedPartials } from './workflows.ts';

const names: Record<string, [string, string]> = {
    GapGiveAndGoBookmapReversal: ['Gap, Give & Go', 'Gap, give and go bookmap reversal'],
    GapDownAndGoUpBookmapReversal: ['Gap Down & Go Up Bookmap Reversal', 'gap down & go up bookmap bid reversal'],
    GapAndCrapOfferStepDownReappear: ['Gap & Crap Offer Step Down Or Reappear', 'Gap & Crap offer step down / reappear'],
    GapDownAndGoDownOfferStepDownReappear: ['Gap Down & Go Down Offer Step Down Or Reappear', 'Gap Down & Go Down offer step down / reappear'],
    RangeBoundBidReversal: ['Range Bound Bid Reversal', 'Range Bound bid reversal'],
    RangeBoundOfferReversal: ['Range Bound Offer Reversal', 'Range Bound offer reversal'],
};
export function sortedExitPairs(pairs: StateObject[]) {
    return [...pairs].sort((a, b) => !a.LIMIT ? b.LIMIT ? 1 : 0 : !b.LIMIT ? -1 : a.LIMIT.isBuy ? b.LIMIT.price - a.LIMIT.price : a.LIMIT.price - b.LIMIT.price);
}
export function positionRisk(net: number, average: number, pairs: StateObject[], low: number, high: number) {
    let covered = 0, dollars = 0;
    for (const pair of pairs) if (pair.STOP) { const quantity = Math.min(Math.max(0, Math.abs(net) - covered), pair.STOP.quantity); covered += quantity; dollars += Math.abs(average - pair.STOP.price) * quantity; }
    const extreme = net > 0 ? low : high;
    if (extreme > 0) dollars += Math.abs(average - extreme) * Math.max(0, Math.abs(net) - covered);
    return dollars;
}
/** Local domain -> existing Bookmap display protocol, without plugin or browser APIs. */
export function nativeViews(view: StateObject): StateObject[] {
    const symbol = view.symbol, timestamp = view.timestamp, market = view.market ?? {}, plan = view.plan ?? {}, policy = view.policy ?? {}, account = view.account ?? {};
    const message = (type: string, fields: StateObject) => ({ type, symbol, timestamp, priceUnit: 'real', ...fields });
    const vwapPoints = () => (market.vwaps ?? (market.closedVwap ? [market.closedVwap] : []))
        .filter((point: StateObject) => point.value > 0 && point.datetime + 60000 <= timestamp)
        .map((point: StateObject) => message('vwap_update', { vwap: point.value, effectiveTimeMs: point.datetime + 60000, sentAtMs: timestamp }));
    if (view.type === 'market_update') return vwapPoints();
    const pairs = sortedExitPairs(account.exitPairs?.[symbol] ?? []), entries = account.entryOrders?.[symbol] ?? [], position = account.positions?.[symbol], net = position?.netQuantity ?? 0;
    const active = view.state?.stateBySymbol?.[symbol]?.[net > 0 ? 'breakoutTradeStateForLong' : 'breakoutTradeStateForShort'] ?? {}, captured = active.plan ?? {};
    const levels: StateObject[] = [], zones: StateObject[] = [], seen = new Set<number>(), zoneKeys = new Set<string>();
    for (const level of plan.keyLevels?.otherLevels ?? []) if (Number.isFinite(level.price) && level.price > 0 && !seen.has(level.price)) { seen.add(level.price); levels.push({ ...level }); }
    const addZone = (area: StateObject | undefined, label = '', color = '') => { if (!area) return; const low = Math.min(area.low, area.high), high = Math.max(area.low, area.high), key = `${low}:${high}`;
        if (!(low > 0 && high > low) || !Number.isFinite(high) || zoneKeys.has(key)) return; zoneKeys.add(key); zones.push({ low, high, label: area.label?.trim() || label, color: area.color?.trim() || color }); };
    for (const zone of plan.keyLevels?.zones ?? []) addZone(zone);
    addZone(plan.rangeBoundReversalPlan?.support, 'support', 'green'); addZone(plan.rangeBoundReversalPlan?.resistance, 'resistance', 'red');
    addZone(plan.long?.gapAndGoPlan?.support, 'gap & go support', 'green'); addZone(plan.long?.gapDownAndGoUpPlan?.support, 'gap down & go up support', 'green');
    addZone(plan.short?.gapAndCrapPlan?.resistance, 'gap & crap resistance', 'red'); addZone(plan.short?.gapDownAndGoDownPlan?.resistance, 'gap down & go down resistance', 'red');
    const previous = view.history?.dailyBars?.at(-1), result: StateObject[] = [];
    const mode = (value: unknown) => value === 'yes' || value === 'warning' ? value : 'no';
    result.push(message('trade_button_config', { tradebooks: plan.long && plan.short ? createTradebookDefinitions(plan).map(def => ({ id: `${symbol}:${def.tradebookID}`, label: names[def.tradebookID]?.[1] ?? def.tradebookID, sideIsLong: def.isLong, tradebookId: def.tradebookID, tradebookName: names[def.tradebookID]?.[0] ?? def.tradebookID, entryMethods: ['1 R', '0.5 R', '0.1 R'] })) : [] }));
    result.push(message('key_levels_config', { levels, zones, waitForBidRetest: mode(plan.analysis?.waitForBidRetest), waitForOfferRetest: mode(plan.analysis?.waitForOfferRetest),
        ...(previous ? { previousDay: { high: previous.high, low: previous.low }, camPivots: calculateCamPivots(previous.high, previous.low, previous.close) } : {}), premarket: { high: market.premarketHigh ?? 0, low: market.premarketLow ?? 0 } }));
    result.push(message('exit_order_pairs_config', { pairs: pairs.map((pair, index) => ({ ...pair, index: index + 1 })) }));
    const openOrders: StateObject[] = [];
    const addOrder = (order: StateObject | undefined, role: string, pair?: StateObject, pairIndex?: number) => { if (order) openOrders.push({ ...order, role, orderType: order.orderType ?? order.type, ...(pair ? { source: pair.source, parentOrderID: pair.parentOrderID, pairIndex } : {}) }); };
    entries.forEach((entry: StateObject) => addOrder(entry, 'ENTRY')); pairs.forEach((pair, index) => { addOrder(pair.STOP, 'STOP', pair, index + 1); addOrder(pair.LIMIT, 'LIMIT', pair, index + 1); });
    const risk = positionRisk(net, position?.averagePrice ?? 0, pairs, market.lowOfDay ?? 0, market.highOfDay ?? 0), multiple = Math.round(risk / (policy.riskDollars || 1000) * 1000) / 1000;
    const riskPercent = Math.round(multiple * 100 * (multiple * 100 > 2 ? 1 : 10)) / (multiple * 100 > 2 ? 1 : 10);
    result.push(message('account_state', { ...(net && position.averagePrice > 0 ? { position: { ...position, symbol, riskPercent, riskText: multiple > 0 ? `${net > 0 ? '+' : '-'}${multiple >= 10 ? Math.round(multiple) : Math.round(multiple * 100) / 100}R` : '' } } : {}), openOrders,
        executions: (account.executions?.[symbol] ?? []).map((fill: StateObject) => ({ ...fill, timeMs: fill.timestamp })) }));
    const core: StateObject = { hasActiveTrade: !!(net && policy.coreTargetEnabled && active.hasValue), reminderRequested: view.reminderRequested === true, requestId: view.requestId ?? '', updateStatus: view.updateStatus ?? '', error: view.error ?? '' };
    if (core.hasActiveTrade) { const submit = active.submitTime ?? {}, submitMs = (submit.seconds ?? 0) * 1000 + (submit.nanoseconds ?? 0) / 1000000, count = captured.planConfigs?.sizingCount || policy.batchCount || 10;
        const exited = (account.executions?.[symbol] ?? []).filter((fill: StateObject) => !fill.positionEffectIsOpen && fill.timestamp >= submitMs).reduce((sum: number, fill: StateObject) => sum + fill.quantity, 0);
        Object.assign(core, { isLong: net > 0, entryPrice: active.entryPrice, coreTarget: captured.coreTarget, coreCount: captured.coreCount ?? 0, runnerCondition: captured.runnerTriggerCondition ?? '', runnerCount: captured.runnerCount ?? 0, corePlan: plan.corePlan ?? '', bufferedTarget: active.entryPrice + .9 * (captured.coreTarget - active.entryPrice), partialsTaken: completedPartials(active.initialQuantity, exited, pairs.length, count), tradeId: `${symbol}:${net > 0 ? 'long' : 'short'}:${submitMs}` }); }
    result.push(message('core_plan_config', core));
    result.push(...vwapPoints());
    return result;
}
