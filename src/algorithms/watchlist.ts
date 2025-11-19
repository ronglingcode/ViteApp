import * as Config from '../config/config';
import * as Firestore from '../firestore';
import type * as Models from '../models/models';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as MarketData from '../api/marketData';
import * as Helper from '../utils/helper';
import * as Rules from './rules';
import { disableNetwork } from 'firebase/firestore';
import * as googleDocsApi from '../api/googleDocs/googleDocsApi';
import { populateBestIdeas } from '../controllers/traderFocus';

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
    let googleDocContent = window.HybridApp.TradingData.googleDocContent;
    let { gradingList, detailedPlans, bestIdeas } = googleDocsApi.parseGoogleDoc(googleDocContent);
    console.log("best ideas");
    console.log(bestIdeas);

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
        if (!verifyGoogleDoc(symbol, gradingList, detailedPlans)) {
            watchlist = [];
            break;
        }
        let momentumStartForLong = TradingPlans.getMomentumStartLevel(symbol, true);
        let momentumStartForShort = TradingPlans.getMomentumStartLevel(symbol, false);
        if (momentumStartForLong == 0 || momentumStartForShort == 0) {
            Firestore.logError(`${symbol} must define momentum start range to avoid trading in a choppy range`);
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

    window.HybridApp.Watchlist = watchlist;
    populateBestIdeas(bestIdeas);
    return watchlist;
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

    if (analysis.dailyChartStory < 0) {
        Firestore.logError(`${errorMsg} dailyChartStory`);
        return false;
    }
    if (analysis.premarketVolumeScore == TradingPlansModels.PremarketVolumeScore.Unknown) {
        Firestore.logError(`${errorMsg} premarketVolumeScore`);
        return false;
    }
    if (analysis.gap.pdc == 0) {
        Firestore.logError(`${errorMsg} gap pdc`);
        return false;
    }

    if (!TradingPlans.hasMomentumLevels(plan)) {
        // TODO check it has reversal plan
        //Firestore.logError(`missing both singleMomentumKeyLevel and dualMomentumKeyLevels`);
        //return false;
    }
    if (analysis.deferTradingInSeconds == -1) {
        Firestore.logError(`${errorMsg} deferTradingInSeconds`);
        return false;
    }
    if (analysis.stopTradingAfterSeconds == -1) {
        Firestore.logError(`${errorMsg} stopTradingAfterSeconds`);
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
    if (!verifyTradingPlansForSingleDirection(symbol, longPlan)) {
        return false;
    }
    if (!verifyTradingPlansForSingleDirection(symbol, shortPlan)) {
        return false;
    }

    return true;
}
/**
 * @returns false if trading plans for a single direction are not valid.
 */
const verifyTradingPlansForSingleDirection = (symbol: string, plan: TradingPlansModels.SingleDirectionPlans) => {
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
    return true;
}

const getIndexFromList = (list: any[], symbol: string) => {
    for (let i = 0; i < list.length; i++) {
        let item = list[i];
        if (item.symbol == symbol) {
            return i;
        }
    }
    return -1;
}
const verifyGoogleDoc = (symbol: string, gradingList: googleDocsApi.StockGrading[], detailedPlans: googleDocsApi.DetailedPlan[]) => {
    let index = getIndexFromList(gradingList, symbol);
    if (index == -1) {
        Firestore.logError(`${symbol} not found in initial grading list`);
        return false;
    }
    let grading = gradingList[index];
    if (grading.selected.toLowerCase() != "yes") {
        Firestore.logError(`${symbol} not selected in initial grading list`);
        return false;
    }
    let planIndex = getIndexFromList(detailedPlans, symbol);
    if (planIndex == -1) {
        Firestore.logError(`${symbol} not found in detailed plans`);
        return false;
    }
    let plan = detailedPlans[planIndex];
    if (plan.notes.length < 300) {
        Firestore.logError(`${symbol} has less than 300 characters in notes + best setups ${plan.notes.length}`);
        return false;
    }
    return true;
}
