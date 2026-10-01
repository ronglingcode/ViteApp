import { evaluateEntryPriceAndVolumeRules } from './entryRuleDecision';
import * as Rules from '../algorithms/rules';
import * as RiskManager from '../algorithms/riskManager';
import * as Vwap from '../algorithms/vwap';
import * as Firestore from '../firestore';
import * as Helper from '../utils/helper';
import * as Models from '../models/models';
import * as TradingState from '../models/tradingState';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as VwapPatterns from '../algorithms/vwapPatterns';
import * as Watchlist from '../algorithms/watchlist';
declare let window: Models.MyWindow;

const isBlockedByWatchlistLimitRule = (logTags: Models.LogTags) => {
    let blockReason = Watchlist.getWatchlistLimitBlockReason();
    if (blockReason == "") {
        return false;
    }

    Firestore.logError(`checkRule: ${blockReason}`, logTags);
    return true;
};

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
    if (isBlockedByWatchlistLimitRule(logTags)) {
        return 0;
    }
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


    if (Models.hasEntryOrdersInSameDirection(symbol, isLong)) {
        Firestore.logInfo(`had entries in the same direction, old entries will be cancelled`, logTags);
    }
    let openPrice = Models.getOpenPrice(symbol);
    let isEntryPriceInTradableArea = Models.isPriceInTradableArea(symbol, isLong, entryPrice);
    let isOpenInTradableArea = Models.isPriceInTradableArea(symbol, isLong, openPrice);
    let hasBeenInTradableArea = Models.hasPriceBeenInTradableArea(symbol, isLong);

    let initialSize = liquidityScale * RiskManager.getRiskMultiplerForNextEntry(symbol, isLong, entryPrice, basePlan, logTags);
    let finalSize = initialSize;
    if (shouldCheckEntryDistance) {
        if (isEntryPriceInTradableArea == 0 &&
            isOpenInTradableArea == 0 &&
            !hasBeenInTradableArea) {
            finalSize = initialSize * 0.5;
            Firestore.logError(`checkRule: not in tradable area, using 50% size`, logTags);
        }
    }
    const topPlan = TradingPlans.getTradingPlans(symbol);
    const decision = evaluateEntryPriceAndVolumeRules({
        isLong, entryPrice, initialSize, openPrice, secondsSinceMarketOpen,
        vwap: Models.getCurrentVwap(symbol), atr: topPlan.atr.average,
        watchAreas: topPlan.analysis.watchAreas, noTradeZones: topPlan.analysis.noTradeZones,
        volumes: Models.getVolumesSinceOpen(symbol).map(volume => volume.value),
    });
    // The distance reduction is independent; later volume/VWAP reductions use initialSize.
    if (decision.messages.length > 0) finalSize = decision.multiplier;
    decision.messages.forEach(message => Firestore.logError(message, logTags));
    if (decision.multiplier === 0) return 0;
    Rules.checkPullbackRequirement(symbol, isLong);

    return finalSize;
}

export const checkPartialEntry = (symbol: string, isLong: boolean, quantity: number,
    entryPrice: number, stopLossPrice: number, logTags: Models.LogTags) => {
    if (isBlockedByWatchlistLimitRule(logTags)) {
        return false;
    }
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
        secondsSinceMarketOpen: Helper.getSecondsSinceMarketOpen(Helper.getCurrentMarketTime()),
    }
}
