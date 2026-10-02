import { impliedMarketCapInBillions } from '../trading/core/marketdata/eligibility.ts';
import { marketLoader } from '../trading/adapters/browserMarket.ts';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import { addDays } from '../trading/core/marketdata/marketClock.ts';
import { calculatePremarketVolume } from '../trading/core/marketdata/premarketVolume.ts';
import * as tdAmeritradeApi from "./tdAmeritrade/api";
import * as schwabApi from "./schwab/api";
import * as massiveApi from "./massive/api";
import * as TimeHelper from '../utils/timeHelper';
import type { Quote, Candle } from '../models/models';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as Calculator from '../utils/calculator';
import * as SetupQuality from '../algorithms/setupQuality';

declare let window: Models.MyWindow;

export const getQuote = async (symbol: string) => {
  let quote = await tdAmeritradeApi.getQuote(symbol);
  console.log(quote);
  let q: Quote = {
    symbol: quote.symbol,
    bidPrice: quote.bidPrice,
    askPrice: quote.askPrice,
  };
  return q;
};
export const getFundamentals = async (symbol: string) => {
  return schwabApi.getFundamentals(symbol);
}

export const setPreviousDayPremarketVolume = async (symbol: string, premarketDollarCollection: Models.PremarketDollarCollection) => {
  let symbolData = Models.getSymbolData(symbol);
  symbolData.premarketDollarCollection = premarketDollarCollection;
  let volumeQuality = SetupQuality.getPremarketVolumeQuality(symbol, premarketDollarCollection);
  let lastDayDollar = Calculator.numberToString(premarketDollarCollection.lastDayDollar);
  let previousDaysDollarMedian = Calculator.numberToString(premarketDollarCollection.previousDaysDollarMedian);
  let rvol = Calculator.ratioToPercentageString(premarketDollarCollection.rvol);
  let lastDaySharesInMillions = (premarketDollarCollection.lastDayShares / 1000000).toFixed(2);
  Firestore.logInfo(`${symbol} premarket volume quality: ${volumeQuality}, $${lastDayDollar}, ${lastDaySharesInMillions}M shares, rvol: ${rvol}, median: $${previousDaysDollarMedian}`);
}
export const getSharesOutstanding = async (symbol: string) => {
  let sharesOutstanding = await massiveApi.getSharesOutstanding(symbol);
  let symbolData = Models.getSymbolData(symbol);
  symbolData.sharesOutstanding = sharesOutstanding;
  return sharesOutstanding;
}

export const getImpliedMarketCapInBillions = (symbol: string): number => {
  let symbolData = Models.getSymbolData(symbol);
  let sharesOutstanding = symbolData.sharesOutstanding;
  let currentPrice = Models.getCurrentPrice(symbol);
  return impliedMarketCapInBillions(sharesOutstanding, currentPrice);
}

export const getFullPriceHistory = async (symbol: string, todayStringInput: string) => {
  const loaded = await marketLoader.load(symbol, todayStringInput, Models.getMarketCapInMillions(symbol), TradingPlans.getVwapCorrection(symbol));
  const history = loaded.history;
  return {
    today1MinuteBars: loaded.state.snapshot().candles.map(massiveApi.toChartCandle),
    dailyBars: history.dailyBars.map(massiveApi.toChartCandle),
    premarketDollarCollection: history.premarketDollarCollection,
  };
}
export const getPriceHistory = async (symbol: string, timeframe: number) => {
  let candles: Candle[] = await massiveApi.getPriceHistory(symbol, timeframe);
  return candles;
};

export const hasWeeklyOptions = async (symbol: string) => {
  if (symbol == 'ARM') {
    return true;
  }
  let result = await tdAmeritradeApi.hasWeeklyOptions(symbol);
  return result;
}

export const getPreviousTradingDate = async () => {
  let date = new Date();
  date.setDate(date.getDate() - 6);
  let todayString = TimeHelper.getTodayString();
  let candles = await massiveApi.getDailyCandlesForLastNDays('SPY', 6, todayString);
  if (candles.length < 1) {
    return TimeHelper.getDateString(date);
  }
  let previousDayCandle = candles[candles.length - 1];
  let nyOpen = TimeHelper.localTimeToNewYorkTime(new Date(previousDayCandle.datetime));
  let nyOpenString = TimeHelper.getDateString(nyOpen);
  return nyOpenString;
}

export const get30MinuteChartFromLastNDays = async (symbol: string, nDays: number, todayString: string) => {
  const startDate = addDays(todayString, -nDays);

  let candles = await massiveApi.getPriceHistoryFromOldDateForHigherTimeframe(symbol, 30, startDate, todayString);
  return candles;
}

export const getPremarketDollarFromDate = async (symbol: string, startDate: string) => {
  const candles = await get30MinuteChartFromLastNDays(symbol, 20, startDate);
  return calculatePremarketVolume(candles);
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
