export type StateObject = Record<string, any>;
export const timestamp = (now: number) => ({ seconds: Math.floor(now / 1000), nanoseconds: Math.round((now % 1000) * 1e6) });
export function dateLabel(date: string) { const [year, month, day] = date.split('-').map(Number); return `${month}/${day}/${year}`; }
export function defaultBreakout(isLong: boolean, now: number): StateObject {
    return {
        hasValue: false, entryPrice: 0, stopLossPrice: 0, coreInvalidationLevel: -1, riskLevel: 0, initialQuantity: 0,
        submitTime: timestamp(now), isLong, status: 'None', isMarketOrder: false, lowestExitBatchCount: -1, sizeMultipler: 0,
        maxPullbackAllowed: 0, maxPullbackReached: 0, adjustedTargetDueToMaxPullback: false, exitDescription: '',
        stopTightenPhase: 'idle', coreTargetReminderShown: false,
        submitEntryResult: { isSingleOrder: false, profitTargets: [], totalQuantity: 0, tradeBookID: '' },
        plan: { planConfigs: { requireReversal: true }, coreTarget: 0, coreCount: 0, runnerCount: 0, runnerTriggerCondition: '' },
    };
}
export function defaultSymbolState(now: number): StateObject {
    return { breakoutTradeStateForLong: defaultBreakout(true, now), breakoutTradeStateForShort: defaultBreakout(false, now), peakRiskMultiple: 0 };
}
export function acceptedBreakout(entry: StateObject, now: number, roundPrice = (price: number) => Math.round(price * 100) / 100): StateObject {
    return { ...defaultBreakout(entry.isLong, now), hasValue: true, entryPrice: entry.entryPrice, stopLossPrice: entry.stopOutPrice,
        riskLevel: entry.stopOutPrice, initialQuantity: entry.submitEntryResult.totalQuantity, status: 'Pending',
        isMarketOrder: entry.useMarketOrder, submitEntryResult: JSON.parse(JSON.stringify(entry.submitEntryResult)),
        plan: JSON.parse(JSON.stringify(entry.basePlan)), sizeMultipler: entry.multiplier,
        maxPullbackAllowed: roundPrice(entry.entryPrice + (entry.isLong ? -1 : 1) * 0.75 * Math.abs(entry.entryPrice - entry.stopOutPrice)) };
}
/** Owns only persisted domain state. Runtime timers and network operations stay outside. */
export class TradeState {
    private readonly state: StateObject;
    constructor(date: string, balance: number, now: number, restored?: StateObject | null) {
        this.state = restored && [date, dateLabel(date)].includes(restored.date)
            ? JSON.parse(JSON.stringify(restored)) : { date: dateLabel(date), initialBalance: balance, stateBySymbol: {}, readOnlyStateBySymbol: {} };
        this.state.stateBySymbol ??= {}; this.state.readOnlyStateBySymbol ??= {};
        this.now = now;
    }
    private readonly now: number;
    symbol(symbol: string): StateObject { return this.state.stateBySymbol[symbol] ??= defaultSymbolState(this.now); }
    direction(symbol: string, isLong: boolean): StateObject {
        const state = this.symbol(symbol), key = isLong ? 'breakoutTradeStateForLong' : 'breakoutTradeStateForShort';
        return state[key] ??= defaultBreakout(isLong, this.now);
    }
    acceptEntry(symbol: string, entry: StateObject, atr: StateObject, now: number) {
        if (entry.preserveExistingTrade) return false;
        const state = this.symbol(symbol), breakout = acceptedBreakout(entry, now);
        state[entry.isLong ? 'breakoutTradeStateForLong' : 'breakoutTradeStateForShort'] = breakout;
        state.activeBasePlan = JSON.parse(JSON.stringify(entry.basePlan)); this.state.readOnlyStateBySymbol[symbol] = { atr: JSON.parse(JSON.stringify(atr)) }; return true;
    }
    updateCorePlan(symbol: string, isLong: boolean, target: number, count: number) {
        if (!Number.isFinite(target) || target <= 0 || !Number.isInteger(count) || count < 0 || count > 7) throw new Error('Invalid core target/count');
        const state = this.direction(symbol, isLong);
        if (!state.hasValue || (isLong ? target <= state.entryPrice : target >= state.entryPrice)) throw new Error('Core target must be on the profitable side of the active entry');
        Object.assign(state.plan, { coreTarget: target, coreCount: count });
        if (this.symbol(symbol).activeBasePlan) Object.assign(this.symbol(symbol).activeBasePlan, { coreTarget: target, coreCount: count });
    }
    snapshot(): StateObject { return JSON.parse(JSON.stringify(this.state)); }
}
