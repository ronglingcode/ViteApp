import * as Models from '../models/models';
import * as Rules from '../algorithms/rules';
import * as RiskManager from '../algorithms/riskManager';
import * as TakeProfit from '../algorithms/takeProfit';
import * as Firestore from '../firestore';
import * as TradingState from '../models/tradingState';
import * as Helper from '../utils/helper';
import * as TraderFocus from './traderFocus';

export const isAllowedForAll = (symbol: string, logTags: Models.LogTags) => {
    let seconds = Helper.getSecondsSinceMarketOpen(Helper.getCurrentMarketTime());

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


// return true if ok to flatten
// see some trade examples in https://sunrisetrading.atlassian.net/browse/TPS-80
export const checkFlattenRules = (symbol: string, logTags: Models.LogTags) => {
    if (isAllowedForAll(symbol, logTags)) {
        return true;
    }

    // Get the tradebook and call its method to check flatten rules
    let tradebook = TraderFocus.getTradebookFromPosition(symbol);
    if (tradebook) {
        let currentPrice = Models.getCurrentPrice(symbol);
        let result = tradebook.getDisallowedReasonToFlatten(symbol, logTags, currentPrice);
        if (!result.allowed) {
            Firestore.logInfo(`flatten disallowed: ${result.reason}`, logTags);
            return false;
        }
        // If tradebook allows it, continue with additional checks below
    }

    let { exitPairsCount, isLong, breakoutTradeState, isHigherTimeFrame } = getCommonInfo(symbol);
    let currentPrice = Models.getCurrentPrice(symbol);

    if (Rules.isAllowedAsPaperCut(symbol, breakoutTradeState.entryPrice, breakoutTradeState.stopLossPrice, currentPrice)) {
        Firestore.logInfo(`allow for paper cut`, logTags);
        return true;
    }

    return true;
};


export const checkTrailStopRules = (symbol: string, timeFrame: number, logTags: Models.LogTags) => {
    return TakeProfit.BatchCount;
}
export const checkTrailStopSingleRules = (symbol: string, batchIndex: number, timeFrame: number, logTags: Models.LogTags) => {
    if (timeFrame == 1) {
        let seconds = Helper.getSecondsSinceMarketOpen(Helper.getCurrentMarketTime());
        if (seconds < 5 * 60) {
            return true;
        } else {
            return false;
        }
    }
    if (timeFrame >= 5) {
        return true;
    }
    Firestore.logError(`unknown time frame ${timeFrame}`, logTags);
    return false;
}
/**
 * if it's not the first 1 minute or the entry candle and it's 
 * within the first 5 minutes, cannot move stop tighter than a previously closed candle * 
 */
export const isLessTightThanClosedCandlesForAdjustStop = (symbol: string, positionIsLong: boolean, newPrice: number) => {
    let now = Helper.getCurrentMarketTime();
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
    if (candles.length === 0) {
        Firestore.logInfo(`allow moving stop because no candles are loaded`);
        return true;
    }
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
    let exitPairs = Models.getExitPairs(symbol);
    let atr = TradingState.getAtrInTrade(symbol);
    let isHigherTimeFrame = breakoutTradeState.plan.timeframe && breakoutTradeState.plan.timeframe > 1;
    return {
        isLong: isLong,
        secondsSinceMarketOpen: Helper.getSecondsSinceMarketOpen(Helper.getCurrentMarketTime()),
        planConfigs: planConfigs,
        symbolState: symbolState,
        breakoutTradeState: breakoutTradeState,
        exitPairsCount: exitPairs.length,
        todayRange: Models.getTodayRange(atr),
        averageRange: atr.average,
        simpleExitRules: true,
        atr: atr,
        isHigherTimeFrame: isHigherTimeFrame,
    }
}
