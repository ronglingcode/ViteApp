import * as Secret from '../../config/secret';
import type * as Models from '../../models/models';
import * as Helper from '../../utils/helper';
import * as Firestore from '../../firestore';
import { MassiveApi } from '../../trading/libraries/massive/api.ts';
import { browserHttp } from '../../trading/adapters/browserHttp.ts';
import type { Candle } from '../../trading/models/market.ts';
import { marketTime } from '../../trading/runtime/marketClock.ts';

export const massiveApi = new MassiveApi(browserHttp, () => Secret.massive().apiKey);
export const toChartCandle = (candle: Candle): Models.CandlePlus => ({
    ...candle,
    time: Helper.jsDateToTradingViewUTC(new Date(candle.datetime)),
    minutesSinceMarketOpen: marketTime(candle.datetime).minutesSinceMarketOpen,
    firstTradeTime: candle.datetime,
});
const chartBars = async (load: Promise<Candle[]>) => (await load).map(toChartCandle);
export const getPriceHistory = (symbol: string, timeframe: number) =>
    chartBars(massiveApi.getPriceHistory(symbol, timeframe, marketTime(Date.now()).date));
export const getPriceHistoryFromOldDateForHigherTimeframe = (symbol: string, timeframe: number, startDate: string, endDate: string) =>
    chartBars(massiveApi.getPriceHistoryFromOldDateForHigherTimeframe(symbol, timeframe, startDate, endDate));
export const getBars = (symbol: string, url: string) => chartBars(massiveApi.getBars(symbol, url));
export const getDailyCandlesForLastNDays = (symbol: string, nDays: number, endDateExcluded: string) =>
    chartBars(massiveApi.getDailyCandlesForLastNDays(symbol, nDays, endDateExcluded));
export const getSharesOutstanding = async (symbol: string): Promise<number> => {
    try { return await massiveApi.getSharesOutstanding(symbol); }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Massive reference read failed';
        Firestore.logError(`[Massive] ${symbol}: ${message}`);
        return 0;
    }
};
