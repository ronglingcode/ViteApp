import { MarketLoader } from '../runtime/marketLoader.ts';
import type { Trade } from '../models/market.ts';
import type { MarketState } from '../core/marketdata/marketState.ts';
import { ObservedMassiveApi } from '../../health/observedMassiveApi.ts';
import { readHttp } from '../../health/readHttp.ts';
import * as Secret from '../../config/secret';
import * as Helper from '../../utils/helper';
import { marketTime } from '../core/marketdata/marketClock.ts';
import type * as Models from '../../models/models';

export const massiveApi = new ObservedMassiveApi(readHttp, () => Secret.massive().apiKey);
export const marketLoader = new MarketLoader(massiveApi);
export const toChartCandle = (candle: import('../models/market.ts').Candle): Models.CandlePlus => ({
    ...candle, time: Helper.jsDateToTradingViewUTC(new Date(candle.datetime)),
    minutesSinceMarketOpen: marketTime(candle.datetime).minutesSinceMarketOpen, firstTradeTime: candle.datetime,
});
export const coreChartCandle = (candle: NonNullable<ReturnType<MarketState['metrics']>['candle']>, firstTradeTime = candle.datetime): Models.CandlePlus =>
    ({ ...toChartCandle(candle), firstTradeTime });

export function applyMarketTrade(record: Models.TimeSale) {
    const trade: Trade = {
        symbol: record.symbol, timestamp: record.tradeTime ?? record.timestamp,
        price: record.lastPrice ?? 0, size: record.lastSize ?? 0,
        sequence: record.seq === undefined ? undefined : String(record.seq),
        id: record.tradeID === undefined ? undefined : String(record.tradeID),
        conditions: record.conditions.map(Number),
    };
    const accepted = marketLoader.acceptTrade(trade);
    const state = marketLoader.getState(trade.symbol);
    return accepted && state ? state.metrics() : undefined;
}
export function applyMarketMetrics(data: Models.SymbolData, metrics: ReturnType<MarketState['metrics']>) {
    data.totalVolume = metrics.totalVolume; data.totalTradingAmount = metrics.totalTradingAmount;
    data.premarketDollarTraded = metrics.premarketDollarTraded;
    data.premktHigh = metrics.premarketHigh; data.premktLow = metrics.premarketLow;
    data.highOfDay = metrics.highOfDay; data.lowOfDay = metrics.lowOfDay;
    data.liquidityScaleLockedAtMax = metrics.liquidityScaleLockedAtMax;
}
