import * as Models from '../models/models';
import * as TradingState from '../models/tradingState';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Helper from '../utils/helper';
import * as exitRulesCheckerSimple from './exitRulesCheckerSimple';
import * as Patterns from '../algorithms/patterns';
import * as Firestore from '../firestore';

// return true if ok to flatten
// see some trade examples in https://sunrisetrading.atlassian.net/browse/TPS-80
export const checkFlattenRules = (symbol: string, logTags: Models.LogTags) => {
    let { simpleExitRules } = getCommonInfo(symbol);
    if (simpleExitRules) {
        return exitRulesCheckerSimple.checkFlattenRules(symbol, logTags);
    } else {
        return true;
    }
};


export const checkTrailStopRules = (symbol: string, timeFrame: number, logTags: Models.LogTags) => {
    return exitRulesCheckerSimple.checkTrailStopRules(symbol, timeFrame, logTags);
}
export const checkTrailStopSingleRules = (symbol: string, batchIndex: number, timeFrame: number, logTags: Models.LogTags) => {
    return exitRulesCheckerSimple.checkTrailStopSingleRules(symbol, batchIndex, timeFrame, logTags);
}
export const checkCommonAdjustStops = (symbol: string, newPrice: number) => {
    checkRetestBeforeMovingStops(symbol);
    let { breakoutTradeState } = exitRulesCheckerSimple.getCommonInfo(symbol);
    let quality = breakoutTradeState.plan.planConfigs.setupQuality;
    if (quality == TradingPlansModels.SetupQuality.Scalp ||
        quality == TradingPlansModels.SetupQuality.Unknown) {
        Firestore.logInfo(`allow moving stop due to setup quality ${quality}`);
        return true;
    }
    let isLong = Models.getPositionNetQuantity(symbol) > 0;
    return exitRulesCheckerSimple.isLessTightThanClosedCandlesForAdjustStop(symbol, isLong, newPrice);
}
export const checkRetestBeforeMovingStops = (symbol: string) => {
    let isLong = Models.getPositionNetQuantity(symbol) > 0;
    if (Patterns.hasRetestLevel(symbol, isLong)) {
        Helper.speak(`respect original stop that retest key level`);
    }
}


const getCommonInfo = (symbol: string) => {
    let symbolState = TradingState.getSymbolState(symbol);
    let planConfigs = symbolState.activeBasePlan?.planConfigs;
    let exitPairs = Models.getExitPairs(symbol);
    return {
        isLong: Models.getPositionNetQuantity(symbol) > 0,
        secondsSinceMarketOpen: Helper.getSecondsSinceMarketOpen(new Date()),
        planConfigs: planConfigs,
        symbolState: symbolState,
        exitPairsCount: exitPairs.length,
        simpleExitRules: true,
        currentPrice: Models.getCurrentPrice(symbol),
    }
}