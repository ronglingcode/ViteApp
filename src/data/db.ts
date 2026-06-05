import * as Chart from '../ui/chart';
import * as Helper from '../utils/helper';
import * as TimeHelper from '../utils/timeHelper';
import * as Config from '../config/config';
import * as GlobalSettings from '../config/globalSettings';
import type * as LightweightCharts from 'sunrise-tv-lightweight-charts';
import * as Firestore from '../firestore';
import * as Models from '../models/models';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as AutoTrader from '../algorithms/autoTrader';
import * as OrderFlowManager from '../controllers/orderFlowManager';
import * as ChartSettings from '../ui/chartSettings';
import * as Broker from '../api/broker';
import * as UI from '../ui/ui';
import * as BasicIndicators from '../indicators/basicIndicators';
import * as ChartSeries from '../utils/chartSeries';

// Create a throttled version of cancelAllEntryOrders that executes once per second
const throttledCancelAllEntryOrders = Helper.executeOncePerInterval(
    (symbol: string) => {
        Broker.cancelAllEntryOrders(symbol);
    },
    1000 // 1 second interval
);

export const levelOneQuoteSourceAlpaca: string = 'alpaca';
export const levelOneQuoteSourceSchwab: string = 'schwab';
export const levelOneQuoteSource: string = levelOneQuoteSourceAlpaca;

const getTimeSaleSourceName = (source: string) => {
    if (source == 'a') {
        return 'alpaca';
    }
    if (source == 'm') {
        return 'massive';
    }
    return source;
};

const maxTimeSaleDiagnosticSamples = 20;
const timeSaleDiagnostics = {
    received: 0,
    accepted: 0,
    late: 0,
    stale: 0,
    rendered: 0,
    samples: [] as string[],
};
(globalThis as any).timeSaleDiagnostics = timeSaleDiagnostics;
let lastTimeSaleDiagnosticsViewAt = 0;

const addTimeSaleDiagnosticSample = (sample: string) => {
    timeSaleDiagnostics.samples.push(sample);
    if (timeSaleDiagnostics.samples.length > maxTimeSaleDiagnosticSamples) {
        timeSaleDiagnostics.samples.shift();
    }
};

const getJsHeapText = () => {
    let memory = (performance as any).memory;
    if (!memory) {
        return '';
    }
    return ` heap=${Math.round(memory.usedJSHeapSize / 1024 / 1024)}M`;
};

const updateTimeSaleDiagnosticsView = () => {
    let now = Date.now();
    if (now - lastTimeSaleDiagnosticsViewAt < 1000) {
        return;
    }
    lastTimeSaleDiagnosticsViewAt = now;

    let network = document.getElementById("network");
    if (!network) {
        return;
    }
    network.textContent = `T&S recv=${timeSaleDiagnostics.received} ok=${timeSaleDiagnostics.accepted} ` +
        `late=${timeSaleDiagnostics.late} stale=${timeSaleDiagnostics.stale} ` +
        `render=${timeSaleDiagnostics.rendered}${getJsHeapText()}`;
};

const logLateTimeSaleIfNeeded = (record: Models.TimeSale, source: string, latestTimestamp: number) => {
    if (record.timestamp <= 0 || record.timestamp >= latestTimestamp) {
        return;
    }

    let lateByMs = latestTimestamp - record.timestamp;
    timeSaleDiagnostics.late++;
    addTimeSaleDiagnosticSample(`[T&S late] ${getTimeSaleSourceName(source)} ${record.symbol} ${lateByMs}ms`);
    updateTimeSaleDiagnosticsView();
};

export const liveTimeSaleRenderIntervalMs = 100;

interface TimeSaleApplyMeta {
    symbol: string,
    allCharts: Models.TimeFrameChart[],
    symbolData: Models.SymbolData,
    timeAndSalesTime: Date,
    lastPrice: number,
    lastVolume: Models.LineSeriesData,
    lastVwap: Models.LineSeriesData,
    lastCandle: Models.CandlePlus,
    isNewCandleData: boolean,
}

interface PendingTimeSaleRender {
    symbol: string,
    allCharts: Models.TimeFrameChart[],
    symbolData: Models.SymbolData,
    timeAndSalesTime: Date,
    lastPrice: number,
    lastVolume: Models.LineSeriesData,
    lastVwap: Models.LineSeriesData,
    lastCandle: Models.CandlePlus,
}

// These maps coalesce high-frequency T&S ticks into one chart render per symbol.
// pendingTimeSaleRenderBySymbol keeps only the newest render payload, scheduledTimeSaleRenderBySymbol
// prevents duplicate timers, and lastTimeSaleRenderAtBySymbol enforces the minimum render interval.
const pendingTimeSaleRenderBySymbol = new Map<string, PendingTimeSaleRender>();
const scheduledTimeSaleRenderBySymbol = new Map<string, ReturnType<typeof setTimeout>>();
const lastTimeSaleRenderAtBySymbol = new Map<string, number>();

// Applies the newest queued T&S render payload for a symbol to the DOM and chart series.
// Older payloads are discarded before this runs, so each flush draws the latest known state.
const flushTimeSaleRender = (symbol: string) => {
    let render = pendingTimeSaleRenderBySymbol.get(symbol);
    pendingTimeSaleRenderBySymbol.delete(symbol);
    scheduledTimeSaleRenderBySymbol.delete(symbol);
    if (!render) {
        return;
    }

    lastTimeSaleRenderAtBySymbol.set(symbol, Date.now());
    timeSaleDiagnostics.rendered++;
    updateTimeSaleDiagnosticsView();
    Chart.updateUI(symbol, "currentPrice", Helper.numberToStringWithPaddingToCents(render.lastPrice));
    UI.updateClock(render.timeAndSalesTime);
    let m1Chart = render.allCharts[0];
    if (!m1Chart) {
        return;
    }

    let volumeText = `${Helper.largeNumberToString(render.lastVolume.value)} $${Helper.roundToMillion(render.lastVolume.value * render.lastPrice)}M`
    Chart.updateUI(symbol, "currentVolume", volumeText);
    setColorForVolume(render.symbolData.candles, render.symbolData.volumes, render.symbolData.volumes.length - 1);
    ChartSeries.safeUpdateSeries(m1Chart.volumeSeries, render.lastVolume, `${symbol} m1 volume`);
    ChartSeries.safeUpdateSeries(m1Chart.vwapSeries, render.lastVwap, `${symbol} m1 vwap`);
    ChartSeries.safeUpdateSeries(m1Chart.candleSeries, render.lastCandle, `${symbol} m1 candle`);
};

// Stores the newest T&S render payload and schedules a flush only when needed.
// If a timer already exists, the pending payload is replaced and that timer will draw the latest state.
const queueTimeSaleRender = (render: PendingTimeSaleRender) => {
    pendingTimeSaleRenderBySymbol.set(render.symbol, render);
    if (scheduledTimeSaleRenderBySymbol.has(render.symbol)) {
        return;
    }

    let now = Date.now();
    let lastRenderAt = lastTimeSaleRenderAtBySymbol.get(render.symbol) ?? 0;
    let delay = Math.max(0, liveTimeSaleRenderIntervalMs - (now - lastRenderAt));
    if (delay == 0) {
        flushTimeSaleRender(render.symbol);
        return;
    }

    scheduledTimeSaleRenderBySymbol.set(render.symbol, setTimeout(() => {
        flushTimeSaleRender(render.symbol);
    }, delay));
};

interface PendingTimeSaleSideEffects {
    lastPrice: number,
    isNewCandleData: boolean,
}

const pendingTimeSaleSideEffectsBySymbol = new Map<string, PendingTimeSaleSideEffects>();
const scheduledTimeSaleSideEffectsBySymbol = new Map<string, ReturnType<typeof setTimeout>>();
const lastTimeSaleSideEffectsAtBySymbol = new Map<string, number>();

const flushTimeSaleSideEffects = (symbol: string) => {
    let pending = pendingTimeSaleSideEffectsBySymbol.get(symbol);
    pendingTimeSaleSideEffectsBySymbol.delete(symbol);
    scheduledTimeSaleSideEffectsBySymbol.delete(symbol);
    if (!pending) {
        return;
    }
    lastTimeSaleSideEffectsAtBySymbol.set(symbol, Date.now());
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    updateChartColor(symbol, widget);
    AutoTrader.onNewTimeAndSalesData(symbol, pending.lastPrice, pending.isNewCandleData);
};

const scheduleTimeSaleSideEffects = (meta: TimeSaleApplyMeta) => {
    pendingTimeSaleSideEffectsBySymbol.set(meta.symbol, {
        lastPrice: meta.lastPrice,
        isNewCandleData: meta.isNewCandleData,
    });
    if (scheduledTimeSaleSideEffectsBySymbol.has(meta.symbol)) {
        return;
    }
    let now = Date.now();
    let lastAt = lastTimeSaleSideEffectsAtBySymbol.get(meta.symbol) ?? 0;
    let delay = Math.max(0, liveTimeSaleRenderIntervalMs - (now - lastAt));
    if (delay == 0) {
        flushTimeSaleSideEffects(meta.symbol);
        return;
    }
    scheduledTimeSaleSideEffectsBySymbol.set(meta.symbol, setTimeout(() => {
        flushTimeSaleSideEffects(meta.symbol);
    }, delay));
};

const shouldIgnoreStaleTimeSale = (
    symbol: string,
    timeframe: number,
    newTime: LightweightCharts.UTCTimestamp,
    lastTime: LightweightCharts.UTCTimestamp,
    tradeTime?: number,
) => {
    if (!GlobalSettings.skipLateTimeAndSalesChartUpdates) {
        return false;
    }
    if (newTime >= lastTime) {
        return false;
    }

    timeSaleDiagnostics.stale++;
    addTimeSaleDiagnosticSample(`[T&S stale] ${symbol} ${timeframe}m ${newTime}<${lastTime}`);
    updateTimeSaleDiagnosticsView();
    return true;
};

export const initialize = (symbol: string, inputCandles: Models.Candle[], dailyCandles: Models.Candle[]) => {
    let usedTimeframe = Models.getUsedTimeframe();
    let widget = Models.getChartWidget(symbol);
    let data = inputCandles;
    if (!widget || !data) {
        console.log("no price history or no widget");
        return false;
    }
    let symbolData = Models.getSymbolData(symbol);
    let keyAreasToDraw = TradingPlans.getKeyAreasToDraw(symbol);
    let loadedCandlesCount = 0;
    for (let i = 0; i < keyAreasToDraw.length; i++) {
        symbolData.keyAreaData.push({
            candles: [],
        });
    }

    let vwapCorrection = TradingPlans.getVwapCorrection(symbol);
    let vwapCorrectionVolumeSum = vwapCorrection.volumeSum;
    let vwapCorrectionTradingAmount = vwapCorrection.tradingSum;
    let vwapCorrected = false;

    data.sort(function (a, b) { return a.datetime - b.datetime });
    let prevDatetime = 0;

    for (let i = 0; i < data.length; i++) {
        let element = data[i];
        // avoid duplicates
        if (prevDatetime === element.datetime) {
            continue;
        } else {
            prevDatetime = element.datetime;
        }
        let d = new Date(element.datetime);
        if (d < Config.Settings.dtStartTime)
            continue;

        let newD = Helper.jsDateToUTC(d);
        let newCandle = Models.buildCandlePlus(symbol, element, newD, Helper.getMinutesSinceMarketOpen(d));
        symbolData.candles.push(newCandle);
        loadedCandlesCount++;
        symbolData.volumes.push({ time: newD, value: element.volume });

        for (let i = 0; i < keyAreasToDraw.length; i++) {
            let upper = keyAreasToDraw[i].upperPrice;
            let lower = keyAreasToDraw[i].lowerPrice;
            let direction = keyAreasToDraw[i].direction;
            let kac = buildKeyAreaCloudCandleData(newD, upper, lower, direction);
            symbolData.keyAreaData[i].candles.push(kac);
        }

        let newTradingAmount = element.volume * Models.getTypicalPrice(element);

        if (newCandle.minutesSinceMarketOpen < 0) {
            // update pre-market indicators
            if (element.low < symbolData.premktLow) {
                symbolData.premktLow = Math.floor(element.low * 100) / 100;
                Chart.resetPreMarketLowLineSeries(widget);
            }
            if (element.high > symbolData.premktHigh) {
                symbolData.premktHigh = Math.ceil(element.high * 100) / 100;
                Chart.resetPreMarketHighLineSeries(widget);
            }
            if (!vwapCorrected && vwapCorrectionTradingAmount > 0 && vwapCorrectionVolumeSum > 0) {
                if (newCandle.minutesSinceMarketOpen >= -30) {
                    symbolData.totalTradingAmount = vwapCorrectionTradingAmount;
                    symbolData.premarketDollarTraded = symbolData.totalTradingAmount;
                    symbolData.totalVolume = vwapCorrectionVolumeSum;
                    vwapCorrected = true;
                }
            }
            symbolData.premarketDollarTraded += newTradingAmount;
            if (newCandle.minutesSinceMarketOpen > -30) {
                updateVwapCount(symbolData, newCandle.close);
            }
        } else {
            // update in-market indicators
            if (element.low < symbolData.lowOfDay) {
                symbolData.lowOfDay = Math.floor(element.low * 100) / 100;
            }
            if (element.high > symbolData.highOfDay) {
                symbolData.highOfDay = Math.ceil(element.high * 100) / 100;
            }
        }
        if (Helper.isMarketOpenTime(d, Config.Settings.currentDay) && i != data.length - 1) {
            // only set opening candle when it's the not last candle
            // meaning the opening candle is closed
            symbolData.openRange = createOpenRange(newCandle);
        }
        pushNewOpenRangeData(symbolData, newD);

        symbolData.totalVolume += element.volume;
        symbolData.totalTradingAmount += (element.volume * Models.getTypicalPrice(element));

        symbolData.m1Vwaps.push({
            time: newD,
            value: symbolData.totalTradingAmount / symbolData.totalVolume,
        });
        Chart.populatePreMarketLineSeries(newD, symbolData.premktHigh, symbolData.premktLow, widget);
        // simulate auto trader
        // not simulate last candle, it's usually not closed
        // let time and sales data trigger this candle close
        if (i < data.length - 1) {
            //AutoTrader.onMinuteClosed(symbol, newCandle, false, symbolData);
        }
    }
    if (loadedCandlesCount == 0) {
        return false;
    }
    for (let i = 1; i < symbolData.volumes.length; i++) {
        setColorForVolume(symbolData.candles, symbolData.volumes, i);
    }

    let allCharts = Models.getChartsInAllTimeframes(symbol);
    allCharts[0].volumeSeries.setData(symbolData.volumes);
    allCharts[0].vwapSeries.setData(symbolData.m1Vwaps);
    allCharts[0].candleSeries.setData(symbolData.candles);
    for (let i = 0; i < keyAreasToDraw.length; i++) {
        allCharts[0].keyAreaSeriesList[i].setData(symbolData.keyAreaData[i].candles);
    }

    for (let lookBackStart = 0; lookBackStart < symbolData.m1Candles.length - 1; lookBackStart++) {
        let ma5 = Models.getMovingAverageCandle(symbol, 5, lookBackStart, symbolData.m1Candles);
        let ma9 = Models.getMovingAverageCandle(symbol, 9, lookBackStart, symbolData.m1Candles);
        if (ma5) {
            symbolData.m1ma5.push({
                time: ma5.time,
                value: ma5.close,
            });
            symbolData.m1Candles[lookBackStart].ma5 = ma5.close;
        }
        if (ma9) {
            symbolData.m1ma9.push({
                time: ma9.time,
                value: ma9.close,
            });
            symbolData.m1Candles[lookBackStart].ma9 = ma9.close;
        }
    }
    allCharts[0].ma5Series?.setData(symbolData.m1ma5);
    allCharts[0].ma9Series?.setData(symbolData.m1ma9);

    if (symbolData.openRange) {
        setDataForOpenPrice(widget, symbolData.OpenRangeLineSeriesData);
    }
    for (let i = 0; i < symbolData.candles.length; i++) {
        // process newly closed candle
        // skip last candle
        if (i === symbolData.candles.length - 1) {
            continue;
        }
        Chart.drawIndicatorsForNewlyClosedCandle(
            i, symbolData.candles, widget
        );
    }
    if (usedTimeframe == 1) {
        symbolData.m1Candles = symbolData.candles;
        symbolData.m1Volumes = symbolData.volumes;
    }
    BasicIndicators.updateIndicators(symbol, symbolData, dailyCandles);
    Chart.onPriceHistoryLoaded(symbol);
    Chart.drawLevelsAfterChartInitialize(widget);
    return true;
}
const updateFromTimeSaleCore = (timesale: Models.TimeSale): TimeSaleApplyMeta | null => {
    let symbol = timesale.symbol;
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return null;
    }

    let allCharts = Models.getChartsInAllTimeframes(symbol);
    let timeframeBucket = Helper.numberToDate(timesale.tradeTime);
    timeframeBucket.setSeconds(0, 0);
    timeframeBucket = TimeHelper.roundToTimeFrameBucketTime(timeframeBucket, 1);
    let newTime = Helper.jsDateToUTC(timeframeBucket);
    let symbolData = Models.getSymbolData(symbol);
    let lastPrice = timesale.lastPrice ?? 0;
    let lastSize = timesale.lastSize ?? 0;
    let lastCandle = symbolData.candles[symbolData.candles.length - 1];
    if (!lastCandle) {
        // sometimes timesales data comes in before chart is loaded.
        return null;
    }
    if (shouldIgnoreStaleTimeSale(symbol, 1, newTime, lastCandle.time, timesale.tradeTime)) {
        return null;
    }
    let timeAndSalesTime = Helper.numberToDate(timesale.tradeTime);
    TimeHelper.setCurrentMarketTime(timeAndSalesTime);
    symbolData.totalVolume += lastSize;
    symbolData.totalTradingAmount += (lastPrice * lastSize);
    let newVwapValue = symbolData.totalTradingAmount / symbolData.totalVolume;
    let lastVolume = symbolData.volumes[symbolData.volumes.length - 1];
    let lastVwap = symbolData.m1Vwaps[symbolData.m1Vwaps.length - 1];
    if (!lastVolume || !lastVwap) {
        // sometimes timesales data comes in before all chart series data is loaded.
        return null;
    }
    if (timeframeBucket < Config.Settings.marketOpenTime) {
        // update pre-market indicators
        let haspremarketChange = false;
        if (lastPrice > symbolData.premktHigh) {
            symbolData.premktHigh = Math.ceil(lastPrice * 100) / 100;
            Chart.resetPreMarketHighLineSeries(widget);
            haspremarketChange = true;
        }
        if (lastPrice < symbolData.premktLow && lastPrice > 0) {
            symbolData.premktLow = Math.floor(lastPrice * 100) / 100;
            Chart.resetPreMarketLowLineSeries(widget);
            haspremarketChange = true;
        }
        if (haspremarketChange) {
            Chart.drawMomentumLevels(widget);
        }
    } else {
        // update in-market indicators
        if (lastPrice > symbolData.highOfDay) {
            symbolData.highOfDay = Math.ceil(lastPrice * 100) / 100;
        }
        if (lastPrice < symbolData.lowOfDay && lastPrice > 0) {
            symbolData.lowOfDay = Math.floor(lastPrice * 100) / 100;
        }
    }
    if (lastCandle && !lastCandle.time) {
        console.log('here');
        console.log(lastCandle);
    }

    let isNewCandleData = true;

    if (newTime == lastCandle.time) {
        isNewCandleData = false;
        // update current candle
        lastVolume.value += lastSize;
        if (timesale.tradeTime && timesale.tradeTime < lastCandle.firstTradeTime) {
            lastCandle.open = lastPrice;
            lastCandle.firstTradeTime = timesale.tradeTime;
        }
        if (lastPrice > lastCandle.high) {
            lastCandle.high = lastPrice;
        } else if (lastPrice < lastCandle.low) {
            lastCandle.low = lastPrice;
        }
        lastCandle.close = lastPrice;
        lastCandle.volume += lastSize;
        lastVwap.value = newVwapValue;

    } else {
        // moved to a new candle
        // handle newly closed candle
        let newlyClosedCandle = lastCandle;
        if (lastCandle && !lastCandle.time) {
            console.log('here');
            console.log(lastCandle);
        }
        let localJsDate = Helper.tvTimestampToLocalJsDate(newlyClosedCandle.time);

        // update Open range price series
        if (Helper.isMarketOpenTime(localJsDate, Config.Settings.currentDay)) {
            // first minute just closed, create open range candle data
            symbolData.openRange = createOpenRange(newlyClosedCandle);
        }

        let keyAreasToDraw = TradingPlans.getKeyAreasToDraw(symbol);
        for (let i = 0; i < keyAreasToDraw.length; i++) {
            const element = keyAreasToDraw[i];
            let kac = buildKeyAreaCloudCandleData(newTime, element.upperPrice, element.lowerPrice, element.direction);
            let keyAreaCandles = symbolData.keyAreaData[i].candles;
            keyAreaCandles.push(kac);
            for (let j = 0; j < allCharts.length; j++) {
                ChartSeries.safeUpdateSeries(allCharts[j].keyAreaSeriesList[i], keyAreaCandles[keyAreaCandles.length - 1], 'key area');
            }

        }
        Chart.drawIndicatorsForNewlyClosedCandle(
            symbolData.candles.length - 1, symbolData.candles, widget
        );
        let ma5 = Models.getMovingAverageCandle(symbol, 5, symbolData.candles.length - 1, symbolData.m1Candles);
        let ma9 = Models.getMovingAverageCandle(symbol, 9, symbolData.candles.length - 1, symbolData.m1Candles);
        if (ma5) {
            symbolData.m1ma5.push({
                time: ma5.time,
                value: ma5.close,
            });
            ChartSeries.safeUpdateSeries(allCharts[0].ma5Series, symbolData.m1ma5[symbolData.m1ma5.length - 1], `${symbol} m1 ma5`);
        }
        if (ma9) {
            symbolData.m1ma9.push({
                time: ma9.time,
                value: ma9.close,
            });
            ChartSeries.safeUpdateSeries(allCharts[0].ma9Series, symbolData.m1ma9[symbolData.m1ma9.length - 1], `${symbol} m1 ma9`);
        }

        // create a new candle
        let newDate = Helper.tvTimestampToLocalJsDate(newTime);
        let newCandleIsMarketOpenCandle = Helper.isMarketOpenTime(newDate, Config.Settings.currentDay);

        lastCandle = {
            symbol: timesale.symbol,
            time: newTime,
            open: lastPrice,
            high: lastPrice,
            low: lastPrice,
            close: lastPrice,
            minutesSinceMarketOpen: Helper.getMinutesSinceMarketOpen(newDate),
            firstTradeTime: timesale.tradeTime ?? 0,
            datetime: timesale.tradeTime ?? 0,
            volume: lastSize,
            vwap: 0,
        };
        let newCandleIsAfterMaketOpen = lastCandle.minutesSinceMarketOpen >= 0;
        symbolData.candles.push(lastCandle);
        lastVolume = {
            time: newTime,
            value: lastSize
        };
        symbolData.volumes.push(lastVolume);
        lastVwap = {
            time: newTime,
            value: newVwapValue
        };
        symbolData.m1Vwaps.push(lastVwap);
        addOrbAreaCandle(newTime, symbolData.OpenRangeLineSeriesData.orbArea, symbolData.openRange);

        if (-30 < lastCandle.minutesSinceMarketOpen && lastCandle.minutesSinceMarketOpen < 0) {
            updateVwapCount(symbolData, lastCandle.close);
        }
        /*
        if (symbolData.OpenRangeLineSeriesData.orbArea[symbolData.OpenRangeLineSeriesData.orbArea.length - 1])
            widget.orbSeries.update(symbolData.OpenRangeLineSeriesData.orbArea[symbolData.OpenRangeLineSeriesData.orbArea.length - 1]);
        */
        Chart.populatePreMarketLineSeries(newTime, symbolData.premktHigh, symbolData.premktLow, widget);
        AutoTrader.onMinuteClosed(symbol, newlyClosedCandle, true, symbolData);
        if (newCandleIsMarketOpenCandle) {
            AutoTrader.onFirstDataAfterMarketOpen(symbol, lastPrice);
            setOpenPriceOnChartFromTimeSale(lastPrice, newTime, widget);
        } else {
            if (newCandleIsAfterMaketOpen) {
                if (Models.hasOpenPrice(symbol)) {
                    let openPriceToUse = Models.getOpenPrice(symbol);
                    setOpenPriceOnChartFromTimeSale(openPriceToUse, newTime, widget);
                }
            }
        }

    }
    //widget.candleSeries.update(lastCandle);

    return {
        symbol,
        allCharts,
        symbolData,
        timeAndSalesTime,
        lastPrice,
        lastVolume,
        lastVwap,
        lastCandle,
        isNewCandleData,
    };
};

export const updateFromTimeSale = (timesale: Models.TimeSale) => {
    let meta = updateFromTimeSaleCore(timesale);
    if (!meta) {
        return;
    }
    queueTimeSaleRender({
        symbol: meta.symbol,
        allCharts: meta.allCharts,
        symbolData: meta.symbolData,
        timeAndSalesTime: meta.timeAndSalesTime,
        lastPrice: meta.lastPrice,
        lastVolume: meta.lastVolume,
        lastVwap: meta.lastVwap,
        lastCandle: meta.lastCandle,
    });
    scheduleTimeSaleSideEffects(meta);
};

/** Apply multiple trades for one symbol; chart/analysis side effects run at most every 100ms. */
export const updateFromTimeSalesBatch = (sales: Models.TimeSale[]) => {
    if (sales.length === 0) {
        return;
    }
    let meta: TimeSaleApplyMeta | null = null;
    for (let i = 0; i < sales.length; i++) {
        let applied = updateFromTimeSaleCore(sales[i]);
        if (applied) {
            meta = applied;
        }
    }
    if (!meta) {
        return;
    }
    queueTimeSaleRender({
        symbol: meta.symbol,
        allCharts: meta.allCharts,
        symbolData: meta.symbolData,
        timeAndSalesTime: meta.timeAndSalesTime,
        lastPrice: meta.lastPrice,
        lastVolume: meta.lastVolume,
        lastVwap: meta.lastVwap,
        lastCandle: meta.lastCandle,
    });
    scheduleTimeSaleSideEffects(meta);
};

const setColorForVolume = (candles: Models.CandlePlus[], volumes: Models.LineSeriesData[], currentIndex: number) => {
    if (currentIndex == 0) {
        return;
    }
    let candle = candles[currentIndex];
    let volume = volumes[currentIndex];
    let previousVolume = volumes[currentIndex - 1];
    if (!candle || !volume || !previousVolume) {
        return;
    }
    if (candle.minutesSinceMarketOpen == 0) {
        return;
    }

    if (volume.value > previousVolume.value) {
        if (candle.close > candle.open) {
            volume.color = ChartSettings.lightGreen;
        } else {
            volume.color = ChartSettings.lightRed;
        }
    }
}
export const updateChartColor = (symbol: string, widget: Models.ChartWidget) => {
    let mo = Helper.getSecondsSinceMarketOpen(TimeHelper.getCurrentMarketTime());
    if (mo <= 0) {
        return;
    }
    let liquidityScale = Models.getLiquidityScale(symbol);
    // exclude spread rules for chart color
    let allRulesPassed = liquidityScale > 0; // && !Rules.isSpreadTooLarge(symbol);
    if (allRulesPassed && widget.isDark) {
        Chart.lightChart(symbol);
    } else if (!allRulesPassed && !widget.isDark) {
        Chart.darkChart(symbol);
        // cancel existing entries (throttled to once per second)
        throttledCancelAllEntryOrders(symbol);
    }
}
const buildKeyAreaCloudCandleData = (time: LightweightCharts.UTCTimestamp, upper: number, lower: number, direction: number) => {
    if (direction > 0) {
        let c: Models.SimpleCandle = {
            time: time,
            open: lower,
            high: upper,
            low: lower,
            close: upper,
        };
        return c;
    } else {
        let c: Models.SimpleCandle = {
            time: time,
            open: upper,
            high: upper,
            low: lower,
            close: lower,
        };
        return c;
    }
}
export const setOpenPriceOnChartFromTimeSale = (
    openPrice: number, time: LightweightCharts.UTCTimestamp,
    widget: Models.ChartWidget) => {
    ChartSeries.safeUpdateSeries(widget.openPriceSeries, { time: time, value: openPrice }, `${widget.symbol} open price`);
}
const setDataForOpenPrice = (widget: Models.ChartWidget, a: Models.OpenRangeLineSeriesData) => {
    widget.openPriceSeries.setData(a.openPrice);
};
const pushNewOpenRangeData = (symbolData: Models.SymbolData,
    newD: LightweightCharts.UTCTimestamp) => {
    if (symbolData.openRange) {

        symbolData.OpenRangeLineSeriesData.openHigh.push({ time: newD, value: symbolData.openRange.high });
        symbolData.OpenRangeLineSeriesData.openPrice.push({ time: newD, value: symbolData.openRange.open });
        symbolData.OpenRangeLineSeriesData.openLow.push({ time: newD, value: symbolData.openRange.low });

        addOrbAreaCandle(newD, symbolData.OpenRangeLineSeriesData.orbArea, symbolData.openRange);
    }
};
export const createOpenRange = (candle: Models.CandlePlus) => {
    let range = candle.high - candle.low;
    let openRange: Models.OpenRange = {
        high3R: candle.high + range * 3,
        high2R: candle.high + range * 2,
        high1R: candle.high + range,
        low1R: candle.low - range,
        low2R: candle.low - range * 2,
        low3R: candle.low - range * 3,
        ...candle
    };
    return openRange;
};

/**
 * Returns the dollar amount in millions
 * @param symbol 
 */
export const getPremarketTradingAmountInMillionDollars = (symbol: string) => {
    let symbolData = Models.getSymbolData(symbol);
    return symbolData.premarketDollarTraded / 1000000;
};

export const getExtremePrice = (symbol: string, up: boolean, secondsSinceMarketOpen: number) => {
    let isPremarket = secondsSinceMarketOpen < 0;
    let symbolData = Models.getSymbolData(symbol);
    let p = 0;
    if (up) {
        if (isPremarket)
            p = symbolData.premktHigh;
        else
            p = symbolData.highOfDay;
    } else {
        if (isPremarket)
            p = symbolData.premktLow;
        else
            p = symbolData.lowOfDay;
    }
    return p;
};



export const updateFromLevelOneQuote = (quote: Models.Quote) => {
    if (!quote)
        return;
    let symbol = quote.symbol;
    let symbolData = Models.getSymbolData(symbol);
    if (quote.bidPrice) {
        symbolData.bidPrice = quote.bidPrice;
    }
    if (quote.askPrice) {
        symbolData.askPrice = quote.askPrice;
    }
    if (quote.bidSize) {
        symbolData.bidSize = quote.bidSize;
    }
    if (quote.askSize) {
        symbolData.askSize = quote.askSize;
    }

    Chart.updateUI(symbol, "bid", `${symbolData.bidPrice}`);
    Chart.updateUI(symbol, "ask", `${symbolData.askPrice}`);
    let spread = Models.getCurrentSpread(symbol);
    spread = Helper.roundPrice(symbol, spread);
    let topPlan = TradingPlans.getTradingPlans(symbol);
    let atr = topPlan.atr.average;
    let spreadInAtr = spread / atr;
    OrderFlowManager.updateQuote(symbol, symbolData.bidSize, symbolData.askSize, symbolData.bidPrice, symbolData.askPrice, spreadInAtr);

    Chart.updateUI(symbol, "spread", `${spread}`);
};

export const addOrbAreaCandle = (newTime: LightweightCharts.UTCTimestamp, orbArea: Models.SimpleCandle[], openingCandle: Models.Candle | undefined) => {
    if (!openingCandle || !orbArea) {
        return;
    }

    orbArea.push({
        time: newTime,
        open: openingCandle.high,
        high: openingCandle.high,
        low: openingCandle.low,
        close: openingCandle.low
    });
};
export const addDataAndUpdateChart = (
    newTime: LightweightCharts.UTCTimestamp, dataArray: any[], newObj: any,
    series: LightweightCharts.ISeriesApi<LightweightCharts.SeriesType>) => {
    dataArray.push({
        ...newObj,
        time: newTime
    });
    // update with last element in dataArray
    ChartSeries.safeUpdateSeries(series, dataArray.slice(-1)[0], 'key area');
};


const updateVwapCount = (symbolData: Models.SymbolData, closePrice: number) => {
    let previousVwap = symbolData.totalTradingAmount / symbolData.totalVolume;
    if (closePrice > previousVwap) {
        symbolData.premktAboveVwapCount++;
    } else if (closePrice < previousVwap) {
        symbolData.premktBelowVwapCount++;
    }
}

/**
 * @returns true if the record should flow into chart processing, false otherwise
 */
export const tryUpdateMaxTimeSaleTimestamp = (record: Models.TimeSale, source: string) => {
    timeSaleDiagnostics.received++;
    updateTimeSaleDiagnosticsView();
    if (!GlobalSettings.skipLateTimeAndSalesChartUpdates) {
        return true;
    }

    let tradeId = record.tradeID?.toString() ?? '';
    let symbolData = Models.getSymbolData(record.symbol);
    if (record.timestamp > symbolData.maxTimeSaleTimestamp.timestamp) {
        symbolData.maxTimeSaleTimestamp = {
            timestamp: record.timestamp,
            tradeIds: [tradeId],
        };
        UI.addToNetwork(source);
        timeSaleDiagnostics.accepted++;
        updateTimeSaleDiagnosticsView();
        return true;
    }
    if (record.timestamp == symbolData.maxTimeSaleTimestamp.timestamp &&
        !symbolData.maxTimeSaleTimestamp.tradeIds.includes(tradeId)
    ) {
        symbolData.maxTimeSaleTimestamp.tradeIds.push(tradeId);
        UI.addToNetwork(source);
        timeSaleDiagnostics.accepted++;
        updateTimeSaleDiagnosticsView();
        return true;
    }
    logLateTimeSaleIfNeeded(record, source, symbolData.maxTimeSaleTimestamp.timestamp);
    return false;
}
