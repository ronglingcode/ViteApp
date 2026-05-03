import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Firestore from '../firestore';

export const hasAtLeastOneReasonSet = (plan: TradingPlansModels.GapDownAndGoUpPlan, symbol: string): boolean => {
    const hasOne = !!plan.nearAboveSupport || !!plan.nearAboveKeyEventLevel;
    if (!hasOne) {
        Firestore.logError(`${symbol} missing one reason set for gap down and go up plan`);
        return false;
    }
    return true;
};
