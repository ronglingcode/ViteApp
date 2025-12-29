import * as tradeStationApi from "./tradeStation/api";
import * as tdAmeritradeApi from "./tdAmeritrade/api";
import * as schwabApi from "./schwab/api";
import * as alpacaApi from "./alpaca/api";
import * as massiveApi from "./massive/api";
import * as Helper from '../utils/helper';
import * as TimeHelper from '../utils/timeHelper';
import type { Quote, Candle } from '../models/models';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as GlobalSettings from '../config/globalSettings';
import * as Calculator from '../utils/calculator';
import * as SetupQuality from '../algorithms/setupQuality';

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
    let premarketDollarCollection = await getPremarketDollarFromDate(symbol, startDate);
    let symbolData = Models.getSymbolData(symbol);
    symbolData.premarketDollarCollection = premarketDollarCollection;
    let volumeQuality = SetupQuality.getPremarketVolumeQuality(symbol, premarketDollarCollection);
    Firestore.logInfo(`${symbol} premarket volume quality: ${volumeQuality}`);
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
        if (GlobalSettings.marketDataSource == "alpaca") {
            let bars = await alpacaApi.getPriceHistory(symbol, timeframe);
            candles = bars;
        } else if (GlobalSettings.marketDataSource == "massive") {
            let bars = await massiveApi.getPriceHistory(symbol, timeframe);
            candles = bars;
        }
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

export const get30MinuteChartFromLastNDays = async (symbol: string, nDays: number, todayString: string) => {
  let today = new Date(todayString);
  let date = new Date(today);
  date.setDate(date.getDate() - nDays);
  let startDate = TimeHelper.getDateString(date);

  let candles = await massiveApi.getPriceHistoryFromOldDateForHigherTimeframe(symbol, 30, startDate, todayString);
  return candles;
}

interface VolumePair {
    dollar: number,
    shares: number,
  }

export const getPremarketDollarFromDate = async (symbol: string, startDate: string) => {
    let candles = await get30MinuteChartFromLastNDays(symbol, 20, startDate);
    let dollarTradeByDay: Map<string, VolumePair> = new Map();
    let volumeBarsByDay: Map<string, number[]> = new Map();
    for (let i = 0; i < candles.length; i++) {
      let c = candles[i];
      let candleDatetime = new Date(c.datetime);
      console.log(candleDatetime.toLocaleTimeString());
      if (!TimeHelper.isBeforeMarketOpenHours(candleDatetime)) {
        continue;
      }
      let day = TimeHelper.getDateString(candleDatetime);
      let typicalPrice = Models.getTypicalPrice(c);
      let dollarTrade = Math.round(typicalPrice * c.volume);
      let existingDollarTrade = dollarTradeByDay.get(day);
      let existingVolumeBars = volumeBarsByDay.get(day);
      if (existingVolumeBars) {
        existingVolumeBars.push(Math.round(c.volume));
      } else {
        existingVolumeBars = [Math.round(c.volume)];
      }
      volumeBarsByDay.set(day, existingVolumeBars);
      if (existingDollarTrade) {
        existingDollarTrade.dollar += dollarTrade;
        existingDollarTrade.shares += c.volume;
      } else {
        existingDollarTrade = {
          dollar: dollarTrade,
          shares: c.volume
        };
      }
      dollarTradeByDay.set(day, existingDollarTrade);
    }
  
    let premarketDollarCollection: Models.PremarketDollarCollection = {
      previousDaysDollar: [],
      previousDaysDollarAverage: 0,
      lastDayDollar: 0,
      previousDaysShares: [],
      lastDayShares: 0,
      previousDaysSharesAverage: 0,
      rvol: 0
    }
    
    // Convert Map to array of entries and sort by day to ensure correct order
    const entries = Array.from(dollarTradeByDay.entries()).sort(([dayA], [dayB]) => dayA.localeCompare(dayB));
    
    if (entries.length > 0) {
      // Get the last day's dollar value
      const lastEntry = entries[entries.length - 1];
      premarketDollarCollection.lastDayDollar = lastEntry[1].dollar;
      premarketDollarCollection.lastDayShares = lastEntry[1].shares;
      
      // Add all except the last day to previousDays
      for (let i = 0; i < entries.length - 1; i++) {
        const [day, dollar] = entries[i];
        premarketDollarCollection.previousDaysDollar.push({
          day: day,
          data: dollar.dollar
        });
        premarketDollarCollection.previousDaysShares.push({
          day: day,
          data: dollar.shares
        });
      }
      
      // Calculate average of previous days
      if (premarketDollarCollection.previousDaysDollar.length > 0) {
        const sumDollar = premarketDollarCollection.previousDaysDollar.reduce((acc, item) => acc + item.data, 0);
        premarketDollarCollection.previousDaysDollarAverage = sumDollar / premarketDollarCollection.previousDaysDollar.length;
        const sumShares = premarketDollarCollection.previousDaysShares.reduce((acc, item) => acc + item.data, 0);
        premarketDollarCollection.previousDaysSharesAverage = sumShares / premarketDollarCollection.previousDaysShares.length;
        
        // Calculate rvol (relative volume) as lastDay / previousDaysAverage
      
        if (premarketDollarCollection.previousDaysDollarAverage > 0) {
          premarketDollarCollection.rvol = premarketDollarCollection.lastDayDollar / premarketDollarCollection.previousDaysDollarAverage;
        }
      }
    }
    
    return premarketDollarCollection;
  }
  
  export const getPremarketDollarStats = (symbol: string, premarketDollar: Models.PremarketDollarCollection) => {
    // Build string from previousDays and lastDay
    const previousDaysStr = premarketDollar.previousDaysDollar
      .map(({ day, data: dollar }) => `${day}: ${Calculator.numberToString(dollar)}`)
      .join(', ');
    
    let premarketDollarStr = `$${Calculator.numberToString(premarketDollar.lastDayDollar)} / ${Calculator.numberToString(premarketDollar.lastDayShares)} shares`
    premarketDollarStr += `, rvol: ${(premarketDollar.rvol * 100).toFixed(1)}%`;
    premarketDollarStr += `, avg: ${premarketDollar.previousDaysDollarAverage.toFixed(0)}`;
    premarketDollarStr += `, previous: ${previousDaysStr}`;
    
    return premarketDollarStr;
  }