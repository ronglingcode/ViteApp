import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Firestore from '../firestore';
import * as Models from '../models/models';

export const hasAtLeastOneReasonSet = (plan: TradingPlansModels.GapDownAndGoUpPlan, symbol: string): boolean => {
    const hasOne = !!plan.nearAboveSupport || !!plan.nearAboveKeyEventLevel;
    if (!hasOne) {
        Firestore.logError(`${symbol} missing one reason set for gap down and go up plan`);
        return false;
    }
    return true;
};

export const getAllowedReasonToAddPartial = (symbol: string, entryPrice: number): Models.CheckRulesResult => {
    let symbolData = Models.getSymbolData(symbol);
    let premarketHigh = symbolData.premktHigh;
    if (entryPrice >= premarketHigh) {
        return {
            allowed: true,
            reason: "price is above premarket high, allow add",
        };
    }
    return {
        allowed: false,
        reason: "wait for premarket high",
    };
};
