import { validateTradingPlan } from '../trading/core/configuration/tradingConfig';
import * as Config from '../config/config';
import * as GlobalSettings from '../config/globalSettings';
import * as Firestore from '../firestore';
import * as Models from '../models/models';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Helper from '../utils/helper';

declare let window: Models.MyWindow;

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

    let blockReason = getWatchlistLimitBlockReason(watchlist);
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

const getWatchlistLimitMessage = (watchlist: Models.WatchlistItem[]) => {
    return `more than ${GlobalSettings.maxTradableStocksCount} stocks in watchlist: ${getWatchlistSymbolsText(watchlist)}`;
};

export const getWatchlistLimitBlockReason = (watchlist: Models.WatchlistItem[] = window.HybridApp.Watchlist ?? []) => {
    if (watchlist.length <= GlobalSettings.maxTradableStocksCount) {
        return "";
    }

    return getWatchlistLimitMessage(watchlist);
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
        if (!Helper.isIndex(symbol)) {
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
    const reason = validateTradingPlan({ ...plan, symbol });
    if (reason) Firestore.logError(reason);
    return !reason;
};
