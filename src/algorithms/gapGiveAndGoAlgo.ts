import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Firestore from '../firestore';
import * as Models from '../models/models';
import * as Helper from '../utils/helper';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
export const hasAtLeastOneReasonSet = (plan: TradingPlansModels.GapGiveAndGoPlan, symbol: string): boolean => {
    const hasOne =
        !!plan.nearAboveConsolidationRange ||
        !!plan.nearBelowConsolidationRangeTop ||
        !!plan.nearPreviousKeyEventLevel ||
        !!plan.previousInsideDay ||
        !!plan.allTimeHigh;
    if (!hasOne) {
        Firestore.logError(`${symbol} missing one reason set for gap give and go plan`);
        return false;
    }
    return true;
}