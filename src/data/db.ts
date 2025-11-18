import * as Chart from '../ui/chart';
import * as Helper from '../utils/helper';
import * as TimeHelper from '../utils/timeHelper';
import * as Config from '../config/config';
import type * as LightweightCharts from 'sunrise-tv-lightweight-charts';
import * as Firestore from '../firestore';
import * as Models from '../models/models';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as Rules from '../algorithms/rules';
import * as AutoTrader from '../algorithms/autoTrader';
import * as AutoLevelMomentum from '../algorithms/autoLevelMomentum';
import * as OrderFlowManager from '../controllers/orderFlowManager';
import * as ChartSettings from '../ui/chartSettings';
import * as ProxyServer from '../api/proxyServer';
import * as Broker from '../api/broker';
import * as GlobalSettings from '../config/globalSettings';

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

const buildDataMultipleTimeFrame = (symbol: string, inputCandlesM1: Models.Candle[]) => {
    let symbolData = Models.getSymbolData(symbol);
    let prevDatetime = 0;
    let vwapCorrection = TradingPlans.getVwapCorrection(symbol);
    let vwapCorrectionVolumeSum = vwapCorrection.volumeSum;
    let vwapCorrectionTradingAmount = vwapCorrection.tradingSum;
    let vwapCorrected = false;
    for (let i = 0; i < inputCandlesM1.length; i++) {
        let element = inputCandlesM1[i];
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
        //symbolData.m1Candles.push(newCandle);
        let newVolume = {
            time: newD,
            value: element.volume,
            jsDate: Helper.tvTimestampToLocalJsDate(newD),
        };
        //symbolData.m1Volumes.push(newVolume);

        let newTradingAmount = element.volume * getTypicalPrice(element);

        /*if (newCandle.minutesSinceMarketOpen < 0) {
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
        }*/
    }
    symbolData.m5Candles = Models.aggregateCandles(symbolData.m1Candles, 5);
    symbolData.m15Candles = Models.aggregateCandles(symbolData.m1Candles, 15);
    symbolData.m5Volumes = Models.aggregateVolumes(symbolData.m1Volumes, 5);
    symbolData.m15Volumes = Models.aggregateVolumes(symbolData.m1Volumes, 15);
    symbolData.m30Candles = Models.aggregateCandles(symbolData.m1Candles, 30);
    symbolData.m30Volumes = Models.aggregateVolumes(symbolData.m1Volumes, 30);
}
export const initialize = (symbol: string, inputCandles: Models.Candle[]) => {
    let usedTimeframe = Models.getUsedTimeframe();
    let widget = Models.getChartWidget(symbol);
    let data = inputCandles;
    if (!widget || !data) {
        console.log("no price history or no widget");
        return;
    }
    let symbolData = Models.getSymbolData(symbol);
    let keyAreasToDraw = TradingPlans.getKeyAreasToDraw(symbol);
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
        symbolData.volumes.push({ time: newD, value: element.volume });

        for (let i = 0; i < keyAreasToDraw.length; i++) {
            let upper = keyAreasToDraw[i].upperPrice;
            let lower = keyAreasToDraw[i].lowerPrice;
            let direction = keyAreasToDraw[i].direction;
            let kac = buildKeyAreaCloudCandleData(newD, upper, lower, direction);
            symbolData.keyAreaData[i].candles.push(kac);
        }

        let newTradingAmount = element.volume * getTypicalPrice(element);

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
        symbolData.totalTradingAmount += (element.volume * getTypicalPrice(element));

        symbolData.vwap.push({
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
    buildDataMultipleTimeFrame(symbol, data);
    for (let i = 1; i < symbolData.volumes.length; i++) {
        setColorForVolume(symbolData.candles, symbolData.volumes, i);
    }

    let allCharts = Models.getChartsInAllTimeframes(symbol);
    allCharts[0].volumeSeries.setData(symbolData.volumes);
    allCharts[0].vwapSeries.setData(symbolData.vwap);
    allCharts[0].candleSeries.setData(symbolData.candles);
    for (let i = 0; i < keyAreasToDraw.length; i++) {
        allCharts[0].keyAreaSeriesList[i].setData(symbolData.keyAreaData[i].candles);
    }



    console.log(`symbolData.m5Volumes.length: ${symbolData.m5Volumes.length}`);
    console.log(symbolData.m5Volumes);

    allCharts[1].volumeSeries.setData(symbolData.m5Volumes);
    allCharts[1].candleSeries.setData(symbolData.m5Candles);
    allCharts[2].volumeSeries.setData(symbolData.m15Volumes);
    allCharts[2].candleSeries.setData(symbolData.m15Candles);
    allCharts[3].volumeSeries.setData(symbolData.m30Volumes);
    allCharts[3].candleSeries.setData(symbolData.m30Candles);

    let tradingPlans = TradingPlans.getTradingPlans(symbol);
    let keyLevels = tradingPlans.keyLevels;
    let lastDefenseForLong = [TradingPlans.getLastDefenseForLongInRetracement(symbol)];
    let lastDefenseForShort = [TradingPlans.getLastDefenseForShortInRetracement(symbol)];
    Chart.drawKeyLevels(widget, keyLevels, lastDefenseForLong, lastDefenseForShort);


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
    Chart.onPriceHistoryLoaded(symbol);
};
export const updateFromTimeSaleForHigherTimeFrame = (
    symbol: string, widget: Models.ChartWidget, timesale: Models.TimeSale, timeframe: number, newVwapValue: number) => {
    let timeframeBucket = Helper.numberToDate(timesale.tradeTime);
    timeframeBucket.setSeconds(0, 0);
    timeframeBucket = TimeHelper.roundToTimeFrameBucketTime(timeframeBucket, timeframe);
    let newTime = Helper.jsDateToUTC(timeframeBucket);
    let symbolData = Models.getSymbolData(symbol);
    let lastPrice = timesale.lastPrice ?? 0;
    let lastSize = timesale.lastSize ?? 0;

    let higherTimeFrameCandles = Models.getHigherTimeFrameCandles(symbol, timeframe);
    let lastCandle = higherTimeFrameCandles[higherTimeFrameCandles.length - 1];

    let higherTimeFrameVolumes = Models.getHigherTimeFrameVolumes(symbol, timeframe);
    let lastVolume = higherTimeFrameVolumes[higherTimeFrameVolumes.length - 1];


    if (timeframeBucket < Config.Settings.marketOpenTime) {
        // update pre-market indicators
        // no need to update
    } else {
        // update in-market indicators
        // nothing to update
    }

    let isNewCandleData = true;

    if (newTime == lastCandle.time) {
        isNewCandleData = false;
        // update current candle
        lastVolume.value += lastSize;
        if (timesale.tradeTime && timesale.tradeTime < lastCandle.firstTradeTime) {
            lastCandle.open = lastPrice;
            lastCandle.firstTradeTime = timesale.tradeTime;
            Firestore.logInfo("received out of order timesale " + symbol + ": " + timesale.tradeTime);
        }
        if (lastPrice > lastCandle.high) {
            lastCandle.high = lastPrice;
        } else if (lastPrice < lastCandle.low) {
            lastCandle.low = lastPrice;
        }
        lastCandle.close = lastPrice;
        lastCandle.volume += lastSize;

    } else {
        // moved to a new candle
        // handle newly closed candle
        let newlyClosedCandle = lastCandle;


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
        higherTimeFrameCandles.push(lastCandle);
        lastVolume = {
            time: newTime,
            value: lastSize
        };
        higherTimeFrameVolumes.push(lastVolume);
    }
    //setColorForVolume(symbolData.candles, symbolData.volumes, symbolData.volumes.length - 1);
    let allCharts = Models.getChartsInAllTimeframes(symbol);
    if (timeframe == 5) {
        allCharts[1].volumeSeries.update(lastVolume);
        allCharts[1].candleSeries.update(lastCandle);
    } else if (timeframe == 15) {
        allCharts[2].volumeSeries.update(lastVolume);
        allCharts[2].candleSeries.update(lastCandle);
    } else if (timeframe == 30) {
        allCharts[3].volumeSeries.update(lastVolume);
        allCharts[3].candleSeries.update(lastCandle);
    }
}
export const updateFromTimeSale = (timesale: Models.TimeSale) => {
    let usedTimeframe = Models.getUsedTimeframe();
    let symbol = timesale.symbol;
    let widget = Models.getChartWidget(symbol);
    if (!widget)
        return;

    Chart.updateUI(symbol, "currentPrice", Helper.numberToStringWithPaddingToCents(timesale.lastPrice));

    let timeframeBucket = Helper.numberToDate(timesale.tradeTime);
    timeframeBucket.setSeconds(0, 0);
    timeframeBucket = TimeHelper.roundToTimeFrameBucketTime(timeframeBucket, usedTimeframe);
    let newTime = Helper.jsDateToUTC(timeframeBucket);
    let symbolData = Models.getSymbolData(symbol);
    let lastPrice = timesale.lastPrice ?? 0;
    let lastSize = timesale.lastSize ?? 0;
    if (timesale.tradeTime) {
        let tradeTime = Helper.numberToDate(timesale.tradeTime);
        if (symbolData.lastTradeTime) {
            let diff = tradeTime.getTime() - symbolData.lastTradeTime.getTime();
            symbolData.tradeTimeIntervalInMilliseconds = Math.floor(diff);
            Chart.updateUI(symbol, "tradeInterval", Helper.numberToString(symbolData.tradeTimeIntervalInMilliseconds) + "ms");
        }
        symbolData.lastTradeTime = tradeTime;

        // Track time and sales per second
        let currentSecond = Math.floor(tradeTime.getTime() / 1000);
        let lastEntry = symbolData.timeAndSalesPerSecond[symbolData.timeAndSalesPerSecond.length - 1];
        
        if (lastEntry && lastEntry.second === currentSecond) {
            // Increment count for current second
            lastEntry.count++;
        } else {
            // Add new entry for this second
            symbolData.timeAndSalesPerSecond.push({
                second: currentSecond,
                count: 1
            });
        }

        // Keep only last 3 seconds
        let threeSecondsAgo = currentSecond - 3;
        symbolData.timeAndSalesPerSecond = symbolData.timeAndSalesPerSecond.filter(
            entry => entry.second > threeSecondsAgo
        );

        // Update UI with last 3 seconds count
        let last3SecondsText = symbolData.timeAndSalesPerSecond
            .slice(-3)
            .reverse()
            .map(entry => entry.count)
            .join(',');
            Chart.updateUI(symbol, "timeAndSalesLast3Sec", `(${last3SecondsText})`);
    }

    symbolData.totalVolume += lastSize;
    symbolData.totalTradingAmount += (lastPrice * lastSize);
    let newVwapValue = symbolData.totalTradingAmount / symbolData.totalVolume;
    let lastCandle = symbolData.candles[symbolData.candles.length - 1];
    if (!lastCandle) {
        // sometimes timesales data comes in before chart is loaded.
        return;
    }
    let lastVolume = symbolData.volumes[symbolData.volumes.length - 1];
    let lastVwap = symbolData.vwap[symbolData.vwap.length - 1];
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
            Firestore.logInfo("received out of order timesale " + symbol + ": " + timesale.tradeTime);
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
            let allCharts = Models.getChartsInAllTimeframes(symbol);
            for (let j = 0; j < allCharts.length; j++) {
                addDataAndUpdateChart(newTime, symbolData.keyAreaData, kac, allCharts[j].keyAreaSeriesList[i]);
            }

        }
        Chart.drawIndicatorsForNewlyClosedCandle(
            symbolData.candles.length - 1, symbolData.candles, widget
        );

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
        symbolData.vwap.push(lastVwap);
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
                let openPriceToUse = Models.getOpenPrice(symbol);
                if (openPriceToUse) {
                    setOpenPriceOnChartFromTimeSale(openPriceToUse, newTime, widget);
                }
            }
        }

    }
    //widget.candleSeries.update(lastCandle);

    let volumeText = `${Helper.largeNumberToString(lastVolume.value)} $${Helper.roundToMillion(lastVolume.value * lastPrice)}M`
    Chart.updateUI(symbol, "currentVolume", volumeText);
    setColorForVolume(symbolData.candles, symbolData.volumes, symbolData.volumes.length - 1);
    let allCharts = Models.getChartsInAllTimeframes(symbol);
    allCharts[0].volumeSeries.update(lastVolume);
    allCharts[0].vwapSeries.update(lastVwap);
    allCharts[0].candleSeries.update(lastCandle);

    let position = Models.getPosition(symbol);
    Chart.showLiveR(symbol, position, widget);
    updateChartColor(symbol, widget);
    //console.log(timesale);
    if (timesale.lastPrice && timesale.lastSize) {
        Chart.addToTimeAndSales(widget, timesale.lastPrice, timesale.lastSize);
    }

    AutoTrader.onNewTimeAndSalesData(symbol, lastPrice, isNewCandleData);
    updateFromTimeSaleForHigherTimeFrame(symbol, widget, timesale, 5, newVwapValue);
    updateFromTimeSaleForHigherTimeFrame(symbol, widget, timesale, 15, newVwapValue);
    updateFromTimeSaleForHigherTimeFrame(symbol, widget, timesale, 30, newVwapValue);
};

const setColorForVolume = (candles: Models.CandlePlus[], volumes: Models.LineSeriesData[], currentIndex: number) => {
    if (currentIndex == 0) {
        return;
    }
    if (candles[currentIndex].minutesSinceMarketOpen == 0) {
        return;
    }

    let volume = volumes[currentIndex];
    let previousVolume = volumes[currentIndex - 1];
    if (volume.value > previousVolume.value) {
        if (candles[currentIndex].close > candles[currentIndex].open) {
            volume.color = ChartSettings.lightGreen;
        } else {
            volume.color = ChartSettings.lightRed;
        }
    }
}
export const updateChartColor = (symbol: string, widget: Models.ChartWidget) => {
    let mo = Helper.getSecondsSinceMarketOpen(new Date());
    if (mo <= 0) {
        return;
    }
    let atr = Models.getAtr(symbol);
    let logTags: Models.LogTags = {}
    let enougthAtr = !Rules.isDailyRangeTooSmall(symbol, atr, false, logTags);
    let liquidityScale = Models.getLiquidityScale(symbol);
    // exclude spread rules for chart color
    let allRulesPassed = enougthAtr && liquidityScale > 0; // && !Rules.isSpreadTooLarge(symbol);
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
    widget.openPriceSeries.update({ time: time, value: openPrice });
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

export const getTypicalPrice = (candle: Models.Candle) => {
    /*
    if (candle.vwap > 0) {
        return candle.vwap;
    }*/

    return (candle.high + candle.low + candle.close) / 3;
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

    Chart.updateUI(symbol, "bid", `${symbolData.bidPrice}(${symbolData.bidSize})`);
    Chart.updateUI(symbol, "ask", `${symbolData.askPrice}(${symbolData.askSize})`);
    let spread = Models.getCurrentSpread(symbol);
    spread = Helper.roundPrice(symbol, spread);
    let topPlan = TradingPlans.getTradingPlans(symbol);
    let atr = topPlan.atr.average;
    let spreadInAtr = spread / atr;
    let spreadInATRPercent = spreadInAtr * 100;
    spreadInATRPercent = Math.round(spreadInATRPercent * 100) / 100;
    OrderFlowManager.updateQuote(symbol, symbolData.bidSize, symbolData.askSize, symbolData.bidPrice, symbolData.askPrice, spreadInAtr);

    Chart.updateUI(symbol, "spread", `${spread}, ${spreadInATRPercent}% atr`);
    Chart.updateUI(symbol, "level1QuotePrice", `${symbolData.bidPrice} x ${symbolData.askPrice}`);
    Chart.updateUI(symbol, "level1QuoteSize", `${symbolData.bidSize} x ${symbolData.askSize}`);

    let fullQuote: Models.LevelOneQuote = {
        bidPrice: symbolData.bidPrice,
        askPrice: symbolData.askPrice,
        bidSize: symbolData.bidSize,
        askSize: symbolData.askSize,
    };
    let tradingViewTime = Helper.jsDateToTradingViewUTC(new Date());
    let chartWidget = Models.getChartWidget(symbol);
    if (chartWidget) {
        if (OrderFlowManager.orderSizeIsLarge(symbol, symbolData.bidSize, symbolData.askSize)) {
            Chart.drawLevelOneImbalanceInSideBar(chartWidget, fullQuote);
        }
        Chart.drawLevelOneImbalanceInChart(symbol, chartWidget, fullQuote, tradingViewTime);
    }

    let secondsSinceMarketOpen = Helper.getSecondsSinceMarketOpen(new Date());
    if (GlobalSettings.advancedLevelOneQuoteFeaturesEnabled) {
        if (secondsSinceMarketOpen >= 0 || true) {
            ProxyServer.saveLevelOneQuote(symbol, symbolData.bidPrice, symbolData.bidSize, symbolData.askPrice, symbolData.askSize);
        }
    }
};

export const calculateImbalance = (bidSize: number, askSize: number) => {
    const denom = bidSize + askSize;
    if (denom === 0) {
        return 0; // Avoid division by zero
    }
    let imbalance = (bidSize - askSize) / denom;
    imbalance = Math.round(imbalance * 100) / 100; // Round to two decimal places
    return imbalance;
}

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
    series.update(dataArray.slice(-1)[0]);
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
 * Get time and sales per second data for the last 3 seconds
 * @param symbol - The stock symbol
 * @returns Array of time and sales data per second
 */
export const getTimeAndSalesPerSecond = (symbol: string): Models.TimeAndSalesPerSecond[] => {
    let symbolData = Models.getSymbolData(symbol);
    return symbolData.timeAndSalesPerSecond;
}

/**
 * Get total count of time and sales in the last 3 seconds
 * @param symbol - The stock symbol
 * @returns Total count
 */
export const getTimeAndSalesLast3SecondsTotal = (symbol: string): number => {
    let symbolData = Models.getSymbolData(symbol);
    return symbolData.timeAndSalesPerSecond.reduce((total, entry) => total + entry.count, 0);
}