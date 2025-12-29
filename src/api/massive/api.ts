import * as Firestore from '../../firestore';
import * as Secret from '../../config/secret';
import * as Models from '../../models/models';
import * as TimeHelper from '../../utils/timeHelper';
import * as Helper from '../../utils/helper';

export const getPriceHistory = async (symbol: string, timeframe: number) => {
    let apiKey = Secret.massive().apiKey;
    let host = 'https://api.massive.com';
    let today = new Date();
    let todayString = TimeHelper.formatDateToYYYYMMDD(today);

    let tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    let tomorrowString = TimeHelper.formatDateToYYYYMMDD(tomorrow);

    let url = `${host}/v2/aggs/ticker/${symbol}/range/${timeframe}/minute/${todayString}/${tomorrowString}?adjusted=true&sort=asc&limit=1000&apiKey=${apiKey}`;

    return getBars(symbol, url);
};

export const getPriceHistoryFromOldDateForHigherTimeframe = async (symbol: string, timeframe: number, 
    startDate: string, endDate: string) => {
    let apiKey = Secret.massive().apiKey;
    let host = 'https://api.massive.com';
    
    let url = `${host}/v2/aggs/ticker/${symbol}/range/${timeframe}/minute/${startDate}/${endDate}?adjusted=true&extendedHours=true&sort=asc&limit=50000&apiKey=${apiKey}`;
  
    return getBars(symbol, url);
  };

export const getBars = async (symbol: string, url: string) => {
    const config = {
        method: 'GET',
    };
    let response = await fetch(url, config);
    let responseJson = await response.json();
    let results = responseJson.results;
    let candles: Models.CandlePlus[] = [];
    results.forEach((result: any) => {
        let startTime = result.t;
        let startDate = new Date(startTime);
        let candle: Models.CandlePlus = {
            time: Helper.jsDateToTradingViewUTC(startDate),
            open: result.o,
            close: result.c,
            high: result.h,
            low: result.l,
            symbol: symbol,
            volume: result.v,
            datetime: startTime,
            vwap: result.vw,
            minutesSinceMarketOpen: Helper.getMinutesSinceMarketOpen(startDate),
            firstTradeTime: startTime,
        };
        candles.push(candle);
    });
    return candles;
};