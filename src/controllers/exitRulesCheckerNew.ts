import * as Models from "../models/models";
import * as Firestore from "../firestore";
import * as TradingState from "../models/tradingState";
import * as TradebooksManager from "../tradebooks/tradebooksManager";
import * as Helper from "../utils/helper";
import * as CoreTargetExitRules from './coreTargetExitRules';

export const getCommonInfo = (symbol: string) => {
    let isLong = Models.getPositionNetQuantity(symbol) > 0;
    let symbolState = TradingState.getSymbolState(symbol);
    let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
    let planConfigs = symbolState.activeBasePlan?.planConfigs;
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
        atr: atr,
        isHigherTimeFrame: isHigherTimeFrame,
        tradebookID: tradebookID,
    }
}

export const isAllowedToAdjustSingleLimitOrder = (symbol: string, keyIndex: number,
    order: Models.OrderModel, pair: Models.ExitPair,
    newPrice: number, logTags: Models.LogTags) => {
    let { isLong, tradebookID } = getCommonInfo(symbol);
    let coreTargetResult = CoreTargetExitRules.checkPriceAdjustment(symbol, [pair], newPrice, false);
    if (!coreTargetResult.allowed) {
        Firestore.logInfo(`adjust limit order disallowed: ${coreTargetResult.reason}`, logTags);
        Helper.speak(`core target blocked ${symbol} exit`);
        return false;
    }
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
    let { isLong, tradebookID } = getCommonInfo(symbol);
    let coreTargetResult = CoreTargetExitRules.checkPriceAdjustment(symbol, [pair], newPrice, true);
    if (!coreTargetResult.allowed) {
        Firestore.logInfo(`adjust stop order disallowed: ${coreTargetResult.reason}`, logTags);
        Helper.speak(`core target blocked ${symbol} exit`);
        return false;
    }
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
    let pair = Models.getExitPairs(symbol)[keyIndex];
    if (pair) {
        let coreTargetResult = CoreTargetExitRules.checkMarketExit(symbol, [pair]);
        if (!coreTargetResult.allowed) {
            Firestore.logInfo(`market out disallowed: ${coreTargetResult.reason}`, logTags);
            Helper.speak(`core target blocked ${symbol} exit`);
            return false;
        }
    }
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

export const isAllowedToAdjustAllExitPairs = (
    symbol: string, newPrice: number, isStopLeg: boolean, logTags: Models.LogTags) => {
    let { isLong, tradebookID } = getCommonInfo(symbol);
    let coreTargetResult = CoreTargetExitRules.checkPriceAdjustment(
        symbol, Models.getExitPairs(symbol), newPrice, isStopLeg);
    if (!coreTargetResult.allowed) {
        Firestore.logInfo(`adjust all exit pairs disallowed: ${coreTargetResult.reason}`, logTags);
        Helper.speak(`core target blocked ${symbol} exit`);
        return false;
    }
    let tradebook = TradebooksManager.getTradebookByID(symbol, tradebookID);
    if (tradebook) {
        let result = tradebook.getDisallowedReasonToAdjustAllExitPairs(symbol, logTags, newPrice);
        let text = result.allowed ? `allow` : `cannot`;
        Firestore.logInfo(`${text} adjust all exit pairs: ${result.reason}`, logTags);
        return result.allowed;
    } else {
        Firestore.logInfo(`no tradebook found for ${symbol}`, logTags);
    }
    return true;
};

export const isAllowedToAdjustBatchExitPairs = (symbol: string, logTags: Models.LogTags) => {
    return true;
};
