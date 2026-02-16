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
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as SetupQuality from '../algorithms/setupQuality';
import * as VwapPatterns from '../algorithms/vwapPatterns';
declare let window: Models.MyWindow;

/**
 * Return a number between 0 to 1 for share size multiplier. 
 * 0 means cannot make the trade, 1 means trade with full size
 * Used by entries and algo entries.
 * Not used by adding partials/reloads.
 */
export const checkBasicGlobalEntryRules = (symbol: string, isLong: boolean,
    entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, basePlan: TradingPlansModels.BasePlan,
    shouldCheckEntryDistance: boolean,
    logTags: Models.LogTags,) => {
    if (Rules.isOverDailyMaxLoss()) {
        Firestore.logError(`checkRule: Daily max loss exceeded`, logTags);
        return 0;
    }
    let { secondsSinceMarketOpen } = getCommonInfo(symbol, isLong);
    let liquidityScale = Models.getLiquidityScale(symbol);
    if (liquidityScale == 0) {
        Firestore.logError(`blocked because less than $20M traded after open, be carefull`, logTags);
        return 0;
    }
    let allowEarlyEntry = Rules.shouldAllowEarlyEntry(symbol, secondsSinceMarketOpen);
    if (!allowEarlyEntry.allowed) {
        Firestore.logError(`${symbol} ${allowEarlyEntry.reason}`, logTags);
        return 0;
    }
    if (liquidityScale < 0.9) {
        Firestore.logInfo(`liquidity scale is ${liquidityScale}`, logTags);
    }
    /*
    if (!Rules.isAllowedByMovingAverage(symbol, isLong, useMarketOrder)) {
        Firestore.logError(`not allowed by moving average`, logTags);
        return 0;
    }*/

    if (Models.hasEntryOrdersInSameDirection(symbol, isLong)) {
        Firestore.logInfo(`had entries in the same direction, old entries will be cancelled`, logTags);
    }
    let tradingTiming = TradingPlans.getTradingTiming(symbol, basePlan);
    let stopTradingAfterSeconds = tradingTiming.stopTradingAfterSeconds;
    if (Rules.isBlockedByAfterTrading(stopTradingAfterSeconds, secondsSinceMarketOpen)) {
        Firestore.logError(
            `stop after ${stopTradingAfterSeconds},  currently ${secondsSinceMarketOpen}`,
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
    let topPlan = TradingPlans.getTradingPlans(symbol);
    let watchAreas = topPlan.analysis.watchAreas;
    if (watchAreas.length > 0) {
        let watchLevel = watchAreas[0];
        if (VwapPatterns.isNearAgainstLevel(symbol, isLong, entryPrice, watchLevel)) {
            Firestore.logError(`entry price ${entryPrice} is near against watch level ${watchLevel}, block entry`, logTags);
            return 0;
        }
        if (secondsSinceMarketOpen < 60 && openPrice &&
            VwapPatterns.isNearAgainstLevel(symbol, isLong, openPrice, watchLevel)) {
            Firestore.logError(`open price ${openPrice} is near against watch level ${watchLevel}, block entry`, logTags);
            return 0;
        }
        if (VwapPatterns.isNearAgainstVwap(symbol, isLong, entryPrice)) {
            Firestore.logError(`entry price ${entryPrice} is near against vwap, reduce to half size`, logTags);
            finalSize = initialSize * 0.5;
        }
        if (secondsSinceMarketOpen < 60 && openPrice &&
            VwapPatterns.isNearAgainstVwap(symbol, isLong, openPrice)) {
            Firestore.logError(`open price ${openPrice} is near against vwap, reduce to half size`, logTags);
            finalSize = initialSize * 0.5;
        }
    }
    if (topPlan.analysis.noTradeZones.length > 0) {
        for (let i = 0; i < topPlan.analysis.noTradeZones.length; i++) {
            let noTradeZone = topPlan.analysis.noTradeZones[i];
            if (noTradeZone.low < entryPrice && noTradeZone.high > entryPrice) {
                Firestore.logError(`entry price ${entryPrice} is inside no trade zone ${noTradeZone.low} - ${noTradeZone.high}, block entry`, logTags);
                return 0;
            }
        }
    }
    let volumes = Models.getVolumesSinceOpen(symbol);
    if (volumes.length >= 3) {
        let maxVolumeIndex = 0;
        let maxVolume = volumes[0].value;
        let lastClosedIndex = volumes.length - 2;
        for (let i = 1; i <= lastClosedIndex; i++) {
            if (volumes[i].value > maxVolume) {
                maxVolume = volumes[i].value;
                maxVolumeIndex = i;
            }
        }
        let volumeToCheckStartIndex = maxVolumeIndex;
        if ((maxVolumeIndex + 1) <= lastClosedIndex) {
            volumeToCheckStartIndex = maxVolumeIndex + 1;
        }

        let metMinimumVolume = false;
        maxVolume = volumes[volumeToCheckStartIndex].value;
        for (let i = volumeToCheckStartIndex; i < volumes.length; i++) {
            if (volumes[i].value > maxVolume) {
                maxVolume = volumes[i].value;
            }
            if (maxVolume >= 150 * 1000) {
                metMinimumVolume = true;
                break;
            }
        }
        if (!metMinimumVolume) {
            finalSize = initialSize * 0.5;
            Firestore.logError(`did not meet minimum volume ${maxVolume} < 150K, using 50% size`, logTags);
        }
    }
    return finalSize;
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
    return {
        tradingPlans: plan,
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