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
import * as TradingPlans from "../models/tradingPlans/tradingPlans";
import * as Patterns from "../algorithms/patterns";
import * as GlobalSettings from '../config/globalSettings';

export const isAllowedForAllOrdersForAllTradebooks = (symbol: string, isLong: boolean, isMarketOrder: boolean, newPrice: number, logTags: Models.LogTags) => {
    let { planConfigs, exitPairsCount } = getCommonInfo(symbol);
    let allowedReason: Models.CheckRulesResult = {
        allowed: false,
        reason: "default disallow",
    };
    let seconds = Helper.getSecondsSinceMarketOpen(new Date());
    if (seconds > 60 * 15) {
        allowedReason.allowed = true;
        allowedReason.reason = "allow after 15 minutes since open";
        return allowedReason;
    }
    if (RiskManager.isOverSized(symbol)) {
        Firestore.logInfo(`allow exit when over sized`, logTags);
        allowedReason.allowed = true;
        allowedReason.reason = "allow when over sized";
        return allowedReason;
    }
    let exitCount = Models.getExitOrdersPairs(symbol).length;
    if (exitCount > TakeProfit.BatchCount) {
        allowedReason.allowed = true;
        allowedReason.reason = `allow when exit count is more than ${TakeProfit.BatchCount}`;
        return allowedReason;
    }
    // allow if break incremental trailing stop
    let second = Helper.getSecondsSinceMarketOpen(new Date());
    if (120 <= second && second < 300) {
        // first 5 minutes, use the high/low of 2nd candle
        let candles = Models.getM1ClosedCandlesSinceOpen(symbol);
        let secondCandle = candles[1];
        if (isLong && newPrice <= secondCandle.low) {
            allowedReason.allowed = true;
            allowedReason.reason = "low of 2nd M1 candle";
            return allowedReason;
        }
        if (!isLong && newPrice >= secondCandle.high) {
            allowedReason.allowed = true;
            allowedReason.reason = "high of 2nd M1 candle";
            return allowedReason;
        }
    } else if (second >= 600) {
        let candles = Models.getCandlesFromM1SinceOpen(symbol);
        let m5Candles = Models.aggregateCandles(candles, 5);
        let secondM5Candle = m5Candles[1];
        if (isLong && newPrice <= secondM5Candle.low) {
            allowedReason.allowed = true;
            allowedReason.reason = "low of 2nd M5 candle";
            return allowedReason;
        }
        if (!isLong && newPrice >= secondM5Candle.high) {
            allowedReason.allowed = true;
            allowedReason.reason = "high of 2nd M5 candle";
            return allowedReason;
        }
    }
    return allowedReason;
}
export const isAllowedForLimitOrderForAllTradebooks = (
    symbol: string, isLong: boolean, isMarketOrder: boolean, newPrice: number, keyIndex: number,
    exitPair: Models.ExitPair, logTags: Models.LogTags) => {
    let allowedByAll = isAllowedForSingleOrderForAllTradebooks(
        symbol, isLong, isMarketOrder, newPrice, keyIndex, logTags);
    if (allowedByAll.allowed) {
        return allowedByAll;
    }
    let allowedReason: Models.CheckRulesResult = {
        allowed: false,
        reason: "default disallow",
    };
    if (Rules.isIncreasingTarget(isLong, newPrice, exitPair)) {
        allowedReason.allowed = true;
        allowedReason.reason = "allow when increasing target";
        return allowedReason;
    }
    return allowedReason;
}
export const getPartialIndex = (symbol: string, keyIndex: number) => {
    let maxPartialsCount = GlobalSettings.batchCount;
    let totalPairsCount = Models.getExitPairs(symbol).length;
    let exitedCount = 0;
    if (totalPairsCount < maxPartialsCount) {
        maxPartialsCount = totalPairsCount;
        exitedCount = maxPartialsCount - totalPairsCount;
    }
    return keyIndex + exitedCount;
}
export const isAllowedForSingleOrderForAllTradebooks = (symbol: string, isLong: boolean, isMarketOrder: boolean, newPrice: number, keyIndex: number, logTags: Models.LogTags) => {
    let partialIndex = getPartialIndex(symbol, keyIndex);
    let allowedForAllOrders = isAllowedForAllOrdersForAllTradebooks(symbol, isLong, isMarketOrder, newPrice, logTags);
    if (allowedForAllOrders.allowed) {
        return allowedForAllOrders;
    }
    let allowedReason: Models.CheckRulesResult = {
        allowed: false,
        reason: "default disallow",
    };
    let { planConfigs, exitPairsCount } = getCommonInfo(symbol);
    if (planConfigs) {
        let allowCount = planConfigs.allowFirstFewExitsCount + 1;
        let extraCount = exitPairsCount - (TakeProfit.BatchCount - allowCount);
        if (extraCount > 0 &&
            (isMarketOrder || keyIndex < extraCount)) {
            allowedReason.allowed = true;
            allowedReason.reason = `allow for the first ${allowCount} exits`;
            return allowedReason;
        }
    }
    if (Rules.isAllowedForAddedPosition(symbol, isLong, isMarketOrder, newPrice, keyIndex, false)) {
        allowedReason.allowed = true;
        allowedReason.reason = "added position";
        return allowedReason;
    }

    let spread = Models.getCurrentSpread(symbol);
    let failedMinimumTarget = ExitRulesCheckerSimple.failedMinimumTargetForSingle(symbol, newPrice, keyIndex, spread, logTags);
    if (!failedMinimumTarget) {
        allowedReason.allowed = true;
        allowedReason.reason = "meet minimum target";
        return allowedReason;
    }
    let threshold = TradingPlans.getMinTarget(symbol, isLong, partialIndex);
    if (threshold == -1) {
        allowedReason.allowed = true;
        allowedReason.reason = `no target (-1) for partial ${partialIndex}`;
        return allowedReason;
    }
    
    // use 0.1 ATR as buffer
    let buffer = Models.getAtr(symbol).average * 0.1;
    let thresholdWithBuffer = isLong ? threshold - buffer : threshold + buffer;
    if ((isLong && newPrice >= thresholdWithBuffer) || (!isLong && newPrice <= thresholdWithBuffer)) {
        allowedReason.allowed = true;
        allowedReason.reason = `meet min target, threshold: ${threshold}, with buffer: ${thresholdWithBuffer}`;
        return allowedReason;
    }
    let symbolData = Models.getSymbolData(symbol);
    if ((isLong &&  symbolData.highOfDay >= threshold) || (!isLong && symbolData.lowOfDay <= threshold)) {
        allowedReason.allowed = true;
        allowedReason.reason =`has reached minimum target: ${threshold}`;
        return allowedReason;
    }
    return allowedReason;
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
