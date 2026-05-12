import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Firestore from '../firestore';
import * as Models from '../models/models';

export const hasAtLeastOneReasonSet = (plan: TradingPlansModels.GapDownAndGoDownPlan, symbol: string): boolean => {
    const hasOne =
        !!plan.nearBelowConsolidationRange ||
        !!plan.nearBelowConsolidationRangeTop ||
        !!plan.buyersTrappedBelowThisLevel ||
        !!plan.previousInsideDay;
    if (!hasOne) {
        Firestore.logError(`${symbol} missing one reason set for gap down and go down plan`);
        return false;
    }
    return true;
}


export const getAllowedReasonToAddPartial = (symbol: string, entryPrice: number): Models.CheckRulesResult => {
    let vwap = Models.getCurrentVwap(symbol);
    if (entryPrice < vwap) {
        return {
            allowed: true,
            reason: `entry price ${entryPrice} is below vwap ${vwap}`,
        };
    }
    return {
        allowed: false,
        reason: 'wait for below vwap',
    };
}