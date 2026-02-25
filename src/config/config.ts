import * as profileFutures from './profiles/futures'
import * as momentumSimple from './profiles/momentumSimple';
import * as tradeStationEquity from './profiles/tradeStationEquity';
import * as schwab from './profiles/schwab';
import * as TimeHelper from '../utils/timeHelper';
import * as secret from './secret'
import type * as Models from '../models/models';
declare let window: Models.MyWindow;


export const getProfileSettingsForSymbol = (symbol: string) => {
    if (!window.TradingData.StockSelection.StockCandidates) {
        return getProfileSettings();
    }
    let stockInfo = window.TradingData.StockSelection.StockCandidates[symbol];
    if (stockInfo && stockInfo.activeProfileName) {
        return getProfileSettingsForName(stockInfo.activeProfileName);
    }
    return getProfileSettings();
};
const getProfileSettingsForName = (name: string) => {
    let activeProfileName = name;
    if (activeProfileName == "futures") {
        return profileFutures.settings;
    } else if (activeProfileName == tradeStationEquity.settings.name) {
        return tradeStationEquity.settings;
    } else if (activeProfileName == schwab.settings.name) {
        return schwab.settings;
    } else {
        // default
        return momentumSimple.settings;
    }

}
export const getProfileSettings = () => {
    return getProfileSettingsForName(window.HybridApp.TradingData.activeProfileName);
};

export const getAccountID = () => {
    let activeProfileName = window.HybridApp.TradingData.activeProfileName;
    if (activeProfileName == "futures") {
        return secret.tradeStation().AccountIDs.Futures;
    } else {
        return secret.tradeStation().AccountIDs.Equity;
    }
};
export const isEquity = (): boolean => {
    const settings = getProfileSettings();
    return settings.isEquity;
};
let currentDay = new Date();
if (window.TradingData && window.TradingData.Settings.currentDayStr) {
    currentDay = new Date(window.TradingData.Settings.currentDayStr); // '2022-11-04 6:30',
}
let currentDayStr = `${currentDay.getFullYear()}-${currentDay.getMonth() + 1}-${currentDay.getDate()}`;

export const Settings = {
    'currentDay': currentDay,
    'dtStartTime': TimeHelper.getDayTradingStartTimeInlocal(currentDayStr),
    marketOpenTime: TimeHelper.getMarketOpenTimeInLocal(),
    // I can focus on no more than 4 stocks at the same time,
    // see details in https://sunrisetrading.atlassian.net/browse/TPS-161
    'maxStocksCount': 4,
    /** When true, fetch today's orders via time-window pagination (getAllOrdersByTimeWindows). When false, use single-request getAllOrders. */
    fetchOrdersByTimeWindows: true,
};
console.log(Settings)