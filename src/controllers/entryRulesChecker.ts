import * as Config from '../config/config';
import * as Rules from '../algorithms/rules';
import * as RiskManager from '../algorithms/riskManager';
import * as Patterns from '../algorithms/patterns';
import * as AutoLevelMomentum from '../algorithms/autoLevelMomentum';
import * as Vwap from '../algorithms/vwap';
import * as Firestore from '../firestore';
import * as Helper from '../utils/helper';
import * as Models from '../models/models';
import * as TradingState from '../models/tradingState';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as TradingPlans from '../models/tradingPlans/tradingPlans'
declare let window: Models.MyWindow;

/**
 * Return a number between 0 to 1 for share size multiplier. 
 * 0 means cannot make the trade, 1 means trade with full size
 * Used by entries and algo entries.
 * Not used by adding partials/reloads.
 */
export const checkBasicGlobalEntryRules = (symbol: string, isLong: boolean,
    entryPrice: number, stopOutPrice: number, basePlan: TradingPlansModels.BasePlan,
    shouldCheckEntryDistance: boolean,
    logTags: Models.LogTags,) => {
    if (Rules.isOverDailyMaxLoss()) {
        Firestore.logError(`checkRule: Daily max loss exceeded`, logTags);
        return 0;
    }
    let { tradingPlans, atr, secondsSinceMarketOpen, premarketVwapTrend, currentVwap, momentumStartPrice } = getCommonInfo(symbol, isLong);
    if (tradingPlans.analysis.premarketVolumeScore == TradingPlansModels.PremarketVolumeScore.Zero_Low_Or_Normal) {
        if (secondsSinceMarketOpen < 15 * 60) {
            Firestore.logError(`checkRule: premarket volume score is low or normal, wait at least 15 minutes`, logTags);
            return 0;
        }
    }

    let liquidityScale = Models.getLiquidityScale(symbol);

    if (liquidityScale == 0) {
        Firestore.logError(`blocked because less than $20M traded after open, be carefull`, logTags);
        return 0;
    }
    if (Rules.isDailyRangeTooSmall(symbol, atr, true, logTags)) {
        return 0;
    }
    if (liquidityScale < 0.9) {
        Firestore.logInfo(`liquidity scale is ${liquidityScale}`, logTags);
    }

    if (Models.hasEntryOrdersInSameDirection(symbol, isLong)) {
        Firestore.logInfo(`had entries in the same direction, old entries will be cancelled`, logTags);
    }
    let tradingTiming = TradingPlans.getTradingTiming(symbol, basePlan);
    let deferTradingInSeconds = tradingTiming.deferTradingInSeconds;
    let stopTradingAfterSeconds = tradingTiming.stopTradingAfterSeconds;
    if (Rules.isBlockedByTiming(secondsSinceMarketOpen, deferTradingInSeconds, stopTradingAfterSeconds)) {
        Firestore.logError(
            `defer ${deferTradingInSeconds} seconds, stop after ${stopTradingAfterSeconds},  currently ${secondsSinceMarketOpen}`,
            logTags,
        );
        return 0;
    }
    let openPrice = Models.getOpenPrice(symbol);
    let isEntryPriceInTradableArea = Models.isPriceInTradableArea(symbol, isLong, entryPrice);
    let isOpenInTradableArea = openPrice ? Models.isPriceInTradableArea(symbol, isLong, openPrice) : false;
    let hasBeenInTradableArea = Models.hasPriceBeenInTradableArea(symbol, isLong);


    let initialSize = liquidityScale * RiskManager.getRiskMultiplerForNextEntry(symbol, isLong, basePlan, logTags);
    let finalSize = initialSize;
    if (shouldCheckEntryDistance) {
        if (isEntryPriceInTradableArea == 0 &&
            isOpenInTradableArea == 0 &&
            !hasBeenInTradableArea) {
            finalSize = initialSize * 0.5;
            Firestore.logError(`checkRule: not in tradable area, using 50% size`, logTags);
        }
    }
    let volumes = Models.getVolumesSinceOpen(symbol);
    if (volumes.length >= 3) {
        let secondMinuteVolume = volumes[1].value;
        if (secondMinuteVolume < 150*1000){
            finalSize = initialSize * 0.5;
            Firestore.logError(`2nd minute volume ${secondMinuteVolume} is less than 150K, using 50% size`, logTags);
        }
    }
    return finalSize;
}
export const checkGlobalEntryRules = (symbol: string, isLong: boolean,
    basePlan: TradingPlansModels.BasePlan, logTags: Models.LogTags,
    entryPrice: number, stopOutPrice: number) => {
    if (Rules.isOverDailyMaxLoss()) {
        Firestore.logError(`checkRule: Daily max loss exceeded`, logTags);
        return 0;
    }


    let symbolData = Models.getSymbolData(symbol);
    if (symbolData.premarketDollarTraded < symbolData.previousDayPremarketDollarTraded) {
        let today = Helper.roundToMillion(symbolData.premarketDollarTraded);
        let previous = Helper.roundToMillion(symbolData.previousDayPremarketDollarTraded);
        Firestore.logError(`checkRule: premarket volume lower than previous day ${today} vs ${previous}`, logTags);
        //return 0;
    }
    /*
    if (RiskManager.isRealizedProfitLossOverThreshold(symbol)) {
        Firestore.logError(`realized loss exceeded 20%, do not trade this stock any more.`, logTags);
        return 0;
    }*/

    let { tradingPlans, atr, secondsSinceMarketOpen, premarketVwapTrend, currentVwap, momentumStartPrice } = getCommonInfo(symbol, isLong);
    if (tradingPlans.analysis.premarketVolumeScore == TradingPlansModels.PremarketVolumeScore.Zero_Low_Or_Normal) {
        if (secondsSinceMarketOpen < 15 * 60) {
            Firestore.logError(`checkRule: premarket volume score is low or normal, wait at least 15 minutes`, logTags);
            return 0;
        }
    }
    if ((isLong && entryPrice < momentumStartPrice) || (!isLong && entryPrice > momentumStartPrice)) {
        Firestore.logError(`checkRule: entry price ${entryPrice} is against momentum start price ${momentumStartPrice}`, logTags);
        return 0;
    }
    if (Rules.isDailyRangeTooSmall(symbol, atr, true, logTags)) {
        return 0;
    }
    if (Rules.isSpreadTooLarge(symbol)) {
        Firestore.logError(`spread too big, block entry`, logTags);
        return 0;
    }

    let risk = Math.abs(entryPrice - stopOutPrice);
    let maxRisk = atr.maxRisk;
    if (maxRisk && maxRisk > 0 && risk > maxRisk) {
        Firestore.logError(`risk too big, ${risk} > ${maxRisk}, still allow for now`, logTags);
        Helper.speak("risk too big, wait for smaller candle");
    }

    if (Models.hasEntryOrdersInSameDirection(symbol, isLong)) {
        Firestore.logError(`already had entries in the same direction, cannot double down`, logTags);
        return 0;
    }
    let tradingTiming = TradingPlans.getTradingTiming(symbol, basePlan);
    let deferTradingInSeconds = tradingTiming.deferTradingInSeconds;
    let stopTradingAfterSeconds = tradingTiming.stopTradingAfterSeconds;
    if (Rules.isBlockedByTiming(secondsSinceMarketOpen, deferTradingInSeconds, stopTradingAfterSeconds)) {
        Firestore.logError(
            `defer ${deferTradingInSeconds} seconds, stop after ${stopTradingAfterSeconds},  currently ${secondsSinceMarketOpen}`,
            logTags,
        );
        return 0;
    }

    let liquidityScale = Models.getLiquidityScale(symbol);

    if (liquidityScale == 0) {
        Firestore.logError(`blocked because less than $20M traded after open, be carefull`, logTags);
        return 0;
    }
    if (liquidityScale < 0.9) {
        Firestore.logInfo(`liquidity scale is ${liquidityScale}`, logTags);
    }

    if (premarketVwapTrend == 0 && secondsSinceMarketOpen < 115) {
        //Firestore.logError(`must wait 2 minutes when premkt trend is mixed`, logTags);
        //return 0;
    }
    /* TPS-27
    if (Patterns.isConsecutiveBarsSameDirection(symbol, isLong)) {
        Firestore.logError(`consecutive bars, wait for pullback`, logTags);
        return 0;
    }*/

    let openPrice = Models.getOpenPrice(symbol);
    let openPriceIsAboveVwap = Models.openPriceIsAboveVwap(symbol);

    let isEntryPriceInTradableArea = Models.isPriceInTradableArea(symbol, isLong, entryPrice);
    let isOpenInTradableArea = openPrice ? Models.isPriceInTradableArea(symbol, isLong, openPrice) : false;
    let hasBeenInTradableArea = Models.hasPriceBeenInTradableArea(symbol, isLong);
    if (openPrice &&
        (basePlan.planType == 'OpenDriveContinuation60' ||
            basePlan.planType == 'LevelMomentum')) {
        let isTradeDirectionAgainstOpenVwap = (isLong && !openPriceIsAboveVwap) ||
            (!isLong && openPriceIsAboveVwap);
        /*
    if (!hasBeenInTradableArea && isInTradableArea == 0) {
        Firestore.logError(`checkRule: both best price and current price not in tradable area, `, logTags);
        return 0;
    }*/

        if (TradingPlans.hasSingleMomentumLevel(tradingPlans)) {
            let keyLevel = TradingPlans.getSingleMomentumLevel(tradingPlans);
            let disallowReason = AutoLevelMomentum.getDisallowReasonForSingleLevelMomentum(
                symbol, isLong, entryPrice, stopOutPrice, keyLevel, openPrice, openPriceIsAboveVwap,
                tradingPlans, logTags
            );
            if (disallowReason.length > 0) {
                Firestore.logError(disallowReason, logTags);
                return 0;
            }
        } else if (TradingPlans.hasDualMomentumLevels(tradingPlans)) {
            let { levelHigh, levelLow } = TradingPlans.getDualMomentumLevels(tradingPlans);
            let disallowReason = AutoLevelMomentum.getDisallowReasonForDualLevelMomentum(
                symbol, isLong, entryPrice, stopOutPrice, levelHigh, levelLow, openPrice, openPriceIsAboveVwap,
            );
            if (disallowReason.length > 0) {
                Firestore.logError(disallowReason, logTags);
                return 0;
            }
        } else {
            // if no key levels
            if (secondsSinceMarketOpen < 60) {
                Firestore.logError(`no key levels, no entry in the first 60 seconds`, logTags);
                return 0;
            }
        }
    }

    if (isAgainstFirstFiveMinute(symbol, isLong, entryPrice, secondsSinceMarketOpen)) {
        Helper.speak('5 minute not ready, only take vwap bounce fail');
    }


    let initialSize = liquidityScale * RiskManager.getRiskMultiplerForNextEntry(symbol, isLong, basePlan, logTags);
    let finalSize = initialSize;
    if ((isLong && entryPrice < currentVwap) || (!isLong && entryPrice > currentVwap)) {
        finalSize = initialSize * 0.5;
        Firestore.logError(`checkRule: entry price ${entryPrice} is against vwap, reduce to half size`, logTags);
    } if (isEntryPriceInTradableArea == 0 &&
        isOpenInTradableArea == 0 &&
        !hasBeenInTradableArea) {
        finalSize = initialSize * 0.5;
        Firestore.logError(`checkRule: not in tradable area, using 50% size`, logTags);
    }

    return finalSize;
};

export const isAgainstFirstFiveMinute = (symbol: string, isLong: boolean,
    entryPrice: number, secondsSinceMarketOpen: number) => {
    if (300 < secondsSinceMarketOpen && secondsSinceMarketOpen < 600) {
        let candles = Models.getUndefinedCandlesSinceOpen(symbol);
        let isAgainst = false;
        if (isLong) {
            isAgainst = Patterns.isLowerHighs(candles, 5);
            return isAgainst && entryPrice < candles[0].high;
        } else {
            isAgainst = Patterns.isHigherLows(candles, 5);
            return isAgainst && entryPrice > candles[0].low;
        }
    } else {
        return false;
    }
}


export const checkRedToGreenPlanEntryRules = (symbol: string, isLong: boolean, entryPrice: number, stopOutPrice: number,
    plan: TradingPlansModels.RedToGreenPlan, logTags: Models.LogTags) => {
    let allowedSizeMutiplier = checkGlobalEntryRules(symbol, isLong, plan, logTags, entryPrice, stopOutPrice);
    if (allowedSizeMutiplier == 0) {
        return 0;
    }

    let hasReversalBarSinceOpen = Patterns.hasReversalBarSinceOpen(symbol, isLong, plan.strictMode, plan.considerCurrentCandleAfterOneMinute, "checkRedToGreenPlanEntryRules");
    let firstBarIsPinBar = Patterns.firstBarIsPinBar(symbol);
    if (!hasReversalBarSinceOpen && !firstBarIsPinBar) {
        Firestore.logError(`checkRule: no reversal bar yet`, logTags);
        return 0;
    }

    if (Vwap.isAgainstCurrentVwap(symbol, isLong, entryPrice)) {
        Firestore.logError(`against current vwap`, logTags);
        return 0;
    }

    return allowedSizeMutiplier;
};
export const checkFirstNewHighPlanEntryRules = (symbol: string, isLong: boolean, entryPrice: number, stopOutPrice: number,
    plan: TradingPlansModels.FirstNewHighPlan, logTags: Models.LogTags) => {
    let allowedSizeMutiplier = checkGlobalEntryRules(symbol, isLong, plan, logTags, entryPrice, stopOutPrice);
    if (allowedSizeMutiplier == 0) {
        return 0;
    }

    /*
    let candles = Models.getCandlesSinceOpen(symbol);
    if (candles.length <= 1) {
        Firestore.logError(`not enough candles since open`, logTags);
        return 0;
    }
    let openCandle = candles[0];
    if ((isLong && Patterns.isGreenBar(openCandle)) ||
        (!isLong && Patterns.isRedBar(openCandle))) {
        Firestore.logError(`first candle not reverse color, first new high is not the first signal`, logTags);
        return 0;
    }
    */

    return allowedSizeMutiplier;
};

export const checkLevelBreakoutPlanEntryRules = (symbol: string, isLong: boolean, entryPrice: number, stopOutPrice: number,
    plan: TradingPlansModels.LevelBreakoutPlan, logTags: Models.LogTags) => {
    let allowedSizeMutiplier = checkGlobalEntryRules(symbol, isLong, plan, logTags, entryPrice, stopOutPrice);
    if (allowedSizeMutiplier == 0) {
        return 0;
    }

    let { atr, secondsSinceMarketOpen } = getCommonInfo(symbol, isLong);
    if (secondsSinceMarketOpen < 60) {
        Firestore.logError(`must wait for 60 seconds`, logTags);
        return 0;
    }

    return RiskManager.getRiskMultiplerForNextEntry(symbol, isLong, plan, logTags);
}


export const checkPartialEntry = (symbol: string, isLong: boolean, quantity: number,
    entryPrice: number, stopLossPrice: number, logTags: Models.LogTags) => {
    let { todayRange } = getCommonInfo(symbol, isLong);


    if (RiskManager.isOverDailyMaxLossFromRealizedProfitLossAndExistingPosition(symbol, logTags)) {
        return false;
    }

    if (Rules.isOverDailyMaxLoss()) {
        Firestore.logError(`checkRule: Daily max loss exceeded`, logTags);
        return false;
    }

    /*
    if (RiskManager.isRealizedProfitLossOverThreshold(symbol)) {
        Firestore.logError(`realized loss exceeded 20%, do not trade this stock any more.`, logTags);
        return false;
    }*/

    let pnl = Models.getRealizedProfitLoss();
    if (pnl < 0) {
        let loss = pnl * (-1);
        let newRiskInDollar = quantity * RiskManager.getRiskPerShare(symbol, entryPrice, stopLossPrice);
        let existingRiskInDollar = RiskManager.getRiskInDollarFromExistingPositionsAndEntries(symbol, logTags);
        let potentialLoss = loss + newRiskInDollar + existingRiskInDollar;
        if ((potentialLoss) > RiskManager.getMaxDailyLossLimit()) {
            Firestore.logError(`adding will exceed daily max loss limit to ${potentialLoss}`, logTags);
            return false;
        }
    }

    let addCount = TradingState.getAddCount(symbol, isLong);
    if (addCount > 2 && Rules.isEntryMoreThanHalfDailyRange(symbol, isLong, entryPrice, todayRange, logTags)) {
        return false;
    }

    let q = Models.getPositionNetQuantity(symbol);
    if (q == 0) {
        return checkParitalEntryForNewPosition(symbol, isLong, entryPrice, logTags);
    } else {
        return checkParitalEntryForExistingPosition(symbol, isLong, quantity, entryPrice, stopLossPrice, logTags);
    }
};

const checkParitalEntryForNewPosition = (
    symbol: string, isLong: boolean, entryPrice: number,
    logTags: Models.LogTags) => {
    /*
    if (Models.getRealizedProfitLossPerDirection(symbol, isLong) < 0) {
        Firestore.logError(`cannot add partials on a new position if not profitable before`, logTags);
        return false;
    }*/
    return true;
}
const checkParitalEntryForExistingPosition = (symbol: string, isLong: boolean,
    quantity: number, entryPrice: number, stopLossPrice: number,
    logTags: Models.LogTags) => {
    let existingRiskInDollar = RiskManager.getRiskInDollarFromExistingPositionsAndEntries(symbol, logTags);
    let newRiskInDollar = quantity * RiskManager.getRiskPerShare(symbol, entryPrice, stopLossPrice);
    let maxRisk = RiskManager.getMaxDailyLossLimit();
    let ratio = (existingRiskInDollar + newRiskInDollar) / maxRisk;
    if (ratio > 0.52) {
        Firestore.logError(`already full position, new ratio will be ${ratio}`, logTags);
        return false;
    }

    return true;
}


const getCommonInfo = (symbol: string, isLong: boolean) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    let momentumStartPrice = TradingPlans.getMomentumStartLevel(symbol, isLong);
    return {
        tradingPlans: plan,
        momentumStartPrice: momentumStartPrice,
        atr: plan.atr,
        todayRange: Models.getTodayRange(plan.atr),
        averageRange: plan.atr.average,
        currentVwap: Models.getCurrentVwap(symbol),
        premarketVwapTrend: Vwap.getStrongPremarketVwapTrend(symbol),
        secondsSinceMarketOpen: Helper.getSecondsSinceMarketOpen(new Date()),
    }
}

/**
 * Returns true if either has reversal bar since open
 * or no need for this requirement
 */
export const conditionallyHasReversalBarSinceOpen = (symbol: string,
    isLong: boolean,
    strictMode: boolean, considerCurrentCandleAfterOneMinute: boolean) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    let openPrice = Models.getOpenPrice(symbol);
    let hasReversal = Patterns.hasReversalBarSinceOpen(symbol, isLong, strictMode, considerCurrentCandleAfterOneMinute, "conditional");
    if (!openPrice) {
        return hasReversal;
    }
    let gap = openPrice - plan.analysis.gap.pdc;
    let atr = plan.atr.average;
    let threashold = atr * 0.8;
    // if gap up more than 80% ATR, the reversal trade doesn't need to wait for reversal
    if ((isLong && gap < 0 && Math.abs(gap) > threashold) ||
        (!isLong && gap > 0 && gap > threashold)) {
        return true;
    }
    return hasReversal;
}