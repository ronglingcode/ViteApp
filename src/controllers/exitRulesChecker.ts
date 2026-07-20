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

const getCommonInfo = (symbol: string) => {
    let symbolState = TradingState.getSymbolState(symbol);
    let planConfigs = symbolState.activeBasePlan?.planConfigs;
    let exitPairs = Models.getExitPairs(symbol);
    return {
        isLong: Models.getPositionNetQuantity(symbol) > 0,
        secondsSinceMarketOpen: Helper.getSecondsSinceMarketOpen(Helper.getCurrentMarketTime()),
        planConfigs: planConfigs,
        symbolState: symbolState,
        exitPairsCount: exitPairs.length,
        simpleExitRules: true,
        currentPrice: Models.getCurrentPrice(symbol),
    }
}
