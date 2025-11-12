import * as Models from '../models/models';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Rules from '../algorithms/rules';
import * as Patterns from '../algorithms/patterns';
import * as RiskManager from '../algorithms/riskManager';
import * as TakeProfit from '../algorithms/takeProfit';
import * as MinimumTarget from '../algorithms/minimumTarget';
import * as Firestore from '../firestore';
import * as TradingState from '../models/tradingState';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as Helper from '../utils/helper';
import { checkCommonAdjustStops } from './exitRulesChecker';
import * as VolumeMonitor from './volumeMonitor';

export const isAllowedForAll = (symbol: string, logTags: Models.LogTags) => {
    let seconds = Helper.getSecondsSinceMarketOpen(new Date());

    let minutes = seconds / 60;
    let hours = minutes / 60;

    if (seconds > 60 * 30) {
        Firestore.logInfo(`allow after 30 minutes since open`, logTags);
        return true;
    }
    if (hours >= 6) {
        Firestore.logInfo(`allow in the last 30 minutes before market close (12:30 PM)`, logTags);
        return true;
    }

    let { planConfigs, breakoutTradeState, isHigherTimeFrame } = getCommonInfo(symbol);
    if (breakoutTradeState.plan.planConfigs.setupQuality == TradingPlansModels.SetupQuality.Scalp) {
        return true;
    }
    if (breakoutTradeState.hasValue) {
        if (breakoutTradeState.maxPullbackReached > 0.75) {
            Firestore.logInfo(`allow early exits due to pullback ${breakoutTradeState.maxPullbackReached} > 0.75`, logTags);
            return true;
        }
    }

    return false;
}
export const isAllowedForSingle = (symbol: string, isLong: boolean, isMarketOrder: boolean, newPrice: number, keyIndex: number, logTags: Models.LogTags) => {
    if (isAllowedForAll(symbol, logTags)) {
        return true;
    }

    if (Rules.isAllowedForAddedPosition(symbol, isLong, isMarketOrder, newPrice, keyIndex, true)) {
        return true;
    }

    if (RiskManager.isOverSized(symbol)) {
        Firestore.logInfo(`allow single exit when over sized`, logTags);
        return true;
    }

    let { exitPairsCount, planConfigs } = getCommonInfo(symbol);

    let entryInSeconds = Models.getLastEntryTimeFromNowInSeconds(symbol);
    let allowedFirstFewCount = Math.floor(entryInSeconds / 300) * 2;
    let extraCount = exitPairsCount - (TakeProfit.BatchCount - allowedFirstFewCount);
    if (extraCount > 0 &&
        (isMarketOrder || keyIndex < extraCount)) {
        Firestore.logInfo(`allow exit for the first ${allowedFirstFewCount} exits`, logTags);
        return true;
    }
    return false;
}

export const failedMinimumTargetForBatch = (symbol: string, newPrice: number, isHalf: boolean, logTags: Models.LogTags) => {
    let { isLong, exitPairsCount, breakoutTradeState, todayRange, minimumExitTargets } = getCommonInfo(symbol);
    let minimumProfitTarget = TakeProfit.getMinimumProfitTargetForBatch(symbol,
        isLong, isHalf, breakoutTradeState.entryPrice, breakoutTradeState.stopLossPrice, exitPairsCount,
        todayRange, minimumExitTargets, logTags,
    );

    if ((isLong && newPrice < minimumProfitTarget) || (!isLong && newPrice > minimumProfitTarget)) {
        Firestore.logError(`new target ${newPrice} is closer than minimum target ${minimumProfitTarget}`, logTags)
        return true;
    } else {
        Firestore.logInfo(`hard rules passed, new price: ${newPrice}, min target: $${minimumProfitTarget}`, logTags);
    }
    return false;
}
export const failedMinimumTargetForSingle = (symbol: string, newPrice: number, keyIndex: number,
    allowedSpread: number, logTags: Models.LogTags) => {
    let { isLong, exitPairsCount, breakoutTradeState, minimumExitTargets, atr } = getCommonInfo(symbol);
    let minimumProfitTarget = TakeProfit.getMinimumProfitTargetForSingle(symbol,
        isLong, breakoutTradeState.entryPrice, breakoutTradeState.stopLossPrice, keyIndex, exitPairsCount,
        atr, minimumExitTargets, logTags,
    );

    if (allowedSpread! = 0) {
        if (isLong) {
            minimumProfitTarget = minimumProfitTarget - allowedSpread;
        } else {
            minimumProfitTarget = minimumProfitTarget + allowedSpread;
        }
    }
    if ((isLong && newPrice < minimumProfitTarget) || (!isLong && newPrice > minimumProfitTarget)) {
        Firestore.logError(`new target ${newPrice} is closer than minimum target ${minimumProfitTarget}`, logTags)
        return true;
    } else {
        Firestore.logInfo(`hard rules passed, new price: ${newPrice}, min target: $${minimumProfitTarget}`, logTags);
    }

    return false;
}

// return true if ok to flatten
// see some trade examples in https://sunrisetrading.atlassian.net/browse/TPS-80
export const checkFlattenRules = (symbol: string, logTags: Models.LogTags) => {
    if (isAllowedForAll(symbol, logTags)) {
        return true;
    }
    let { exitPairsCount, isLong, breakoutTradeState, planConfigs, isHigherTimeFrame } = getCommonInfo(symbol);
    if (planConfigs?.alwaysAllowFlatten) {
        if (isHigherTimeFrame) {
            let secondsSinceEntry = Models.getFirstEntryTimeFromNowInSeconds(symbol);
            if (secondsSinceEntry > 8 * 60) {
                Firestore.logInfo(`allow after 8 minutes`, logTags);
                return true;
            } else {
                return false;
            }
        }
        else {
            return true;
        }
    }
    let currentPrice = Models.getCurrentPrice(symbol);

    if (Rules.isAllowedAsPaperCut(symbol, breakoutTradeState.entryPrice, breakoutTradeState.stopLossPrice, currentPrice)) {
        Firestore.logInfo(`allow for paper cut`, logTags);
        return true;
    }
    if (exitPairsCount == 1) {
        if (failedMinimumTargetForSingle(symbol, currentPrice, TakeProfit.BatchCount - 1, 0, logTags)) {
            return false;
        }
    } else {
        if (failedMinimumTargetForBatch(symbol, currentPrice, false, logTags)) {
            return false;
        }
    }

    return true;
};


export const checkTrailStopRules = (symbol: string, timeFrame: number, logTags: Models.LogTags) => {
    let { trail5Count, trail15Count } = getCommonInfo(symbol);
    if (timeFrame == 15) {
        return trail15Count;
    } else if (timeFrame == 5) {
        return trail5Count;
    } else {
        return 4;
    }
}
export const checkTrailStopSingleRules = (symbol: string, batchIndex: number, timeFrame: number, logTags: Models.LogTags) => {
    if (timeFrame == 1) {
        let seconds = Helper.getSecondsSinceMarketOpen(new Date());
        if (seconds < 5 * 60) {
            return true;
        } else {
            return false;
        }
    }
    if (timeFrame > 15) {
        return true;
    }
    let { trail5Count, trail15Count } = getCommonInfo(symbol);
    if (timeFrame == 5) {
        if (batchIndex >= trail5Count) {
            Firestore.logError(`only allow first ${trail5Count}, this is ${batchIndex} + 1`, logTags);
            return false;
        } else {
            return true;
        }
    } else if (timeFrame == 15) {
        if (batchIndex > trail15Count) {
            Firestore.logError(`only allow first ${trail15Count}, this is ${batchIndex} + 1`, logTags);
            return false;
        } else {
            return true;
        }
    } else {
        Firestore.logError(`unknown time frame ${timeFrame}`, logTags);
        return false;
    }
}
/**
 * if it's not the first 1 minute or the entry candle and it's 
 * within the first 5 minutes, cannot move stop tighter than a previously closed candle * 
 */
export const isLessTightThanClosedCandlesForAdjustStop = (symbol: string, positionIsLong: boolean, newPrice: number) => {
    let now = new Date();
    let seconds = Helper.getSecondsSinceMarketOpen(now);
    if (seconds < 120 || seconds > 300) {
        Firestore.logInfo(`allow moving stop for seconds ${seconds}`);
        return true;
    }
    let firstEntryTime = Models.getFirstEntryTime(symbol);
    if (firstEntryTime) {
        if (Helper.jsDateToTradingViewUTC(firstEntryTime) == Helper.jsDateToTradingViewUTC(now)) {
            Firestore.logInfo(`allow moving stop for  entry candle`)
            return true;
        }
    }
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    let mostTightCandlePrice = positionIsLong ? candles[0].low : candles[0].high;
    for (let i = 1; i < candles.length && i < 5; i++) {
        if (positionIsLong) {
            mostTightCandlePrice = Math.max(mostTightCandlePrice, candles[i].low);
        } else {
            mostTightCandlePrice = Math.min(mostTightCandlePrice, candles[i].high);
        }
    }
    if ((positionIsLong && newPrice > mostTightCandlePrice) ||
        (!positionIsLong && newPrice < mostTightCandlePrice)) {
        Firestore.logError(`cannot move stop tighter than ${mostTightCandlePrice}`);
        return false;
    }
    Firestore.logInfo(`allow move stop no tighter than ${mostTightCandlePrice}`);
    return true;
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
    return {
        isLong: isLong,
        secondsSinceMarketOpen: Helper.getSecondsSinceMarketOpen(new Date()),
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
    }
}