import type { TradingPlans, BasePlan, SupportResistanceArea } from '../../../models/tradingPlans/tradingPlansModels';

export interface TradebookDefinition { tradebookID: string; isLong: boolean; enabled: boolean; basePlan: BasePlan; entryArea: SupportResistanceArea }
export function createTradebookDefinitions(plan: TradingPlans): TradebookDefinition[] {
    const definitions: TradebookDefinition[] = [];
    const add = (id: string, isLong: boolean, basePlan: BasePlan | undefined, entryArea: SupportResistanceArea | undefined) => {
        if (basePlan && entryArea) definitions.push({ tradebookID: id, isLong, enabled: true, basePlan, entryArea });
    };
    if (plan.long.enabled !== false) {
        add('GapGiveAndGoBookmapReversal', true, plan.long.gapAndGoPlan, plan.long.gapAndGoPlan?.support);
        add('GapDownAndGoUpBookmapReversal', true, plan.long.gapDownAndGoUpPlan, plan.long.gapDownAndGoUpPlan?.support);
    }
    if (plan.short.enabled !== false) {
        add('GapAndCrapOfferStepDownReappear', false, plan.short.gapAndCrapPlan, plan.short.gapAndCrapPlan?.resistance);
        add('GapDownAndGoDownOfferStepDownReappear', false, plan.short.gapDownAndGoDownPlan, plan.short.gapDownAndGoDownPlan?.resistance);
    }
    if (plan.rangeBoundReversalPlan) {
        const range = plan.rangeBoundReversalPlan;
        const support = range.support && { ...range.support, low: Math.min(range.support.low, range.support.high), high: Math.max(range.support.low, range.support.high) };
        const resistance = range.resistance && { ...range.resistance, low: Math.min(range.resistance.low, range.resistance.high), high: Math.max(range.resistance.low, range.resistance.high) };
        if (support && resistance && support.low > 0 && support.low < support.high && resistance.low < resistance.high && support.high < resistance.low) {
            add('RangeBoundBidReversal', true, range, support); add('RangeBoundOfferReversal', false, range, resistance);
        }
    }
    return definitions;
}
const reasons = {
    gapAndGoPlan: ['higherTimeframeSupportReversal', 'recentPullback', 'nearAboveConsolidationRange', 'nearBelowConsolidationRangeTop', 'nearPreviousKeyEventLevel', 'previousInsideDay', 'allTimeHigh'],
    gapAndCrapPlan: ['heavySupplyZoneDays', 'recentRallyWithoutPullback', 'extendedGapUpInAtr', 'earnings', 'topEdgeOfCurrentRange', 'nearBelowPreviousEventKeyLevel'],
    gapDownAndGoDownPlan: ['higherTimeframeResistanceReversal', 'nearBelowConsolidationRange', 'nearBelowConsolidationRangeTop', 'buyersTrappedBelowThisLevel', 'previousInsideDay'],
    gapDownAndGoUpPlan: ['nearAboveSupport', 'nearAboveKeyEventLevel'],
} as const;
export function validateTradingPlan(plan: TradingPlans): string {
    const symbol = plan.symbol, raw = plan as any;
    if (typeof plan.corePlan !== 'string' || plan.corePlan.trim().length <= 50) return `${symbol} core plan must contain more than 50 characters`;
    if (!plan.analysis?.gap?.pdc) return `${symbol} missing gap pdc`;
    if (!plan.atr || !(plan.atr.average > 0) || !(plan.atr.mutiplier > 0) || !(plan.atr.minimumMultipler > 0)) return `${symbol} missing atr`;
    const areaError = (area: SupportResistanceArea | undefined, name: string, requireRange = false) => {
        if (!area || !Number.isFinite(area.low) || !Number.isFinite(area.high) || Math.min(area.low, area.high) <= 0 || requireRange && area.low === area.high) return `${symbol} missing ${name}`;
        if (area.requireEntryWithinRange !== undefined && typeof area.requireEntryWithinRange !== 'boolean') return `${symbol} ${name} requireEntryWithinRange must be a boolean`;
        return '';
    };
    if (plan.rangeBoundReversalPlan) {
        const range = plan.rangeBoundReversalPlan;
        const error = areaError(range.support, 'support zone for range bound reversal', true) || areaError(range.resistance, 'resistance zone for range bound reversal', true);
        if (error) return error;
        if (Math.max(range.support.low, range.support.high) >= Math.min(range.resistance.low, range.resistance.high)) return `${symbol} range bound reversal support zone must be below resistance zone`;
    }
    for (const side of ['long', 'short']) {
        const direction = raw[side]; if (!direction) return `${symbol} missing ${side} plan`;
        if (direction.enabled === false) continue;
        // A live reference is valid before the market loader has produced its value.
        const target = direction.firstTargetToAdd;
        if (!['vwap', 'premarketHigh', 'premarketLow'].includes(target) && !(Number(target) > 0)) return `${symbol} missing first target to add`;
        if (!Array.isArray(direction.finalTargets) || direction.finalTargets.length < 2) return `${symbol} need at least 2 final targets`;
        for (const [index, target] of direction.finalTargets.entries()) {
            if (!target.partialCount) return `${symbol} missing partial count for final target[${index}]`;
            if (!target.text) return `${symbol} missing text for final target[${index}]`;
            if (!target.rrr && !target.level && !target.atr) return `${symbol} missing atr,rrr,level for final target[${index}]`;
        }
        let hasTradebook = !!plan.rangeBoundReversalPlan;
        for (const [name, fields] of Object.entries(reasons)) if (direction[name]) {
            const base = direction[name], area = name === 'gapAndGoPlan' || name === 'gapDownAndGoUpPlan' ? 'support' : 'resistance';
            const error = areaError(base[area], `${name} ${area}`); if (error) return error;
            if (!fields.some(field => !!base[field])) return `${symbol} missing one reason set for ${name}`;
            hasTradebook = true;
        }
        if (!hasTradebook) return `${symbol} missing best tradebook`;
    }
    return '';
}
export function readTradingConfig(raw: Record<string, any> | null, maxStocks = 1) {
    if (!raw || !Array.isArray(raw.plans) || !Array.isArray(raw.stockSelections)) throw new Error('Trading configuration missing plans/stockSelections');
    const plans = raw.plans as TradingPlans[], symbols = raw.stockSelections as string[];
    if (symbols.some(symbol => typeof symbol !== 'string' || !symbol)) throw new Error('Trading configuration contains an invalid stock selection');
    if (symbols.length > maxStocks) throw new Error(`more than ${maxStocks} stocks in watchlist: ${symbols.join(', ')}`);
    for (const symbol of symbols) {
        const plan = plans.find(plan => plan.symbol === symbol); if (!plan) throw new Error(`${symbol} missing trading plans`);
        const error = validateTradingPlan(plan); if (error) throw new Error(error);
    }
    return { plans, symbols, profile: String(raw.activeProfileName || 'momentumSimple'), tradingSettings: raw.tradingSettings ?? { useSingleOrderForEntry: false, snapMode: true } };
}
