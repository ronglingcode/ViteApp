import * as Models from "../models/models";
import * as VolumeMonitor from "./volumeMonitor";
import * as Rules from "../algorithms/rules";
import * as Firestore from "../firestore";
import * as RiskManager from "../algorithms/riskManager";
import * as TradingState from "../models/tradingState";
import * as TradebooksManager from "../tradebooks/tradebooksManager";
import * as TakeProfit from "../algorithms/takeProfit";
import * as ExitRulesCheckerSimple from './exitRulesCheckerSimple';
import * as Helper from "../utils/helper";
import * as Patterns from "../algorithms/patterns";

export const isAllowedForAllOrdersForAllTradebooks = (symbol: string, isLong: boolean, isMarketOrder: boolean, newPrice: number, logTags: Models.LogTags) => {
    let { planConfigs, exitPairsCount } = getCommonInfo(symbol);
    let seconds = Helper.getSecondsSinceMarketOpen(new Date());
    if (seconds > 60 * 30) {
        Firestore.logInfo(`allow after 30 minutes since open`, logTags);
        return true;
    }
    if (RiskManager.isOverSized(symbol)) {
        Firestore.logInfo(`allow exit when over sized`, logTags);
        return true;
    }
    let exitCount = Models.getExitOrdersPairs(symbol).length;
    if (exitCount > TakeProfit.BatchCount) {
        Firestore.logInfo(`allow exit when more than ${TakeProfit.BatchCount} partials`, logTags);
        return true;
    }
    return false;
}
export const isAllowedForLimitOrderForAllTradebooks = (
    symbol: string, isLong: boolean, isMarketOrder: boolean, newPrice: number, keyIndex: number,
    exitPair: Models.ExitPair, logTags: Models.LogTags) => {
    let allowedByAll = isAllowedForAllOrdersForAllTradebooks(symbol, isLong, isMarketOrder, newPrice, logTags);
    if (allowedByAll) {
        return true;
    }
    if (Rules.isIncreasingTarget(isLong, newPrice, exitPair)) {
        return true;
    }
    return false;
}
export const isAllowedForSingleOrderForAllTradebooks = (symbol: string, isLong: boolean, isMarketOrder: boolean, newPrice: number, keyIndex: number, logTags: Models.LogTags) => {
    let allowedForAllOrders = isAllowedForAllOrdersForAllTradebooks(symbol, isLong, isMarketOrder, newPrice, logTags);
    if (allowedForAllOrders) {
        return true;
    }
    let { planConfigs, exitPairsCount } = getCommonInfo(symbol);
    if (planConfigs) {
        let allowCount = planConfigs.allowFirstFewExitsCount + 1;
        let extraCount = exitPairsCount - (TakeProfit.BatchCount - allowCount);
        if (extraCount > 0 &&
            (isMarketOrder || keyIndex < extraCount)) {
            Firestore.logInfo(`allow exit for the first ${allowCount} exits`, logTags);
            return true;
        }
    }
    if (Rules.isAllowedForAddedPosition(symbol, isLong, isMarketOrder, newPrice, keyIndex, false)) {
        return true;
    }

    let spread = Models.getCurrentSpread(symbol);
    let failedMinimumTarget = ExitRulesCheckerSimple.failedMinimumTargetForSingle(symbol, newPrice, keyIndex, spread, logTags);
    if (!failedMinimumTarget) {
        return true;
    }
    return false;
}

export const getCommonInfo = (symbol: string) => {
    let isLong = Models.getPositionNetQuantity(symbol) > 0;
    let symbolState = TradingState.getSymbolState(symbol);
    let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
    let planConfigs = symbolState.activeBasePlan?.planConfigs;
    let exitTargets = symbolState.activeBasePlan?.targets;
    let minimumExitTargets = exitTargets?.minimumTargets;
    let trail5Count = exitTargets ? exitTargets.trail5Count : 0;
    let trail15Count = exitTargets ? exitTargets.trail15Count : 0;
    let exitPairs = Models.getExitPairs(symbol);
    let atr = TradingState.getAtrInTrade(symbol);
    let isHigherTimeFrame = breakoutTradeState.plan.timeframe && breakoutTradeState.plan.timeframe > 1;
    let tradebookID = breakoutTradeState.submitEntryResult.tradeBookID;
    return {
        isLong: isLong,
        planConfigs: planConfigs,
        symbolState: symbolState,
        breakoutTradeState: breakoutTradeState,
        exitPairsCount: exitPairs.length,
        todayRange: Models.getTodayRange(atr),
        averageRange: atr.average,
        simpleExitRules: true,
        minimumExitTargets: minimumExitTargets,
        atr: atr,
        trail5Count: trail5Count,
        trail15Count: trail15Count,
        isHigherTimeFrame: isHigherTimeFrame,
        tradebookID: tradebookID,
    }
}

export const isAllowedToAdjustSingleLimitOrder = (symbol: string, keyIndex: number,
    order: Models.OrderModel, pair: Models.ExitPair,
    newPrice: number, logTags: Models.LogTags) => {
    let { tradebookID } = getCommonInfo(symbol);
    let tradebook = TradebooksManager.getTradebookByID(symbol, tradebookID);
    if (tradebook) {
        let result = tradebook.getDisallowedReasonToAdjustSingleLimitOrder(symbol, keyIndex, order, pair, newPrice, logTags);
        let text = result.allowed ? `allow` : `cannot`;
        Firestore.logInfo(`${text} adjust limit order: ${result.reason}`, logTags);
        return result.allowed;
    } else {
        Firestore.logInfo(`no tradebook found for ${symbol}`, logTags);
    }
    return true;
}
export const checkAdjustSingleStopOrderRules = (symbol: string, keyIndex: number,
    order: Models.OrderModel, pair: Models.ExitPair,
    newPrice: number, logTags: Models.LogTags) => {
    let { tradebookID } = getCommonInfo(symbol);
    let tradebook = TradebooksManager.getTradebookByID(symbol, tradebookID);
    if (tradebook) {
        let result = tradebook.getDisallowedReasonToAdjustSingleStopOrder(symbol, keyIndex, order, pair, newPrice, logTags);
        let text = result.allowed ? `allow` : `cannot`;
        Firestore.logInfo(`${text} adjust stop order: ${result.reason}`, logTags);
        return result.allowed;
    } else {
        Firestore.logInfo(`no tradebook found for ${symbol}`, logTags);
    }
    return true;
}

export const isAllowedToMarketOutSingleOrder = (symbol: string, keyIndex: number, logTags: Models.LogTags) => {
    let { isLong, tradebookID } = getCommonInfo(symbol);
    let tradebook = TradebooksManager.getTradebookByID(symbol, tradebookID);
    if (tradebook) {
        let result = tradebook.getDisallowedReasonToMarketOutSingleOrder(symbol, keyIndex, logTags);
        let text = result.allowed ? `allow` : `cannot`;
        Firestore.logInfo(`${text} market out: ${result.reason}`, logTags);
        return result.allowed;
    } else {
        Firestore.logInfo(`no tradebook found for ${symbol}`, logTags);
    }

    return true;
};
