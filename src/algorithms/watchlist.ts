import * as Config from '../config/config';
import * as Firestore from '../firestore';
import type * as Models from '../models/models';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Helper from '../utils/helper';
import * as GapAndGoAlgo from './gapAndGoAlgo';
import * as GapAndCrapAlgo from './gapAndCrapAlgo';
import * as GapGiveAndGoAlgo from './gapGiveAndGoAlgo';
import * as GapDownAndGoDownAlgo from './gapDownAndGoDownAlgo';
import * as GapDownAndGoUpAlgo from './gapDownAndGoUpAlgo';

declare let window: Models.MyWindow;

export const getFutures = () => {
    let futures = window.TradingData.StockSelection.futures as string[];
    // override to just one futures
    //futures = ['MNQ'];
    let results: string[] = [];
    futures.forEach(f => {
        let quarter = Helper.getFuturesQuarter(f);
        results.push(`${f}${quarter}`);
    });
    return results;
};

export const getWatchlistItem = (symbol: string) => {
    if (!window.HybridApp.Watchlist)
        return buildDefaultWatchlistItem(symbol);
    for (let i = 0; i < window.HybridApp.Watchlist.length; i++) {
        let item = window.HybridApp.Watchlist[i];
        if (item && item.symbol == symbol) {
            return item;
        }
    }
    return buildDefaultWatchlistItem(symbol);
};

export const createWatchlist = async () => {
    let bestStocksToTradeToday = window.HybridApp.StockSelections;
    if (Config.getProfileSettings().indexOnly) {
        bestStocksToTradeToday = window.TradingData.StockSelection['index'];
    } else if (Config.getProfileSettings().isFutures) {
        bestStocksToTradeToday = getFutures();
    }

    let watchlist: Models.WatchlistItem[] = [];
    for (let i = 0; i < bestStocksToTradeToday.length; i++) {
        let symbol = bestStocksToTradeToday[i];
        let watchlistItem = buildDefaultWatchlistItem(symbol);

        let skipMessage = `skip ${symbol} because `;

        let tradingPlans = TradingPlans.getTradingPlansWithoutDefault(symbol);
        if (!tradingPlans) {
            Firestore.logError(`${skipMessage}missing trading plans`);
            watchlist = [];
            break;
        }
        watchlistItem.marketCapInMillions = tradingPlans.marketCapInMillions;

        if (!verifyTradingPlans(symbol, tradingPlans)) {
            Firestore.logError(`invalid trading plans`);
            watchlist = [];
            break;
        }
        if (!finishedStockAnalysis(symbol, tradingPlans)) {
            Firestore.logError(`must finish all analysis for ${symbol}`);
            watchlist = [];
            break;
        }

        // used to check market cap here

        let invalidReason = TradingPlans.validateTradingPlans(symbol, tradingPlans);
        if (invalidReason != "") {
            Firestore.logError(`${skipMessage}${invalidReason}`);
            continue;
        }

        // only pick the best stocks, stocks with biggest news to trade
        // be selective
        if (Config.getProfileSettings().isEquity) {
            let vwapCorrection = TradingPlans.getVwapCorrection(symbol);
            if (vwapCorrection.volumeSum == 0 || vwapCorrection.tradingSum == 0) {
                //Firestore.logError(`${skipMessage}missing vwap correction.`);
                //continue;
            }

        }

        watchlist.push(watchlistItem);
    }
    if (Config.getProfileSettings().isEquity && watchlist.length > Config.Settings.maxStocksCount) {
        alert("Too many stocks to trade, see reasoning in https://sunrisetrading.atlassian.net/browse/TPS-161");
        watchlist = watchlist.slice(0, Config.Settings.maxStocksCount);
    }

    let errorMessage = checkStockSelection(watchlist);
    if (errorMessage != "OK") {
        alert("failed stock selection check, defaulting to first stock");
        watchlist = watchlist.slice(0, 1);
    }

    let blockReason = getSingleStockWatchlistBlockReason(watchlist);
    if (blockReason != "") {
        Firestore.logError(blockReason);
        throw new Error(blockReason);
    }

    window.HybridApp.Watchlist = watchlist;
    return watchlist;
};

const getWatchlistSymbolsText = (watchlist: Models.WatchlistItem[]) => {
    return watchlist.map(item => item.symbol).join(', ');
};

const getSingleStockWatchlistMessage = (watchlist: Models.WatchlistItem[]) => {
    return `more than 1 stock in watchlist: ${getWatchlistSymbolsText(watchlist)}`;
};

export const getSingleStockWatchlistBlockReason = (watchlist: Models.WatchlistItem[] = window.HybridApp.Watchlist ?? []) => {
    if (watchlist.length <= 1) {
        return "";
    }

    return getSingleStockWatchlistMessage(watchlist);
};


const buildDefaultWatchlistItem = (symbol: string) => {
    let item: Models.WatchlistItem = {
        symbol: symbol,
        marketCapInMillions: 0,
    }
    return item;
};

export const finishedStockAnalysis = (symbol: string, plan: TradingPlansModels.TradingPlans) => {
    let analysis = plan.analysis;
    let errorMsg = `${symbol} missing `;

    if (analysis.gap.pdc == 0) {
        Firestore.logError(`${errorMsg} gap pdc`);
        return false;
    }

    return true;
}


export const isTopPick = (symbol: string) => {
    if (Helper.isFutures(symbol))
        return true;

    let wl = window.HybridApp.Watchlist;
    if (!wl || wl.length < 1) {
        return false;
    }
    if (wl.length == 1)
        return true;
    if (symbol == wl[0].symbol)
        return true;

    let index = ['SPY', 'QQQ'];
    if (index.includes(symbol) &&
        index.includes(wl[0].symbol) &&
        index.includes(wl[1].symbol)) {
        return true;
    }
    return false;
}

export const isFocusedOnBestStock = (watchlist: Models.WatchlistItem[]) => {
    if (watchlist.length == 1) {
        return true;
    }
    for (let i = 0; i < watchlist.length; i++) {
        let symbol = watchlist[i].symbol;
        if (!Helper.isFutures(symbol) && !Helper.isIndex(symbol)) {
            return false;
        }
    }
    return true;
}

// TPS-336 https://sunrisetrading.atlassian.net/browse/TPS-336
const checkStockSelection = (watchlist: Models.WatchlistItem[]) => {
    return "OK";
}

const verifyTradingPlans = (symbol: string, plan: TradingPlansModels.TradingPlans) => {
    let longPlan = plan.long;
    let shortPlan = plan.short;
    let hasRangeBoundReversalPlan = !!plan.rangeBoundReversalPlan;
    if (plan.rangeBoundReversalPlan) {
        let rawSupport = plan.rangeBoundReversalPlan.support;
        let rawResistance = plan.rangeBoundReversalPlan.resistance;
        if (!rawSupport || !Number.isFinite(rawSupport.low) || !Number.isFinite(rawSupport.high) ||
            Math.min(rawSupport.low, rawSupport.high) <= 0 ||
            rawSupport.low === rawSupport.high) {
            Firestore.logError(`${symbol} missing support zone for range bound reversal`);
            return false;
        }
        if (!rawResistance || !Number.isFinite(rawResistance.low) || !Number.isFinite(rawResistance.high) ||
            Math.min(rawResistance.low, rawResistance.high) <= 0 ||
            rawResistance.low === rawResistance.high) {
            Firestore.logError(`${symbol} missing resistance zone for range bound reversal`);
            return false;
        }
        let support = {
            low: Math.min(rawSupport.low, rawSupport.high),
            high: Math.max(rawSupport.low, rawSupport.high),
        };
        let resistance = {
            low: Math.min(rawResistance.low, rawResistance.high),
            high: Math.max(rawResistance.low, rawResistance.high),
        };
        if (support.high >= resistance.low) {
            Firestore.logError(`${symbol} range bound reversal support zone must be below resistance zone`);
            return false;
        }
    }
    if (!verifyTradingPlansForSingleDirection(symbol, longPlan, hasRangeBoundReversalPlan)) {
        return false;
    }
    if (!verifyTradingPlansForSingleDirection(symbol, shortPlan, hasRangeBoundReversalPlan)) {
        return false;
    }

    return true;
}
/**
 * @returns false if trading plans for a single direction are not valid.
 */
const verifyTradingPlansForSingleDirection = (
    symbol: string,
    plan: TradingPlansModels.SingleDirectionPlans,
    hasTopLevelTradebook = false) => {
    if (!plan.enabled) {
        return true;
    }
    if (plan.firstTargetToAdd == 0) {
        Firestore.logError(`${symbol} missing first target to add`);
        return false;
    }
    if (plan.finalTargets.length < 2) {
        Firestore.logError(`${symbol} need at least 2 final targets, length is ${plan.finalTargets.length}`);
        return false;
    }
    for (let i = 0; i < plan.finalTargets.length; i++) {
        let target = plan.finalTargets[i];
        if (target.partialCount == 0) {
            Firestore.logError(`${symbol} missing partial count for final target[${i}]`);
            return false;
        }
        if (target.text == "") {
            Firestore.logError(`${symbol} missing text for final target[${i}]`);
            return false;
        }
        if (target.rrr == 0 && target.level == 0 && target.atr == 0) {
            Firestore.logError(`${symbol} missing atr,rrr,level for final target[${i}]`);
            return false;
        }
    }
    let hasBestTradebook = false;
    if (plan.gapAndCrapPlan) {
        if (!GapAndCrapAlgo.hasAtLeastOneReasonSet(plan.gapAndCrapPlan, symbol)) {
            return false;
        }
        hasBestTradebook = true;
    }
    if (plan.gapAndGoPlan) {
        if (!GapAndGoAlgo.hasAtLeastOneReasonSet(plan.gapAndGoPlan, symbol)) {
            return false;
        }
        hasBestTradebook = true;
    }
    if (plan.gapGiveAndGoPlan) {
        if (!GapGiveAndGoAlgo.hasAtLeastOneReasonSet(plan.gapGiveAndGoPlan, symbol)) {
            return false;
        }
        hasBestTradebook = true;
    }

    if (plan.gapDownAndGoDownPlan) {
        if (!GapDownAndGoDownAlgo.hasAtLeastOneReasonSet(plan.gapDownAndGoDownPlan, symbol)) {
            return false;
        }
        hasBestTradebook = true;
    }
    if (plan.gapDownAndGoUpPlan) {
        if (!GapDownAndGoUpAlgo.hasAtLeastOneReasonSet(plan.gapDownAndGoUpPlan, symbol)) {
            return false;
        }
        hasBestTradebook = true;
    }
    if (!hasBestTradebook && !hasTopLevelTradebook) {
        Firestore.logError(`${symbol} missing best tradebook`);
        return false;
    }
    return true;
}
