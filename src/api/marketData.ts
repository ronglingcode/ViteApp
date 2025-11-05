import * as tradeStationApi from "./tradeStation/api";
import * as tdAmeritradeApi from "./tdAmeritrade/api";
import * as schwabApi from "./schwab/api";
import * as alpacaApi from "./alpaca/api";
import * as Helper from '../utils/helper';
import * as TimeHelper from '../utils/timeHelper';
import type { Quote, Candle } from '../models/models';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
declare let window: Models.MyWindow;

export const getQuote = async (symbol: string) => {
    if (Helper.isFutures(symbol)) {
        return tradeStationApi.getQuote(symbol);
    } else {
        let quote = await tdAmeritradeApi.getQuote(symbol);
        console.log(quote);
        let q: Quote = {
            symbol: quote.symbol,
            bidPrice: quote.bidPrice,
            askPrice: quote.askPrice,
        };
        return q;
    }
};
export const getFundamentals = async (symbol: string) => {
    return schwabApi.getFundamentals(symbol);
}
export const testGetQuote = async (symbol: string) => {
    return tradeStationApi.getQuote(symbol);
};

export const testTradeStationStreamBar = async () => {
    let url = 'https://api.tradestation.com/v3/marketdata/stream/barcharts/MESM23?unit=Minute';
    const options = {
        method: 'GET',
        url: url,
        headers: { Authorization: 'Bearer ' + window.HybridApp.Secrets.tradeStation.accessToken }
    };

    const response = await fetch(url, options);
    if (response.body) {
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            console.log(value);
            let j = JSON.parse(value);
            //console.log(j);
        }

        console.log('Response fully received');
    }
}
export const setPreviousDayPremarketVolume = async (symbol: string, startDate: string) => {
    let previousDay = await getPremarketDollarFromDate(symbol, startDate);
    let symbolData = Models.getSymbolData(symbol);
    symbolData.previousDayPremarketDollarTraded = previousDay;
    if (symbolData.premarketDollarTraded < symbolData.previousDayPremarketDollarTraded) {
        let todayVolume = Helper.roundToMillion(symbolData.premarketDollarTraded);
        let yesterday = Helper.roundToMillion(symbolData.previousDayPremarketDollarTraded);
        let msg = `${symbol}: dollar traded in premarket is less than previous day: ${todayVolume} vs ${yesterday}`;
        let seconds = Helper.getSecondsSinceMarketOpen(new Date());
        /*if (seconds < 60 * 60) {
            alert(msg);
        }*/
        Firestore.logError(msg);
    }
}
export const getPriceHistory = async (symbol: string, isFutures: boolean, timeframe: number) => {
    let candles: Candle[] = [];
    if (isFutures) {
        let response = await tradeStationApi.getPriceHistory(symbol);
        // for tradestation 1 minute bar, they use end time instead of begin time for a candle bar, 
        // so I need to decrease the time by one minute
        response.Bars.forEach((bar: any) => {
            let candleEnd = bar.Epoch;
            let candleBegin = candleEnd - 60 * 1000;
            let newD = new Date(candleBegin);
            //console.log(newD.toLocaleTimeString());
            candles.push({
                symbol: symbol,
                time: Helper.jsDateToUTC(newD),
                datetime: candleBegin,
                open: Number(bar.Open),
                close: Number(bar.Close),
                high: Number(bar.High),
                low: Number(bar.Low),
                volume: Number(bar.TotalVolume),
                vwap: 0,
            });
            // console.log(`${symbol}: ${bar.IsEndOfHistory}, ${bar.IsRealtime}`);
        });
    } else {
        let bars = await alpacaApi.getPriceHistory(symbol, timeframe);
        candles = bars;
    }
    return candles;
};

export const hasWeeklyOptions = async (symbol: string) => {
    if (symbol == 'ARM') {
        return true;
    }
    if (Helper.isFutures(symbol)) {
        return true;
    } else {
        let result = await tdAmeritradeApi.hasWeeklyOptions(symbol);
        return result;
    }
}

export const getPreviousTradingDate = async () => {
    let date = new Date();
    date.setDate(date.getDate() - 6);
    let startDate = TimeHelper.getDateString(date);
    let candles = await alpacaApi.getDailyChart('SPY', startDate);
    let previousDayCandle = candles[candles.length - 2];
    let nyOpen = TimeHelper.localTimeToNewYorkTime(previousDayCandle.datetime);
    let nyOpenString = TimeHelper.getDateString(nyOpen);
    return nyOpenString;
}

export const getPremarketDollarFromDate = async (symbol: string, startDate: string) => {
    let candles = await alpacaApi.get15MinuteChart(symbol, startDate);
    let dollarTraded = 0;
    for (let i = 0; i < candles.length; i++) {
        let c = candles[i];
        if (!TimeHelper.isBeforeMarketOpenHours(c.datetime)) {
            break;
        }
        let amount = c.vwap * c.volume;
        dollarTraded += amount;
        //console.log(`${c.datetime.toLocaleTimeString()}: ${c.volume}`);
    }
    return dollarTraded;
}
