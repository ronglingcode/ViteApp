import type * as LightweightCharts from 'sunrise-tv-lightweight-charts';
import * as TradingPlans from './tradingPlans/tradingPlans';
import type * as TradingPlansModels from './tradingPlans/tradingPlansModels';
import * as Helper from '../utils/helper';
import type { Timestamp } from 'firebase/firestore';
import * as Watchlist from '../algorithms/watchlist';
import * as Firestore from '../firestore';
import * as Calculator from '../utils/calculator';
import type { Tradebook } from '../tradebooks/baseTradebook';
import * as googleDocsApi from '../api/googleDocs/googleDocsApi';
let usedTimeframe = 1;
export const getUsedTimeframe = () => {
    return usedTimeframe;
}
export const setTimeframe = (timeframe: number) => {
    usedTimeframe = timeframe;
}
export interface MyWindow extends Window {
    HybridApp: {
        Algo: {
            TakeProfit: any,
            RiskManager: any,
            Watchlist: any,
            AutoTrader: any,
        },
        Api: {
            Broker: any,
            MarketData: any,
            TdaApi: any,
            SchwabApi: any,
            AlpacaApi: any,
            GoogleDocsApi: any,
        },
        Config: any,
        Controllers: {
            Handler: any,
            OrderFlow: any,
            OrderFlowManager: any,
            TraderFocus: any,
        },
        Models: {
            Models: any,
            TradingState: any,
            TradingPlans: any,
        },
        UI: {
            Chart: any,
            UI: any,
            QuestionPopup: any,
        },
        UIState: UIState,
        Utils: {
            Helper: any,
            WebRequest: any,
            TimeHelper: any,
        },
        Firestore: any,
        Cache: any,
        AccountCache?: BrokerAccount,
        SymbolData?: Map<string, SymbolData>,
        ChartWidgets: Map<string, ChartWidget>,
        Watchlist?: WatchlistItem[],
        TradingPlans: TradingPlansModels.TradingPlans[],
        StockSelections: string[],
        TradingData: TradingData,
        tosAccountCache: any,
        tsAccountCache: any,
        Secrets: {
            tdameritrade: {
                accessToken: string,
            },
            tradeStation: {
                accessToken: string,
            },
            schwab: {
                accessToken: string,
                schwabClientChannel: string,
                schwabClientCorrelId: string,
                schwabClientCustomerId: string
                schwabClientFunctionId: string
                streamerSocketUrl: string,
            }
        },
        ChartData: any,
        SymbolsList: string[],
        Settings: {
            checkSpread: boolean,
        }
    },
    TradingApp: any,
    TradingData: any,
};

declare let window: MyWindow;

export interface TradingData {
    activeProfileName: string,
    tradingSettings: TradingPlansModels.TradingSettings,
    googleDocContent: string,
}
export interface UIState {
    activeSymbol: string,
    activeTabIndex: number,
};
export interface TradingState {
    date: string,
    initialBalance: number,
    stateBySymbol: Map<string, SymbolState>,
    readOnlyStateBySymbol: Map<string, ReadOnlySymbolState>,
};
export interface ReadOnlySymbolState {
    atr: TradingPlansModels.AverageTrueRange,
}
export interface SymbolState {
    openPrice?: number,
    pendingOrderTimeoutID?: NodeJS.Timeout,
    breakoutTradeStateForLong: BreakoutTradeState,
    breakoutTradeStateForShort: BreakoutTradeState,
    activeBasePlan?: TradingPlansModels.BasePlan,
    peakRiskMultiple: number,
};
export enum TwoCandlesPattern {
    UpTrend = 'UpTrend',
    StrongUpTrend = 'StrongUpTrend',
    DownTrend = 'DownTrend',
    StrongDownTrend = 'StrongDownTrend',
    InsideBar = 'InsideBar',
    LongEngulfing = 'LongEngulfing',
    ShortEngulfing = 'ShortEngulfing',
};
export enum BreakoutTradeStatus {
    None = 'None',
    Pending = 'Pending',
    Triggered = 'Triggered',
    FirstLeg = '1st leg',
    FirstRetracement = '1st pullback',
    SecondLeg = '2nd leg',
    SecondRetracement = '2nd pullback',
};
export interface BreakoutTradeState {
    hasValue: boolean,
    entryPrice: number,
    stopLossPrice: number,
    initialQuantity: number,
    sizeMultipler: number,
    submitTime: Timestamp,
    isLong: boolean,
    status: BreakoutTradeStatus,
    isMarketOrder: boolean,
    lowestExitBatchCount: number,
    submitEntryResult: SubmitEntryResult,
    plan: TradingPlansModels.BasePlan,
    maxPullbackAllowed: number,
    maxPullbackReached: number,
    adjustedTargetDueToMaxPullback: boolean,
    exitDescription: string,
    closedOutsideRatio: number,
};
export interface StreamingAccountActivity {
    symbol: string,
    messageType: string,
    messageData: string,
};
export interface LogTags {
    symbol?: string,
    logSessionName?: string,
};
export interface TimeFrameChart {
    timeframe: number,
    chart: LightweightCharts.IChartApi,
    candleSeries: LightweightCharts.ISeriesApi<"Candlestick">,
    volumeSeries: LightweightCharts.ISeriesApi<"Histogram">,
    keyAreaSeriesList: LightweightCharts.ISeriesApi<"Candlestick">[],
    premktHigh?: LightweightCharts.ISeriesApi<"Line">,
    premktLow?: LightweightCharts.ISeriesApi<"Line">,
    vwapSeries: LightweightCharts.ISeriesApi<"Line">,
    markers: LightweightCharts.SeriesMarker<LightweightCharts.UTCTimestamp>[],
    tradeMarkers: LightweightCharts.SeriesMarker<LightweightCharts.UTCTimestamp>[],
    levelOneImbalanceMarkers: LightweightCharts.SeriesMarker<LightweightCharts.UTCTimestamp>[],
    liveRMarker?: LightweightCharts.SeriesMarker<LightweightCharts.UTCTimestamp>,
    filledPriceLine?: LightweightCharts.IPriceLine,
    maxEntryLine?: LightweightCharts.IPriceLine,
    tradeManagementLevels: LightweightCharts.IPriceLine[],
    momentumLevels: LightweightCharts.IPriceLine[],
}
export interface ChartState {
    crosshairPrice: number,
    hiddenAnswer: string,
}
export interface ChartWidget {
    symbol: string
    tabIndex: number,
    isDark: boolean,
    stock: WatchlistItem,
    htmlContents: ChartWidgetHtmlContents,
    timeframeChartM1: TimeFrameChart,
    timeframeChartM5: TimeFrameChart,
    timeframeChartM15: TimeFrameChart,
    timeframeChartM30: TimeFrameChart,
    chartM1: LightweightCharts.IChartApi,
    chartM5: LightweightCharts.IChartApi,
    chartM15: LightweightCharts.IChartApi,
    chartM30: LightweightCharts.IChartApi,
    candleSeries: LightweightCharts.ISeriesApi<"Candlestick">,
    entryPriceLine?: LightweightCharts.IPriceLine,
    stopLossPriceLine?: LightweightCharts.IPriceLine,
    riskLevelPriceLine?: LightweightCharts.IPriceLine,
    entryOrders: OrderModel[],
    entryOrdersPriceLines: LightweightCharts.IPriceLine[],
    exitOrderPairs: ExitPair[],
    exitOrdersPriceLines: LightweightCharts.IPriceLine[],
    profitRatios: LightweightCharts.IPriceLine[],
    initialQuantity: number,
    initialStopPrice: number,
    initialCost: number,
    /**
     * Risk from 0 to 1
     */
    entryOrderLabelRiskMultiple?: number,
    tradebooks: Map<string, Tradebook>,
    redToGreenState: RedToGreenState,
    /** no need to migrate start */
    currentCandle?: SimpleCandle,
    /** only for M1 chart */
    openPriceSeries: LightweightCharts.ISeriesApi<"Line">,
    chartState: ChartState

};
export interface RedToGreenState {
    hasReversalForLong: boolean,
    hasReversalForShort: boolean,
};
export interface SymbolFundamental {
    symbol: string,
    marketCap: number,
    marketCapFloat: number,
};
export interface ChartWidgetHtmlContents {
    container: HTMLElement, // chartContainer
    chartM1: HTMLElement, // document.getElementById("chart" + tabIndex),
    chartM5: HTMLElement, // document.getElementById("chartM5" + tabIndex),
    chartM15: HTMLElement, // document.getElementById("chartM15" + tabIndex),
    chartM30: HTMLElement, // document.getElementById("chartM30" + tabIndex),
    symbol: HTMLElement, // document.getElementById("symbol" + tabIndex),
    positionCount: Element,
    popupWindow: HTMLElement, // document.getElementById("chart0popup"),
    exitOrders: HTMLElement,
    exitButtonsContainer: HTMLElement,
    timeframeButtonsContainer: HTMLElement,
    currentCandle: CurentCandleElements,
    quantityElements: QuantityElements,
    tradingPlans: AlgoElements,
    sideBar: HTMLElement,
    tradebookButtons: HTMLElement,
    level1QuotePrice: HTMLElement,
    level1QuoteSize: HTMLElement,
    level1QuoteLargeOrders: HTMLElement,
    timeAndSales: HTMLElement,
};
export interface AlgoElements {
    long: HTMLElement,
    short: HTMLElement,
}
export interface QuantityElements {
    input: HTMLInputElement,
    largeOrderInput: HTMLInputElement,
    percentageButton: HTMLElement,
    fixedQuantityButton: HTMLElement,
};
export interface CurentCandleElements {
    open: HTMLElement,
    high: HTMLElement,
    low: HTMLElement,
    close: HTMLElement,
}

export interface WatchlistItem {
    symbol: string,
    marketCapInMillions: number,
};
export interface WatchlistItemPriceTargets {
    price: number,
    percentage: number,
};
export interface LevelOneQuote {
    bidPrice: number,
    askPrice: number,
    bidSize: number,
    askSize: number,
}
export interface SymbolData {
    m1Candles: CandlePlus[],
    m5Candles: CandlePlus[],
    m15Candles: CandlePlus[],
    m30Candles: CandlePlus[],
    m1Volumes: LineSeriesData[],
    m5Volumes: LineSeriesData[],
    m15Volumes: LineSeriesData[],
    m30Volumes: LineSeriesData[],
    m1Vwaps: LineSeriesData[],
    m5Vwaps: LineSeriesData[],
    m15Vwaps: LineSeriesData[],
    m30Vwaps: LineSeriesData[],
    candles: CandlePlus[],
    premarketDollarTraded: number,
    previousDayPremarketDollarTraded: number,
    openRange?: OpenRange,
    OpenRangeLineSeriesData: OpenRangeLineSeriesData,
    keyAreaData: KeyAreaData[]
    highOfDay: number,
    lowOfDay: number,
    premktHigh: number,
    premktLow: number,
    premktAboveVwapCount: number,
    premktBelowVwapCount: number,
    bidPrice: number,
    askPrice: number,
    bidSize: number,
    askSize: number,
    lastTradeTime?: Date,
    tradeTimeIntervalInMilliseconds: number,
    vwap: LineSeriesData[],
    volumes: LineSeriesData[],
    totalVolume: number,
    totalTradingAmount: number,
    schwabLevelOneQuote: LevelOneQuote,
    alpacaLevelOneQuote: LevelOneQuote,
    timeAndSalesPerSecond: TimeAndSalesPerSecond[],
    maxTimeSaleTimestamp: MaxTimeSaleTimestamp,
};
export interface MaxTimeSaleTimestamp {
    timestamp: number,
    tradeIds: string[],
}

export interface KeyAreaData {
    candles: SimpleCandle[],
}

export interface TimeAndSalesPerSecond {
    second: number,  // Unix timestamp in seconds
    count: number,
}
export interface TradeManagementInstructions {
    mapData: Map<string, string[]>,
    conditionsToFail: string[]
}
export const getCurrentSpread = (symbol: string) => {
    let symbolData = getSymbolData(symbol);
    return symbolData.askPrice - symbolData.bidPrice;
}
export const getCurrentRange = (symbol: string, isLong: boolean) => {
    let startPrice = isLong ? getLowestPrice(symbol, false) : getHighestPrice(symbol, false);
    let currentPrice = getCurrentPrice(symbol);
    let range = Math.abs(startPrice - currentPrice);
    return Math.round(range * 100) / 100;
};
export const getHighestPrice = (symbol: string, includePremarket: boolean) => {
    let symbolData = getSymbolData(symbol);
    if (includePremarket) {
        let high = symbolData.premktHigh;
        if (symbolData.highOfDay && symbolData.highOfDay > high)
            high = symbolData.highOfDay;
        return high;
    } else {
        return symbolData.highOfDay;
    }
};

export const getLowestPrice = (symbol: string, includePremarket: boolean) => {
    let symbolData = getSymbolData(symbol);
    if (includePremarket) {
        let low = symbolData.premktLow;
        if (symbolData.lowOfDay && symbolData.lowOfDay < low)
            low = symbolData.lowOfDay;
        return low;
    } else {
        return symbolData.lowOfDay;
    }
};
export interface LineSeriesData extends TimeBasedData {
    value: number,
    color?: string,
    jsDate?: Date,
}
export interface OpenRange extends CandlePlus {
    high3R: number,
    high2R: number,
    high1R: number,
    low1R: number,
    low2R: number,
    low3R: number,
};
export interface OpenRangeLineSeriesData {
    openHigh3R: LineSeriesData[],
    openHigh2R: LineSeriesData[],
    openHigh1R: LineSeriesData[],
    openHigh: LineSeriesData[],
    openPrice: LineSeriesData[],
    openLow: LineSeriesData[],
    openLow1R: LineSeriesData[],
    openLow2R: LineSeriesData[],
    openLow3R: LineSeriesData[],
    orbArea: SimpleCandle[],
}
export enum OrderType {
    LIMIT = "LIMIT",
    STOP = "STOP",
    MARKET = "MARKET",
};

export interface OrderModel {
    symbol: string,
    orderID: string,
    orderType: OrderType,
    price?: number, // stopPrice or limitPrice depends on order type
    quantity: number,
    isBuy: boolean,
    positionEffectIsOpen: boolean,
    rawOrder?: any,
};
export interface EntryOrderModel extends OrderModel {
    exitLimitPrice?: number,
    exitStopPrice?: number,
}
export interface TimeBasedData {
    /** UTC in seconds */
    time: LightweightCharts.UTCTimestamp,
}
export interface SimpleCandle extends TimeBasedData {
    open: number,
    close: number,
    high: number,
    low: number,
};
export interface Candle extends SimpleCandle {
    symbol: string,
    volume: number,
    datetime: number, // like 1667386800000
    vwap: number,
};
export interface CandlePlus extends Candle {
    minutesSinceMarketOpen: number,
    firstTradeTime: number,
};
export const buildCandlePlus = (symbol: string, element: Candle,
    time: LightweightCharts.UTCTimestamp, minutesSinceMarketOpen: number) => {
    let newCandle: CandlePlus = {
        symbol: symbol,
        time: time,
        open: element.open,
        high: element.high,
        low: element.low,
        close: element.close,
        volume: element.volume,
        minutesSinceMarketOpen: minutesSinceMarketOpen,
        firstTradeTime: element.datetime,
        datetime: element.datetime,
        vwap: element.vwap,
    };
    return newCandle;
};
export interface Quote {
    symbol: string,
    bidPrice?: number,
    askPrice?: number,
    bidSize?: number,
    askSize?: number,
};

export interface TimeSale {
    symbol: string,
    tradeTime?: number,
    lastPrice?: number,
    lastSize?: number,
    lastSequence?: number,
    seq?: number,
    receivedTime: Date,
    tradeID?: number,
    rawTimestamp?: string
    timestamp: number,
    conditions: string[],
};

export interface BrokerAccount {
    // fields set by individual API
    orderExecutions: Map<string, OrderExecution[]>,
    entryOrders: Map<string, EntryOrderModel[]>,
    exitPairs: Map<string, ExitPair[]>,
    positions: Map<string, Position>,
    rawAccount?: any,
    currentBalance: number,
    // fields set by common Broker
    trades: Map<string, TradeExecution[]>,
    tradesCount: number,
    nonBreakevenTradesCount: number,
    realizedPnL: number,
};

export interface ExitPair {
    symbol: string,
    STOP?: OrderModel,
    LIMIT?: OrderModel,
    source: string,
    parentOrderID: string,
};

export interface Position {
    symbol: string,
    averagePrice: number,
    // return 0 if no position
    // return +x if long position
    // return -x if short position
    netQuantity: number,
};

export interface OrderExecution {
    symbol: string,
    price: number,
    /**
     * filled time
     */
    time: Date,
    /**
     * one minute bucket time
     */
    tradingViewTime: LightweightCharts.UTCTimestamp,
    quantity: number,
    isBuy: boolean,
    positionEffectIsOpen: boolean,
    roundedPrice: number,
    minutesSinceOpen: number,
};
export interface TradeExecution {
    symbol: string,
    entries: OrderExecution[],
    exits: OrderExecution[],
    realizedPnL: number,
    isLong: boolean,
    isClosed: boolean,
};
export const getTradebooks = (symbol: string) => {
    let widget = getChartWidget(symbol);
    if (!widget || !widget.tradebooks) {
        return new Map<string, Tradebook>();
    }
    return widget.tradebooks;
}
/* #region Exit Orders */
export const getExitPairs = (symbol: string): ExitPair[] => {
    let accountCache = window.HybridApp.AccountCache;
    if (!accountCache)
        return [];
    return accountCache.exitPairs.get(symbol) ?? [];
};
export const getAllLimitExits = (symbol: string) => {
    let exitPairs = getExitPairs(symbol);
    let limitOrders: OrderModel[] = [];
    exitPairs.forEach(pair => {
        if (pair.LIMIT)
            limitOrders.push(pair.LIMIT);
    });
    return limitOrders;
}

export const getFarthestStopOrderPrice = (symbol: string) => {
    if (!window.HybridApp.AccountCache) {
        return 0;
    }
    let exitOrderPairs = window.HybridApp.AccountCache.exitPairs.get(symbol) ?? [];
    let stopOrdersPrices: number[] = [];
    exitOrderPairs.forEach(pair => {
        if (pair.STOP && pair.STOP.price) {
            stopOrdersPrices.push(pair.STOP.price);
        }
    });
    if (stopOrdersPrices.length <= 0)
        return 0;

    let isLong = getPositionNetQuantity(symbol) > 0;
    let price = stopOrdersPrices[0];
    for (let i = 1; i < stopOrdersPrices.length; i++) {
        let nextPrice = stopOrdersPrices[i];
        if (isLong && nextPrice < price) {
            price = nextPrice;
        } else if (!isLong && nextPrice > price) {
            price = nextPrice;
        }
    }
    return price;
};

export const getExitOrderIds = (symbol: string, accountCache: BrokerAccount | undefined) => {
    let orderIds: string[] = [];
    let exitPairs = getExitPairs(symbol);
    exitPairs.forEach(element => {
        if (element.LIMIT) {
            orderIds.push(element.LIMIT.orderID);
        }
        if (element.STOP) {
            orderIds.push(element.STOP.orderID);
        }
    });
    return orderIds;
};
/* #endregion Exit Orders */
export const getEntryOrders = (symbol: string) => {
    if (!window.HybridApp.AccountCache) {
        return [];
    }
    let map = window.HybridApp.AccountCache.entryOrders;
    let entryOrders = map.get(symbol);
    if (entryOrders) {
        return entryOrders;
    } else {
        return [];
    }
}
export const getBreakoutEntryOrders = (symbol: string, isLong: boolean) => {
    let entryOrders = getEntryOrders(symbol);
    let result: EntryOrderModel[] = [];
    entryOrders.forEach(o => {
        if (o.isBuy == isLong) {
            result.push(o);
        }
    });
    return result;
}
export const hasEntryOrdersInSameDirection = (symbol: string, isLong: boolean) => {
    let entries = getEntryOrdersInSameDirection(symbol, isLong);
    return entries.length > 0;
}
export const getEntryOrdersInSameDirection = (symbol: string, isLong: boolean) => {
    let entries = getEntryOrders(symbol);
    let result: string[] = [];
    entries.forEach(e => {
        if (e.isBuy == isLong) {
            result.push(e.orderID);
        }
    });
    return result;
}
export const getBreakoutEntryOrderIds = (symbol: string, accountCache: BrokerAccount | undefined) => {
    let orderIds: string[] = [];
    if (!accountCache)
        return orderIds;

    let entryOrders = accountCache.entryOrders.get(symbol) ?? [];
    entryOrders.forEach(element => {
        if (element.orderType == OrderType.STOP) {
            orderIds.push(element.orderID);
        }
    });
    return orderIds;
};
export const getEntryOrderStopLossPrice = (symbol: string) => {
    let orders = getEntryOrders(symbol);
    if (orders.length == 0) {
        return 0;
    }
    let entryOrder = orders[0];
    if (!entryOrder.exitStopPrice) {
        return 0;
    }
    return entryOrder.exitStopPrice;
}
export const getRealizedProfitLossPerDirection = (symbol: string, isLong: boolean) => {
    let accountCache = window.HybridApp.AccountCache;
    if (!accountCache || !accountCache.trades)
        return 0;
    let trades = accountCache.trades.get(symbol);
    if (!trades)
        return 0;
    let profitLoss = 0;
    trades.forEach(trade => {
        if (trade.isLong == isLong) {
            profitLoss += trade.realizedPnL;
        }
    });
    return profitLoss;
}
export const getRealizedProfitLossForSymbol = (symbol: string) => {
    let accountCache = window.HybridApp.AccountCache;
    if (!accountCache || !accountCache.trades)
        return 0;
    let trades = accountCache.trades.get(symbol);
    if (!trades)
        return 0;
    let profitLoss = 0;
    trades.forEach(trade => {
        profitLoss += trade.realizedPnL;
    });
    return profitLoss;
}

export const getProfitLossFromClosedTrades = (symbol: string) => {
    let accountCache = window.HybridApp.AccountCache;
    if (!accountCache || !accountCache.trades)
        return 0;
    let trades = accountCache.trades.get(symbol);
    if (!trades)
        return 0;
    let profitLoss = 0;
    trades.forEach(trade => {
        if (trade.isClosed) {
            profitLoss += trade.realizedPnL;
        }
    });
    return profitLoss;
}

export const getNetWinningTradesCountPerDirection = (symbol: string, isLong: boolean) => {
    let accountCache = window.HybridApp.AccountCache;
    if (!accountCache || !accountCache.trades)
        return 0;
    let trades = accountCache.trades.get(symbol);
    if (!trades)
        return 0;
    let netWinCount = 0;
    trades.forEach(trade => {
        if (trade.isLong == isLong) {
            if (trade.realizedPnL > 0) {
                netWinCount++;
            } else if (trade.realizedPnL < 0) {
                netWinCount--;
            }
        }
    });
    return netWinCount;
}
export const getAllOrderExecutions = (symbol: string | undefined) => {
    let accountCache = window.HybridApp.AccountCache;
    if (!accountCache)
        return [];
    let orders = accountCache.orderExecutions;
    let results: OrderExecution[] = []
    if (symbol) {
        let o = orders.get(symbol);
        if (o) {
            results.push(...o);
        }
    } else {
        orders.forEach((value: OrderExecution[], key: string) => {
            results.push(...value);
        });
    }
    return results;
};
export const getTradeExecutions = (symbol: string) => {
    let accountCache = window.HybridApp.AccountCache;
    if (!accountCache)
        return [];
    let trades = accountCache.trades.get(symbol);
    if (trades) {
        return trades;
    } else {
        return [];
    }
};

export const hasPremarketTrades = () => {
    let accountCache = window.HybridApp.AccountCache;
    if (!accountCache)
        return false;
    let trades = accountCache.trades;
    let symbols = trades.keys();
    let symbolList = Array.from(symbols);
    let marketOpenTime = Helper.getMarketOpenTime();
    for (let i = 0; i < symbolList.length; i++) {
        let symbol = symbolList[i];
        let tradeExecutions = trades.get(symbol);
        if (tradeExecutions) {
            for (let j = 0; j < tradeExecutions.length; j++) {
                let tradeExecution = tradeExecutions[j];
                let entries = tradeExecution.entries;
                for (let k = 0; k < entries.length; k++) {
                    let entry = entries[k];
                    if (entry.time < marketOpenTime) {
                        console.log(`Premarket trade ${symbol} ${entry.time}, it's before ${marketOpenTime}`);
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

export const getCurrentOpenTrade = (symbol: string) => {
    let trades = getTradeExecutions(symbol);
    for (let i = 0; i < trades.length; i++) {
        if (!trades[i].isClosed) {
            return trades[i];
        }
    }
    return null;
}

/**
 * Get the quantity of last exit order
 */
export const getLastExitSize = (symbol: string) => {
    let trades = getTradeExecutions(symbol);
    if (trades.length == 0) {
        return 0;
    }
    let i = trades.length - 1;
    while (i >= 0) {
        let trade = trades[i];
        let l = trade.exits.length;
        if (l > 0) {
            return trade.exits[l - 1].quantity;
        }
        i--;
    };
    return 0;
}

export const getInitialFilledPrice = (symbol: string) => {
    let trades = getTradeExecutions(symbol);
    if (!trades || trades.length == 0)
        return 0;
    let trade = trades[trades.length - 1];
    let entry = trade.entries[0];
    return entry.price;
};

export const getFirstEntryTime = (symbol: string) => {
    let trades = getTradeExecutions(symbol);

    let firstTradeTime = null;
    for (let i = 0; i < trades.length; i++) {
        let entries = trades[i].entries;
        if (!entries || entries.length == 0)
            continue;
        for (let j = 0; j < entries.length; j++) {
            let entry = entries[j];
            if (firstTradeTime == null || firstTradeTime > entry.time) {
                firstTradeTime = entry.time;
            }
        }
    }
    return firstTradeTime;
}

export const getFirstEntryTimeFromNowInSeconds = (symbol: string) => {
    let firstTradeTime = getFirstEntryTime(symbol);
    if (firstTradeTime == null) {
        return -1;
    }
    let now = new Date();
    let seconds = (now.getTime() - firstTradeTime.getTime()) / 1000;
    console.log(`${symbol} first entry ${seconds} seconds ago`);
    return seconds;
};
export const isCandleAnEntryCandle = (symbol: string, candle: Candle) => {
    let trades = getTradeExecutions(symbol);
    if (trades.length == 0) {
        return false;
    }
    let candleTime = Helper.jsDateToUTC
    for (let i = 0; i < trades.length; i++) {
        let trade = trades[i];
        let entries = trade.entries;
        for (let j = 0; j < entries.length; j++) {
            let entry = entries[j];
            entry.tradingViewTime
            if (entry.tradingViewTime == candle.time) {
                return true;
            }
        }
    }
    return false;
}
export const isNowInTheSameMinuteAsEntry = (symbol: string) => {
    let tradeTime = getLastEntryTime(symbol);
    if (!tradeTime)
        return false;

    return Helper.isCurrentMinute(tradeTime);
};

export const getLastEntryTime = (symbol: string) => {
    let trades = getTradeExecutions(symbol);
    if (trades.length == 0)
        return null;

    let lastTrade = trades[trades.length - 1];
    let entries = lastTrade.entries;
    if (entries.length == 0)
        return null;

    let tradeTime = entries[0].time;
    for (let j = 1; j < entries.length; j++) {
        let entry = entries[j];
        if (tradeTime > entry.time) {
            tradeTime = entry.time;
        }
    }
    return tradeTime;
};

export const getLastEntryTimeFromNowInSeconds = (symbol: string) => {
    let tradeTime = getLastEntryTime(symbol);
    if (!tradeTime)
        return -1;

    let now = new Date();
    let seconds = (now.getTime() - tradeTime.getTime()) / 1000;
    console.log(`${symbol} first entry ${seconds} seconds ago`);
    return seconds;
};

export const getAveragePrice = (symbol: string) => {
    let cache = window.HybridApp.AccountCache;
    if (!cache)
        return 0;
    let position = cache.positions.get(symbol);
    if (!position)
        return 0;
    return Helper.roundPrice(symbol, position.averagePrice);
};
export const getPosition = (symbol: string) => {
    let cache = window.HybridApp.AccountCache;
    if (!cache)
        return undefined;
    return cache.positions.get(symbol);
};
export const getOpenPositions = () => {
    let openPositions: Position[] = [];
    let cache = window.HybridApp.AccountCache;
    if (!cache)
        return openPositions;

    cache.positions.forEach((position, symbol) => {
        if (position.netQuantity != 0) {
            openPositions.push(position);
        }
    });
    return openPositions;
}

export const getBrokerAccount = () => {
    return window.HybridApp.AccountCache;
}
export const getPositionSymbols = () => {
    let cache = window.HybridApp.AccountCache;
    let result: string[] = [];
    if (!cache)
        return result;
    cache.positions.forEach((value: Position, key: string) => {
        result.push(key);
    })
    return result;
}
/**
 * @returns negative quantity if short
 */
export const getPositionNetQuantity = (symbol: string) => {
    let p = getPosition(symbol);
    if (p)
        return p.netQuantity;
    else
        return 0;
};

export const getRealizedProfitLoss = () => {
    if (window.HybridApp.AccountCache)
        return window.HybridApp.AccountCache.realizedPnL;
    return 0;
};

export const getDefaultSymbolData = () => {
    let m1Candles: CandlePlus[] = [];
    let m1Volumes: LineSeriesData[] = [];
    let result: SymbolData = {
        candles: m1Candles,
        m1Candles: m1Candles,
        m5Candles: [],
        m15Candles: [],
        m30Candles: [],
        m1Volumes: m1Volumes,
        m5Volumes: [],
        m15Volumes: [],
        m30Volumes: [],
        m1Vwaps: [],
        m5Vwaps: [],
        m15Vwaps: [],
        m30Vwaps: [],
        keyAreaData: [],
        premarketDollarTraded: 0,
        previousDayPremarketDollarTraded: 0,
        highOfDay: 0,
        lowOfDay: 99999999,
        premktHigh: 0,
        premktLow: 99999999,
        premktAboveVwapCount: 0,
        premktBelowVwapCount: 0,
        vwap: [],
        volumes: m1Volumes,
        bidPrice: 0,
        askPrice: 0,
        bidSize: 0,
        askSize: 0,
        tradeTimeIntervalInMilliseconds: 0,
        OpenRangeLineSeriesData: getEmptyOpenRangeLineSeriesData(),
        totalVolume: 0,
        totalTradingAmount: 0,
        schwabLevelOneQuote: {
            bidPrice: 0,
            askPrice: 0,
            bidSize: 0,
            askSize: 0,
        },
        alpacaLevelOneQuote: {
            bidPrice: 0,
            askPrice: 0,
            bidSize: 0,
            askSize: 0,
        },
        timeAndSalesPerSecond: [],
        maxTimeSaleTimestamp: {
            timestamp: 0,
            tradeIds: [],
        }
    };
    return result;
};
export const getEmptyOpenRangeLineSeriesData = () => {
    let data: OpenRangeLineSeriesData = {
        openHigh3R: [],
        openHigh2R: [],
        openHigh1R: [],
        openHigh: [],
        openPrice: [],
        openLow: [],
        openLow1R: [],
        openLow2R: [],
        openLow3R: [],
        orbArea: [],
    };
    return data;
};

export const getSymbolData = (symbol: string) => {
    if (!window.HybridApp.SymbolData) {
        window.HybridApp.SymbolData = new Map<string, SymbolData>();
    }
    let mapValue = window.HybridApp.SymbolData.get(symbol);
    if (!mapValue) {
        let newValue = getDefaultSymbolData();
        window.HybridApp.SymbolData.set(symbol, newValue);
        return newValue;
    } else {
        return mapValue;
    }
};
export const getCandlesFromDisplay = (symbol: string) => {
    let symbolData = getSymbolData(symbol);
    return symbolData.candles;
}
export const getCandlesFromDisplaySinceTime = (symbol: string, time: LightweightCharts.UTCTimestamp) => {
    let allCandles = getCandlesFromDisplay(symbol);
    let results: CandlePlus[] = [];
    for (let i = 0; i < allCandles.length; i++) {
        const candle = allCandles[i];
        if (candle.time >= time) {
            results.push(candle);
        }
    }
    return results;
}
export const getCandlesFromDisplaySinceOpen = (symbol: string) => {
    let time = Helper.getMarketOpenTime();
    let tvTime = Helper.jsDateToTradingViewUTC(time);
    return getCandlesFromDisplaySinceTime(symbol, tvTime);
}
export const getCandlesFromM1 = (symbol: string) => {
    let symbolData = getSymbolData(symbol);
    return symbolData.candles;
}
export const getCandlesFromM1SinceOpen = (symbol: string) => {
    let time = Helper.getMarketOpenTime();
    let tvTime = Helper.jsDateToTradingViewUTC(time);
    return getCandlesFromM1SinceTime(symbol, tvTime);
}
export const getCandlesFromM1SinceTime = (symbol: string, time: LightweightCharts.UTCTimestamp) => {
    let allCandles = getCandlesFromM1(symbol);
    let results: CandlePlus[] = [];
    for (let i = 0; i < allCandles.length; i++) {
        const candle = allCandles[i];
        if (candle.time >= time) {
            results.push(candle);
        }
    }
    return results;
}
export const getUndefinedCandles = (symbol: string) => {
    let symbolData = getSymbolData(symbol);
    return symbolData.candles;
}
export const getUndefinedCandlesSinceOpen = (symbol: string) => {
    let time = Helper.getMarketOpenTime();
    let tvTime = Helper.jsDateToTradingViewUTC(time);
    return getUndefinedCandleSinceTime(symbol, tvTime);
}
export const getRiskLevelPrice = (symbol: string, defaultPrice: number) => {
    let widget = getChartWidget(symbol);
    if (!widget)
        return defaultPrice;
    if (widget.riskLevelPriceLine) {
        return widget.riskLevelPriceLine.options().price;
    }
    return defaultPrice;
}
export const getHighLowBreakoutEntryStopPrice = (symbol: string, isLong: boolean) => {
    let symbolData = getSymbolData(symbol);
    let entryPrice = isLong ? symbolData.highOfDay : symbolData.lowOfDay;
    let stopOutPrice = isLong ? symbolData.lowOfDay : symbolData.highOfDay;
    entryPrice = Calculator.updateStopPriceFromCurrentQuote(symbol, entryPrice, isLong);
    let riskLevelPrice = getRiskLevelPrice(symbol, stopOutPrice);
    return {
        entryPrice: entryPrice,
        stopOutPrice: stopOutPrice,
        riskLevelPrice: riskLevelPrice,
    }
}

export const getCurrentVwap = (symbol: string) => {
    let symbolData = getSymbolData(symbol);
    let vwap = symbolData.vwap;
    let currentVwap = vwap[vwap.length - 1].value;
    return currentVwap;
};
export const getOpenPrice = (symbol: string) => {
    let candles = getCandlesFromDisplaySinceOpen(symbol);
    if (candles && candles.length > 0) {
        return candles[0].open;
    } else {
        return undefined;
    }
};
export const getPreviousCandle = (symbol: string, currentCandle: SimpleCandle) => {
    let candles = getSymbolData(symbol).candles;
    let start = 0;
    while (start + 1 < candles.length) {
        if (candles[start + 1].time >= currentCandle.time) {
            return candles[start];
        } else {
            start++;
        }
    }
    return candles[start];
};
export const getM1ClosedCandlesSinceOpen = (symbol: string) => {
    let candles = getCandlesFromM1SinceOpen(symbol);
    if (candles.length == 0) {
        return [];
    }
    return candles.slice(0, -1);
}
export const getHigherTimeFrameCandles = (symbol: string, timeframe: number) => {
    let symbolData = getSymbolData(symbol);
    if (timeframe == 5) {
        return symbolData.m5Candles;
    } else if (timeframe == 15) {
        return symbolData.m15Candles;
    } else if (timeframe == 30) {
        return symbolData.m30Candles;
    } else {
        return [];
    }
}
export const getHigherTimeFrameVolumes = (symbol: string, timeframe: number) => {
    let symbolData = getSymbolData(symbol);
    if (timeframe == 5) {
        return symbolData.m5Volumes;
    } else if (timeframe == 15) {
        return symbolData.m15Volumes;
    } else if (timeframe == 30) {
        return symbolData.m30Volumes;
    } else {
        return [];
    }
}
export const getCandlesLog = (candles: Candle[]) => {
    let candleLogs = "";
    for (let i = 0; i < candles.length; i++) {
        let c = candles[i];
        candleLogs += `o:${c.open}h:${c.high}l:${c.low}c:${c.close},`;
    }
    return candleLogs;
}
const getMinuteIndex = (minutesSinceMarketOpen: number, timeframe: number) => {
    let result = minutesSinceMarketOpen % timeframe;
    if (result < 0) {
        result = (result + timeframe) % timeframe;
    }
    return result;
}
export const aggregateCandles = (candles: CandlePlus[], timeframe: number) => {
    if (timeframe == 1) {
        return candles;
    }

    if (!candles || candles.length === 0) {
        return [];
    }

    let results: CandlePlus[] = [];
    const groupedByMinuteBucket = createGroupsByMinuteBucket(candles, timeframe);

    for (let [minuteBucketNumber, items] of groupedByMinuteBucket) {
        let merged: CandlePlus = {
            ...items[0]
        };
        for (let i = 1; i < items.length; i++) {
            merged.high = Math.max(merged.high, items[i].high);
            merged.low = Math.min(merged.low, items[i].low);
            merged.close = items[i].close;
        }
        results.push(merged);
    }

    //Firestore.logCandles(results);
    return results;
}
export const createGroupsByMinuteBucket = <T extends TimeBasedData>(rawData: T[], timeframe: number): Map<number, T[]> => {
    // key is the minute bucket number
    let results: Map<number, T[]> = new Map();
    for (let item of rawData) {
        let currentTime = Helper.tvTimestampToLocalJsDate(item.time);
        let minutesSinceOpen = Helper.getMinutesSinceMarketOpen(currentTime);
        let minuteBucketNumber = Math.floor(minutesSinceOpen / timeframe);

        let copy: T = {
            ...item,
        };

        if (!results.has(minuteBucketNumber)) {
            // if there are gaps, set the first item to be the start time of the bucket
            let firstItemJsDate = Helper.tvTimestampToLocalJsDate(copy.time);
            let bucketStartMinute = Math.floor(firstItemJsDate.getMinutes() / timeframe) * timeframe;
            firstItemJsDate.setSeconds(0, 0);
            firstItemJsDate.setMinutes(bucketStartMinute);
            copy.time = Helper.jsDateToTradingViewUTC(firstItemJsDate);
            results.set(minuteBucketNumber, []);
        }
        results.get(minuteBucketNumber)!.push(copy);
    }
    return results;
}

export const aggregateVolumes = (volumes: LineSeriesData[], timeframe: number) => {
    if (timeframe == 1) {
        return volumes;
    }
    if (!volumes || volumes.length === 0) {
        return [];
    }

    // Group items by minuteIndex
    const groupedByMinuteIndex = createGroupsByMinuteBucket(volumes, timeframe);
    let results: LineSeriesData[] = [];
    for (let [minuteBucketNumber, items] of groupedByMinuteIndex) {
        let merged: LineSeriesData = {
            ...items[0],
        };

        merged.jsDate = Helper.tvTimestampToLocalJsDate(items[0].time);
        for (let i = 1; i < items.length; i++) {
            merged.value += items[i].value;
        }
        results.push(merged);
    }

    return results;
}
export const aggregateVwaps = (vwaps: LineSeriesData[], timeframe: number) => {
    if (timeframe == 1) {
        return vwaps;
    }
    let results: LineSeriesData[] = [];
    let merged: LineSeriesData = {
        ...vwaps[0]
    };
    let i = 0;
    while (i < vwaps.length) {
        let current = vwaps[i];
        let currentTime = Helper.tvTimestampToLocalJsDate(current.time);
        let minutesSinceOpen = Helper.getMinutesSinceMarketOpen(currentTime);
        let minuteIndex = getMinuteIndex(minutesSinceOpen, timeframe);
        if (minuteIndex % timeframe == 0) {
            merged = {
                ...current,
            };
        } else {
            merged.value = current.value;
        }
        if (minuteIndex % timeframe == (timeframe - 1) || i == vwaps.length - 1) {
            results.push(merged);
        }
        i++;
    }
    return results;
}
export const getVolumesSinceOpen = (symbol: string) => {
    let time = Helper.getMarketOpenTime();
    let tvTime = Helper.jsDateToTradingViewUTC(time);
    let symbolData = getSymbolData(symbol);
    let results: LineSeriesData[] = [];
    for (let i = 0; i < symbolData.volumes.length; i++) {
        const candle = symbolData.volumes[i];
        if (candle.time >= tvTime) {
            results.push(candle);
        }
    }
    return results;
}
export const getVwapsSinceOpen = (symbol: string) => {
    let time = Helper.getMarketOpenTime();
    let tvTime = Helper.jsDateToTradingViewUTC(time);
    let symbolData = getSymbolData(symbol);
    let results: LineSeriesData[] = [];
    for (let i = 0; i < symbolData.vwap.length; i++) {
        const candle = symbolData.vwap[i];
        if (candle.time >= tvTime) {
            results.push(candle);
        }
    }
    return results;
}
export const openPriceIsAboveVwap = (symbol: string) => {
    let open = getOpenPrice(symbol);
    let lastVwapBeforeOpen = getLastVwapBeforeOpen(symbol);
    Firestore.logDebug(`${symbol} open ${open}, last vwap ${lastVwapBeforeOpen}`);
    if (open && open > lastVwapBeforeOpen) {
        return true;
    } else {
        return false;
    }
}
export const getLastVolumeBeforeOpen = (symbol: string) => {
    let time = Helper.getMarketOpenTime();
    let tvTime = Helper.jsDateToTradingViewUTC(time);
    let symbolData = getSymbolData(symbol);
    let i = 0;
    let volumes = symbolData.volumes;
    while (i < volumes.length) {
        const candle = volumes[i];
        if (candle.time >= tvTime) {
            break;
        }
        i++;
    }
    i--;
    if (i >= 0) {
        let lastVolume = volumes[i];
        return lastVolume.value;
    } else {
        Firestore.logError(`getLastVolumeBeforeOpen last candle not found`);
        return 0;
    }
}
export const getLastVwapBeforeOpen = (symbol: string) => {
    let vwapCorrection = TradingPlans.getVwapCorrection(symbol);
    if (vwapCorrection.open > 0) {
        return vwapCorrection.open;
    }
    let time = Helper.getMarketOpenTime();
    let tvTime = Helper.jsDateToTradingViewUTC(time);
    let symbolData = getSymbolData(symbol);
    let vwaps = symbolData.vwap;
    let i = 0;
    while (i < vwaps.length) {
        const candle = vwaps[i];
        if (candle.time >= tvTime) {
            break;
        }
        i++;
    }
    i--;
    let lastVwap = vwaps[i];
    return lastVwap.value;
}
export const getUndefinedCandleSinceTime = (symbol: string, time: LightweightCharts.UTCTimestamp) => {
    let symbolData = getSymbolData(symbol);
    let results: CandlePlus[] = [];
    for (let i = 0; i < symbolData.candles.length; i++) {
        const candle = symbolData.candles[i];
        if (candle.time >= time) {
            results.push(candle);
        }
    }
    return results;
}


export const setChartWidget = (symbol: string, widget: ChartWidget) => {
    if (!window.HybridApp.ChartWidgets) {
        window.HybridApp.ChartWidgets = new Map<string, ChartWidget>();
    }
    window.HybridApp.ChartWidgets.set(symbol, widget);
};

export const getChartWidget = (symbol: string) => {
    return window.HybridApp.ChartWidgets.get(symbol);
};
export const getChartsInAllTimeframes = (symbol: string) => {
    let widget = getChartWidget(symbol);
    if (!widget)
        return [];
    return [widget.timeframeChartM1, widget.timeframeChartM5, widget.timeframeChartM15, widget.timeframeChartM30];
};
export const getChartsHtmlInAllTimeframes = (symbol: string) => {
    let widget = getChartWidget(symbol);
    if (!widget)
        return [];
    return [widget.htmlContents.chartM1, widget.htmlContents.chartM5, widget.htmlContents.chartM15, widget.htmlContents.chartM30];
}
export const getExitOrdersPairs = (symbol: string) => {
    let widget = getChartWidget(symbol);
    if (!widget)
        return [];
    return widget.exitOrderPairs;
};
export const getWatchlist = () => {
    if (!window.HybridApp.Watchlist)
        return [];
    return window.HybridApp.Watchlist;
};
export const getWatchlistSymbolsInString = () => {
    let symbols: string[] = [];
    let watchlist = getWatchlist();
    for (let i = 0; i < watchlist.length; i++) {
        let s = watchlist[i].symbol;
        symbols.push(s);
    }
    return symbols.join(',');
}
export const getCurrentPrice = (symbol: string) => {
    let lastCandle = getCurrentCandle(symbol);
    if (!lastCandle) {
        return 0;
    }
    let currentPrice = lastCandle.close;
    return currentPrice;
};

export const getCurrentCandle = (symbol: string) => {
    let symbolData = getSymbolData(symbol);
    let candles = symbolData.candles;
    let lastCandle = candles[candles.length - 1];
    return lastCandle;
}

export const getUIState = () => {
    return window.HybridApp.UIState;
};

export const getCandlesTimeDifferenceInMinutes = (start: SimpleCandle, end: SimpleCandle) => {
    let diff = end.time - start.time;
    return diff / (60);
};
/**
 * @returns 0 if no fixed quantity
 */
export const getFixedQuantityFromInput = (symbol: string) => {
    let widget = getChartWidget(symbol);
    if (!widget)
        return 0;
    let input = widget.htmlContents.quantityElements.input;
    let text = input.value;
    let result = parseInt(text);
    if (!isNaN(result))
        return result;
    else
        return 0;
};

export const toTdaOrderTypeString = (t: OrderType) => {
    let orderType = 'MKT';
    if (t == OrderType.LIMIT)
        orderType = 'LMT';
    else if (t == OrderType.STOP)
        orderType = 'STP';
    return orderType;
};

export const setConfigData = async () => {
    let config = await TradingPlans.fetchConfigData();
    window.HybridApp.TradingPlans = config.tradingPlans;
    window.HybridApp.StockSelections = config.stockSelections;
    let googleDocContent = await googleDocsApi.fetchDocumentContent(config.googleDocId);
    console.log('set active profile name ' + config.activeProfileName);
    window.HybridApp.TradingData = {
        activeProfileName: config.activeProfileName,
        tradingSettings: config.tradingSettings,
        googleDocContent: googleDocContent,
    };
    scheduleTradingPlansRefreshBeforeMarketOpen();
    return true;
}

const scheduleTradingPlansRefreshBeforeMarketOpen = () => {
    let seconds = Helper.getSecondsToMarketOpen(new Date());
    seconds = seconds - 10;// give 10 seconds before market open
    if (seconds <= 0)
        return;
    console.log(`refresh trading plan in ${seconds} seconds`);
    setTimeout(() => {
        refreshTradingPlans();
    }, seconds * 1000);
}

export const getEnabledTradebooksForSingleDirection = (symbol: string, isLong: boolean) => {
    let widget = getChartWidget(symbol);
    if (!widget)
        return [];
    let tradebooks: Tradebook[] = [];
    if (widget.tradebooks) {
        for (let tradebookMapEntryPair of widget.tradebooks) {
            let tradebook = tradebookMapEntryPair[1];
            if (tradebook.isLong == isLong && tradebook.isEnabled()) {
                tradebooks.push(tradebook);
            }
        }
    }
    return tradebooks;
}
export const refreshTradingPlans = async () => {
    let config = await TradingPlans.fetchConfigData();
    window.HybridApp.TradingPlans = config.tradingPlans;
}

export interface KeyAreaToDraw {
    upperPrice: number,
    lowerPrice: number,
    direction: number,
}

export const getAtr = (symbol: string) => {
    let p = TradingPlans.getTradingPlans(symbol);
    return p.atr;
}
export const getTodayRange = (atr: TradingPlansModels.AverageTrueRange) => {
    return Helper.roundToCents(atr.average * atr.mutiplier);
}

export const isLongForReload = (symbol: string) => {
    let netQuantity = getPositionNetQuantity(symbol);
    if (netQuantity != 0) {
        return netQuantity > 0;
    }
    let trades = getTradeExecutions(symbol);
    if (trades.length == 0) {
        return true;
    }
    let lastTrade = trades[trades.length - 1];
    return lastTrade.entries[0].isBuy;
};

export const generateLogTags = (symbol: string, prefix: string) => {
    let logSessionName = Helper.generateLogSessionName(prefix);
    let logTags: LogTags = {
        logSessionName: logSessionName,
        symbol: symbol,
    };
    return logTags;
};

export const getDollarTradedAfterOpenInMillions = (symbol: string) => {
    let symbolData = getSymbolData(symbol);
    let dollarTraded = symbolData.totalTradingAmount - symbolData.premarketDollarTraded;
    return dollarTraded / 1000000;
}
const logIf = (message: string, debug?: boolean) => {
    if (debug) {
        Firestore.logInfo(message);
    }
}
export const getLiquidityScale = (symbol: string, debug?: boolean) => {
    let candles = getVolumesSinceOpen(symbol);
    let price = getCurrentPrice(symbol);
    if (candles.length == 0) {
        return 0;
    }
    let oneMillionShares = 1000000;
    let item = Watchlist.getWatchlistItem(symbol);
    let threshold = item.marketCapInMillions * 1000;
    let firstMinuteTraded = price * candles[0].value;
    logIf(`first minute trade ${firstMinuteTraded}`, debug);
    logIf(`candles.length = ${candles.length}`, debug);
    logIf(`threshold ${threshold}`, debug);
    let lastMinuteVolumeBeforeOpen = getLastVolumeBeforeOpen(symbol);
    if (candles.length == 1) {
        if (candles[0].value < lastMinuteVolumeBeforeOpen) {
            return 0;
        } else if (firstMinuteTraded > Math.min(20000000, threshold)) {
            logIf(`case 1`, debug);
            return 1;
        } else if (candles[0].value > 10 * lastMinuteVolumeBeforeOpen) {
            logIf(`case 2`, debug);
            return 1;
        } else if (candles[0].value > oneMillionShares) {
            return 1;
        } else if (firstMinuteTraded > 10000000) {
            logIf(`case 3`, debug);
            return 0.35;
        } else if (firstMinuteTraded > threshold) {
            logIf(`case 4`, debug);
            return 0.35;
        } else {
            logIf(`case 5`, debug);
            return 0;
        }
    }

    let maxVolume = candles[0].value;
    for (let i = 1; i < candles.length; i++) {
        if (candles[i].value > maxVolume) {
            maxVolume = candles[i].value;
        }
    }
    logIf(`max volume: ${maxVolume}`, debug);
    let dollarTraded = price * maxVolume;
    if (maxVolume < lastMinuteVolumeBeforeOpen) {
        return 0;
    } else if (maxVolume > 10 * lastMinuteVolumeBeforeOpen) {
        return 1;
    } else if (maxVolume > oneMillionShares) {
        return 1;
    } else if (dollarTraded > Math.min(20000000, threshold)) {
        logIf('after case 1', debug);
        return 1;
    } else if (dollarTraded > 10000000) {
        logIf('after case 2', debug);
        return dollarTraded / 20000000;
    } else if (dollarTraded > threshold) {
        logIf('after case 3', debug);
        return 0.35;
    } else {
        logIf('after case 4', debug);
        return 0;
    }
}
export const getQuantityDetails = (symbol: string) => {
    let exits = getExitOrdersPairs(symbol);
    let quantityWithBothLegs = 0;
    let quantityWithOneLeg = 0;
    let totalQuantity = Math.abs(getPositionNetQuantity(symbol));
    exits.forEach(pair => {
        if (pair.STOP && pair.LIMIT) {
            quantityWithBothLegs += pair.STOP.quantity;
        } else if (pair.STOP) {
            quantityWithOneLeg += pair.STOP.quantity;
        } else if (pair.LIMIT) {
            quantityWithOneLeg += pair.LIMIT.quantity;
        }
    });
    let quantityWithoutLegs = totalQuantity - quantityWithBothLegs - quantityWithOneLeg;
    return {
        totalQuantity: totalQuantity,
        quantityWithoutLegs: quantityWithoutLegs,
        quantityWithOneLeg: quantityWithOneLeg,
        quantityWithBothLegs: quantityWithBothLegs,
    };
}

export interface ProfitTarget {
    target: number,
    quantity: number,
}

export interface SubmitEntryResult {
    profitTargets: ProfitTarget[],
    totalQuantity: number,
    isSingleOrder: boolean,
    tradeBookID: string,
}
export interface CheckRulesResult {
    allowed: boolean,
    reason: string,
}
export interface DisplayLevel {
    level: number,
    title: string,
}
export const getMarketCapInMillions = (symbol: string) => {
    let p = TradingPlans.getTradingPlans(symbol);
    return p.marketCapInMillions;
}

export const getAtrThreshold = (symbol: string) => {
    // sometimes it's just about 1 ATR but less than 1 ATR
    return 0.5;
    let cap = getMarketCapInMillions(symbol);
    let capInBillions = cap / 1000;
    if (capInBillions >= 100) {
        return 0.5;
    } else {
        return 1;
    }
}

export const isSnapMode = () => {
    if (window && window.HybridApp &&
        window.HybridApp.TradingData &&
        window.HybridApp.TradingData.tradingSettings &&
        window.HybridApp.TradingData.tradingSettings.snapMode
    ) {
        return true;
    } else {
        return false;
    }
}

export const hasPriceBeenInTradableArea = (symbol: string, isLong: boolean) => {
    let area = getTradableArea(symbol, isLong);
    let symbolData = getSymbolData(symbol);
    if (symbolData.highOfDay < area.low || symbolData.lowOfDay > area.high) {
        return false;
    } else {
        return true;
    }
}


export const getTradableArea = (symbol: string, isLong: boolean) => {
    let p = TradingPlans.getTradingPlans(symbol);
    let keyArea = TradingPlans.getSingleMomentumLevel(p);
    let keyLevel = isLong ? keyArea.high : keyArea.low;
    let atr = p.atr.average;
    let multipler = p.marketCapInMillions > 100000 ? 0.5 : 1;
    if (isLong) {
        return {
            high: Helper.roundPrice(symbol, keyLevel + atr * multipler),
            low: keyLevel,
            distanceToVwap: Helper.roundPrice(symbol, atr / 4),
        }
    } else {
        return {
            high: keyLevel,
            low: Helper.roundPrice(symbol, keyLevel - atr * multipler),
            distanceToVwap: Helper.roundPrice(symbol, atr / 4),
        }
    }
}
/**
 * @returns 0 if not in tradable area, 1 if in tradable area
 */
export const isPriceInTradableArea = (symbol: string, isLong: boolean, price: number) => {
    let tradableArea = getTradableArea(symbol, isLong);
    if (tradableArea.low <= price && price <= tradableArea.high) {
        return 1;
    } else {
        return 0;
    }
}

export const getRedToGreenState = (symbol: string, isLong: boolean): boolean => {
    let widget = getChartWidget(symbol);
    if (!widget) {
        return false;
    }
    let redToGreenState = widget.redToGreenState;
    if (isLong) {
        return redToGreenState.hasReversalForLong;
    } else {
        return redToGreenState.hasReversalForShort;
    }
}

export interface TradebookEntryParameters {
    useFirstNewHigh: boolean,
    useCurrentCandleHigh: boolean,
    useMarketOrderWithTightStop: boolean,
}
export const getDefaultEntryParameters = () => {
    let ret: TradebookEntryParameters = {
        useCurrentCandleHigh: false,
        useFirstNewHigh: false,
        useMarketOrderWithTightStop: false,
    }
    return ret;
}

export interface SchwabAccountActivity {
    key: string,
    account: string,
    messageType: string,
    messageData: string,
}

export interface ExitOrderToDraw {
    price: number,
    sequenceNumber: number,
    legNumber: number,
    label: string,
    color: string,
    isBuyOrder: boolean,
    orderType: OrderType,
    q: number,
    riskMultiples: number,
    orderData: OrderModel,
}

export const getLevelFromSingleExitTarget = (symbolData: SymbolData, isLong: boolean, target: TradingPlansModels.SingleExitTarget,
    atr: number, entryPrice: number, stopLossPrice: number
) => {
    let candidates: number[] = [];
    if (target.level > 0) {
        candidates.push(target.level);
    }

    if (target.atr > 0) {
        if (isLong) {
            candidates.push(symbolData.lowOfDay + target.atr * atr);
        } else {
            candidates.push(symbolData.highOfDay - target.atr * atr);
        }
    }
    if (target.rrr > 0) {
        let risk = Math.abs(entryPrice - stopLossPrice);
        if (isLong) {
            candidates.push(entryPrice + target.rrr * risk);
        } else {
            candidates.push(entryPrice - target.rrr * risk);
        }
    }
    if (isLong) {
        return Math.min(...candidates);
    } else {
        return Math.max(...candidates);
    }
}

export interface CamarillaPivots {
    R1: number,
    R2: number,
    R3: number,
    R4: number,
    R5: number,
    R6: number,
    S1: number,
    S2: number,
    S3: number,
    S4: number,
    S5: number,
    S6: number
}