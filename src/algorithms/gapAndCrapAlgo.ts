import * as Models from '../models/models';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Firestore from '../firestore';

export const hasAtLeastOneReasonSet = (plan: TradingPlansModels.GapAndCrapPlan, symbol: string): boolean => {
    const hasOne =
        !!plan.heavySupplyZoneDays ||
        !!plan.recentRallyWithoutPullback ||
        !!plan.extendedGapUpInAtr ||
        !!plan.earnings ||
        !!plan.topEdgeOfCurrentRange ||
        !!plan.nearBelowPreviousEventKeyLevel;
    if (!hasOne) {
        Firestore.logError(`${symbol} missing one reason set for gap and crap plan`);
        return false;
    }
    return true;
};

export const getAllowedReasonToAddPartial = (symbol: string, entryPrice: number, logTags: Models.LogTags): Models.CheckRulesResult => {
    let vwap = Models.getCurrentVwap(symbol);
    if (entryPrice < vwap) {
        return {
            allowed: true,
            reason: `entry price ${entryPrice} is below vwap ${vwap}`,
        };
    }
    return {
        allowed: false,
        reason: 'default is no add',
    };
}