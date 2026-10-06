import type { TradingPlans } from '../../../models/tradingPlans/tradingPlansModels';
import type { Candle } from '../../models/market.ts';
import { impliedMarketCapInBillions, isPremarketVolumeWhitelisted, premarketEligibility, validatePreviousConsolidationArea } from './eligibility.ts';

/** Same startup filters as the browser. Missing reference shares preserve its zero fallback. */
export function startupEligibility(plan: TradingPlans, price: number, shares: number, stats: { lastDayShares: number; previousDaysSharesAverage: number }, daily: Candle[]) {
    if (plan.marketCapInMillions > 0 && plan.marketCapInMillions < 500) return 'configured market cap below $500M';
    const cap = impliedMarketCapInBillions(shares, price);
    if (plan.symbol !== 'STI' && cap > 0 && cap < .9) return 'implied market cap below $0.9B';
    if (!isPremarketVolumeWhitelisted(plan.symbol)) {
        const volume = premarketEligibility(stats.lastDayShares, stats.previousDaysSharesAverage, 500000, .9, 4);
        if (!volume.hardFloorPassed) return 'premarket shares below 500000 hard floor';
        if (!volume.absolutePassed && !volume.relativePassed) return 'premarket shares below 0.9M and 4x prior average';
    }
    return plan.rangeBoundReversalPlan ? validatePreviousConsolidationArea(plan.rangeBoundReversalPlan.previousConsolidationArea, daily) : '';
}
