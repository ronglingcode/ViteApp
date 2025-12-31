import * as RiskManager from '../algorithms/riskManager';

import * as Helper from '../utils/helper';
import * as Models from '../models/models';
import * as CandleModels from '../models/CandleModels';
import * as TradingState from '../models/tradingState';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Firestore from '../firestore';
import * as Broker from '../api/broker';
import * as LightweightCharts from 'sunrise-tv-lightweight-charts';
import * as ChartSettings from '../ui/chartSettings';
import * as AutoTrader from '../algorithms/autoTrader';
import * as TakeProfit from '../algorithms/takeProfit';
import * as EntryHandler from '../controllers/entryHandler';
import * as Handler from '../controllers/handler';
import * as TradebooksManager from '../tradebooks/tradebooksManager';
import type { Tradebook } from '../tradebooks/baseTradebook';
import * as OrderFlowManager from '../controllers/orderFlowManager';
import * as Patterns from '../algorithms/patterns';
import * as Calculator from '../utils/calculator';
import * as DB from '../data/db';
import * as TimeHelper from '../utils/timeHelper';
import * as TraderFocus from '../controllers/traderFocus';
import * as QuestionPopup from './questionPopup';
declare let window: Models.MyWindow;

export const setup = () => {
    let watchlist = window.HybridApp.Watchlist;
    if (!watchlist)
        return;

    for (let i = 0; i < watchlist.length; i++) {
        let symbol = watchlist[i].symbol;
        let chart = createChartWidget(i, watchlist[i], watchlist.length);
        let container = document.getElementById("chartContainer" + i);
        if (container) {
            container.style.display = 'block';
        }
        Models.setChartWidget(symbol, chart);
    }
};
export const onPriceHistoryLoaded = (symbol: string) => {
    TradebooksManager.updateTradebooksStatusHighLevelCall(symbol);
}

const createTimeFrameChart = (timeframe: number, htmlElement: HTMLElement, tabIndex: number, totalCount: number,
    keyAreasToDraw: Models.KeyAreaToDraw[], chartState: Models.ChartState
) => {
    let lwChart = LightweightCharts.createChart(
        htmlElement,
        ChartSettings.getChartSettings(tabIndex, totalCount)
    );
    let timeframeChart: Models.TimeFrameChart = {
        timeframe: timeframe,
        chart: lwChart,
        volumeSeries: lwChart.addHistogramSeries(ChartSettings.volumeSeriesSettings),
        candleSeries: lwChart.addCandlestickSeries(ChartSettings.candlestickSeriesSettings),
        keyAreaSeriesList: [],
        vwapSeries: lwChart.addLineSeries(ChartSettings.vwapSettings),
        markers: [],
        tradeMarkers: [],
        tradeManagementLevels: [],
        momentumLevels: [],
    };
    if (timeframe == 1) {
        timeframeChart.ma5Series = lwChart.addLineSeries(ChartSettings.ma5Settings);
        timeframeChart.ma9Series = lwChart.addLineSeries(ChartSettings.ma9Settings);
    }
    for (let i = 0; i < keyAreasToDraw.length; i++) {
        timeframeChart.keyAreaSeriesList.push(timeframeChart.chart.addCandlestickSeries(ChartSettings.keyAreaCandleSettings));
    }

    function myCrosshairMoveHandler(param: any) {
        if (!param.point) {
            return;
        }
        let price = timeframeChart.candleSeries.coordinateToPrice(param.point.y);
        if (price) {
            chartState.crosshairPrice = price;
        }
        if (param.seriesData) {
            //updateHoveredCandle(param.seriesData, myWidget);
            //updateToolTip(param.seriesData, myWidget);
        }
    }

    timeframeChart.chart.subscribeCrosshairMove(myCrosshairMoveHandler);

    return timeframeChart;
};

export const createChartWidget = (tabIndex: number, watchlistItem: Models.WatchlistItem, totalCount: number) => {
    let symbol = watchlistItem.symbol;
    let { htmlContents, tradebooksMap } = getHtmlContentsAndTradebooks(symbol, tabIndex);
    let keyAreasToDraw = TradingPlans.getKeyAreasToDraw(symbol);
    let chartState: Models.ChartState = {
        crosshairPrice: 0,
        hiddenAnswer: ""
    };
    let timeframeChartM1 = createTimeFrameChart(
        1, htmlContents.chartM1, tabIndex, totalCount, keyAreasToDraw, chartState);
    let timeframeChartM5 = createTimeFrameChart(
        5, htmlContents.chartM5, tabIndex, totalCount, keyAreasToDraw, chartState);
    let timeframeChartM15 = createTimeFrameChart(
        15, htmlContents.chartM15, tabIndex, totalCount, keyAreasToDraw, chartState);
    let timeframeChartM30 = createTimeFrameChart(
        30, htmlContents.chartM30, tabIndex, totalCount, keyAreasToDraw, chartState);

    let myWidget: Models.ChartWidget = {
        symbol: symbol,
        chartState: chartState,
        tabIndex: tabIndex,
        isDark: true,
        stock: watchlistItem,
        htmlContents: htmlContents,
        chartM1: timeframeChartM1.chart,
        chartM5: timeframeChartM5.chart,
        chartM15: timeframeChartM15.chart,
        chartM30: timeframeChartM30.chart,
        timeframeChartM1: timeframeChartM1,
        timeframeChartM5: timeframeChartM5,
        timeframeChartM15: timeframeChartM15,
        timeframeChartM30: timeframeChartM30,
        candleSeries: timeframeChartM1.candleSeries,
        openPriceSeries: timeframeChartM1.chart.addLineSeries(ChartSettings.openPriceSettings),
        entryOrders: [],
        entryOrdersPriceLines: [],
        exitOrderPairs: [],
        exitOrdersPriceLines: [],
        profitRatios: [],
        initialQuantity: 0,
        initialCost: 0,
        initialStopPrice: 0,
        tradebooks: tradebooksMap,
        redToGreenState: {
            hasReversalForLong: false,
            hasReversalForShort: false,
        },
    };

    /*
        function myClickHandler(param) {
            console.log(param)
            if (!param.point) {
                return;
            }
            let crosshairPrice = Chart.getCrossHairPrice(symbol);
            drawStopLoss(symbol, crosshairPrice);
        }
    
        widget.chart.subscribeClick(myClickHandler);
    */
    myWidget.htmlContents.chartM1.addEventListener('contextmenu', event => {
        event.preventDefault();
        let crosshairPrice = getCrossHairPrice(symbol);
        if (crosshairPrice) {
            drawEntry(symbol, crosshairPrice);
        }
    });
    /*
    if (Config.getProfileSettingsForSymbol(symbol).allowTighterStop) {
        myWidget.htmlContents.chart.addEventListener('dblclick', event => {
            let crosshairPrice = getCrossHairPrice(symbol);
            if (crosshairPrice)
                drawStopLoss(symbol, crosshairPrice);
        });
    }*/

    myWidget.htmlContents.container.addEventListener('mouseover', function (mouseEvent) {
        let watchlist = Models.getWatchlist();
        for (let i = 0; i < watchlist.length; i++) {
            let element = document.getElementById("chartContainer" + i);
            if (!element)
                continue;
            if (i === myWidget.tabIndex) {
                element.classList.add("active");
                window.HybridApp.UIState.activeSymbol = myWidget.stock.symbol;
                window.HybridApp.UIState.activeTabIndex = myWidget.tabIndex;
                myWidget.htmlContents.container.focus();
                // Update flowchart display when symbol changes
                if (window.HybridApp.UI && window.HybridApp.UI.Flowchart && window.HybridApp.UI.Flowchart.updateFlowchartDisplay) {
                    window.HybridApp.UI.Flowchart.updateFlowchartDisplay(myWidget.stock.symbol);
                }
            } else {
                element.classList.remove("active");
            }
        }
    });

    myWidget.htmlContents.container.addEventListener("blur", function (event) {
        //console.log('blur');
        console.log(event);
    });

    return myWidget;
};
const updateToolTip = (data: any, widget: Models.ChartWidget) => {
    const [firstValue] = data.values();
    if (!firstValue)
        return;
    let c = firstValue;
    let container = widget.htmlContents.currentCandle;
    let symbol = widget.stock.symbol;
    container.open.innerText = `O: ${Helper.roundPrice(symbol, c.open)}`;
    container.high.innerText = `H: ${Helper.roundPrice(symbol, c.high)}`;
    container.low.innerText = `L: ${Helper.roundPrice(symbol, c.low)}`;
    container.close.innerText = `C: ${Helper.roundPrice(symbol, c.close)}`;
};
export const getHoveredCandle = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (widget) {
        return widget.currentCandle;
    }
}
const updateHoveredCandle = (data: any, widget: Models.ChartWidget) => {
    const [firstValue] = data.values();
    if (!firstValue)
        return;
    let c = firstValue;
    widget.currentCandle = c;
}
const getHtmlContentsAndTradebooks = (symbol: string, tabIndex: number) => {
    let container = document.getElementById("chartContainer" + tabIndex) as HTMLElement;
    let chart = document.getElementById("chart" + tabIndex) as HTMLElement;
    let chartM5 = document.getElementById("chart" + tabIndex + "M5") as HTMLElement;
    let chartM15 = document.getElementById("chart" + tabIndex + "M15") as HTMLElement;
    let chartM30 = document.getElementById("chart" + tabIndex + "M30") as HTMLElement;
    let popupWindow = document.getElementById("chart" + tabIndex + "popup") as HTMLElement;
    let quizButton = popupWindow.getElementsByTagName("button")[0] as HTMLElement;
    quizButton.addEventListener("click", () => {
        QuestionPopup.checkAnswer(symbol);
    });
    let answerHtml = popupWindow.getElementsByClassName("answer")[0] as HTMLInputElement;
    answerHtml.addEventListener('keydown', (event) => {
        event.stopPropagation();
        event.stopImmediatePropagation();
    });
    answerHtml.addEventListener('keyup', (event) => {
        event.stopPropagation();
        event.stopImmediatePropagation();
    });
    answerHtml.addEventListener('keypress', (event) => {
        event.stopPropagation();
        event.stopImmediatePropagation();
    });

    let currentCandleContainer = container.getElementsByClassName("currentCandle")[0] as HTMLElement;
    let quantityBarContainer = container.getElementsByClassName("quantityBar")[0] as HTMLElement;
    let exitButtonsContainer = container.getElementsByClassName("exitButtons")[0] as HTMLElement;
    let timeframeButtonsContainer = container.getElementsByClassName("timeframebuttons")[0] as HTMLElement;
    let tradingPlans = container.getElementsByClassName("tradingPlans")[0] as HTMLElement;
    let sideBar = container.getElementsByClassName("sideBar")[0] as HTMLElement;
    let tradebookButtons = sideBar.getElementsByClassName("tradebookButtons")[0] as HTMLElement;
    let level1QuotePrice = sideBar.getElementsByClassName("level1QuotePrice")[0] as HTMLElement;
    let level1QuoteSize = sideBar.getElementsByClassName("level1QuoteSize")[0] as HTMLElement;
    let level1QuoteLargeOrders = sideBar.getElementsByClassName("level1QuoteLargeOrders")[0] as HTMLElement;
    let timeAndSales = sideBar.getElementsByClassName("timeAndSales")[0] as HTMLElement;
    let htmlContents: Models.ChartWidgetHtmlContents = {
        chartM1: chart,
        chartM5: chartM5,
        chartM15: chartM15,
        chartM30: chartM30,
        symbol: document.getElementById("symbol" + tabIndex) as HTMLElement,
        container: container,
        positionCount: container.getElementsByClassName("positionCount")[0],
        popupWindow: popupWindow,
        exitOrders: container.getElementsByClassName("exitOrders")[0] as HTMLElement,
        exitButtonsContainer: exitButtonsContainer,
        timeframeButtonsContainer: timeframeButtonsContainer,
        currentCandle: {
            open: currentCandleContainer.getElementsByClassName("ohlc_o")[0] as HTMLElement,
            high: currentCandleContainer.getElementsByClassName("ohlc_h")[0] as HTMLElement,
            low: currentCandleContainer.getElementsByClassName("ohlc_l")[0] as HTMLElement,
            close: currentCandleContainer.getElementsByClassName("ohlc_c")[0] as HTMLElement,
        },
        quantityElements: {
            input: quantityBarContainer.getElementsByTagName("input")[0] as HTMLInputElement,
            largeOrderInput: quantityBarContainer.getElementsByTagName("input")[1] as HTMLInputElement,
            percentageButton: quantityBarContainer.getElementsByTagName("button")[0] as HTMLElement,
            fixedQuantityButton: quantityBarContainer.getElementsByTagName("button")[1] as HTMLElement,
        },
        tradingPlans: {
            long: tradingPlans.getElementsByClassName("tradingPlansLong")[0] as HTMLElement,
            short: tradingPlans.getElementsByClassName("tradingPlansShort")[0] as HTMLElement,
        },
        sideBar: sideBar,
        tradebookButtons: tradebookButtons,
        level1QuotePrice: level1QuotePrice,
        level1QuoteSize: level1QuoteSize,
        level1QuoteLargeOrders: level1QuoteLargeOrders,
        timeAndSales: timeAndSales,
    };
    //widget.htmlContents.quantityBar = widget.htmlContents.container.getElementsByClassName("quantityBar")[0];
    //widget.htmlContents.quantityInput = widget.htmlContents.quantityBar.getElementsByTagName("input")[0];
    setupQuantityBar(symbol, htmlContents.quantityElements);

    let tradebooksMap = setupTradingPlans(symbol, htmlContents.tradingPlans, htmlContents.tradebookButtons);
    setupExitButtons(symbol, htmlContents.exitButtonsContainer);
    setupTimeframeButtons(htmlContents.timeframeButtonsContainer, symbol);
    let refreshButton = htmlContents.container.getElementsByClassName("refresh")[0] as HTMLElement;
    refreshButton.addEventListener("click", (pointerEvent) => {
        Firestore.logInfo(`refresh for ${symbol}`);
        let logTags: Models.LogTags = {
            symbol: symbol,
            logSessionName: 'refresh-entry-stop-loss'
        };
        AutoTrader.refreshEntryStopLossForSymbol(symbol, logTags);
    });
    htmlContents.symbol.innerText = symbol;
    return { htmlContents, tradebooksMap };
};

const setupTimeframeButtons = (container: HTMLElement, symbol: string) => {
    let children = container.getElementsByTagName("span");
    let timeframes = [1, 5, 15, 30];
    if (children.length > 0) {
        for (let i = 0; i < children.length; i++) {
            let timeframeButton = children[i];
            timeframeButton.addEventListener("click", (pointerEvent) => {
                showChartForTimeframe(symbol, timeframes[i]);
            });
        }
    }
}
export const showChartForTimeframe = (symbol: string, timeframe: number) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget)
        return;
    let buttons = widget.htmlContents.timeframeButtonsContainer.getElementsByTagName("span");
    let charts = Models.getChartsHtmlInAllTimeframes(symbol);
    for (let j = 0; j < charts.length; j++) {
        charts[j].style.display = 'none';
        buttons[j].style.backgroundColor = '';
    }
    if (timeframe == 1) {
        charts[0].style.display = 'block';
        buttons[0].style.backgroundColor = 'lightblue';
    } else if (timeframe == 5) {
        charts[1].style.display = 'block';
        buttons[1].style.backgroundColor = 'lightblue';
    } else if (timeframe == 15) {
        charts[2].style.display = 'block';
        buttons[2].style.backgroundColor = 'lightblue';
    } else {
        charts[3].style.display = 'block';
        buttons[3].style.backgroundColor = 'lightblue';
    }
}

const setupExitButtons = (symbol: string, container: HTMLElement) => {
    let children = container.getElementsByTagName("span");
    if (children.length > 0) {
        let resetOne = children[0];
        resetOne.addEventListener("click", (pointerEvent) => {
            Firestore.logInfo(`reset for 1`);
            Handler.resetStop(symbol, true);
        });
        let resetAll = children[1];
        resetAll.addEventListener("click", (pointerEvent) => {
            Firestore.logInfo(`reset for all`);
            Handler.resetStop(symbol, false);
        });
        for (let i = 2; i < children.length; i++) {
            let child = children[i];
            child.addEventListener("click", (pointerEvent) => {
                let sender = pointerEvent.target as HTMLElement;
                let buttonText = sender.innerText;
                let parts = buttonText.split(' ');
                let timeframe = parseInt(parts[1]);
                Firestore.logInfo(`${buttonText} clicked for ${timeframe}`);
                if (buttonText.endsWith("all")) {
                    Handler.trailStopAll(symbol, timeframe);
                } else {
                    Handler.trailStop(symbol, timeframe, false);
                }
            });
        }
    }
}


const setupQuantityBar = (symbol: string, quantityElements: Models.QuantityElements) => {
    let input = quantityElements.input;
    input.addEventListener("keydown", function (e) {
        e.stopPropagation();
    });
    let p = TradingPlans.getTradingPlans(symbol);
    let buttons = [
        quantityElements.percentageButton,

    ];
    if (p.fixedQuantity) {
        buttons.push(quantityElements.fixedQuantityButton)
        buttons[1].innerText = `${p.fixedQuantity}`;
    }

    for (let i = 0; i < buttons.length; i++) {
        let button = buttons[i];
        button.addEventListener("click", (pointerEvent) => {
            if (pointerEvent && pointerEvent.target) {
                let t = pointerEvent.target as HTMLElement;
                input.value = t.innerText;
            }
        });
    }
};

/**
 * First check any drawn stop level if allow chart drawing, 
 * then use any preset stop level passed in,
 * last use high/low of the day
 */
export const getStopLossPrice = (symbol: string, isLong: boolean, allowChartDrawing: boolean, presetStopOutPrice: number | null) => {
    let p = 0;
    if (allowChartDrawing) {
        let widget = Models.getChartWidget(symbol);
        if (!widget)
            return 0;
        if (widget.stopLossPriceLine) {
            p = widget.stopLossPriceLine.options().price;
            if (p != 0)
                return roundStopLossPrice(symbol, isLong, p);
        }
    }
    if (presetStopOutPrice) {
        p = presetStopOutPrice;
        return roundStopLossPrice(symbol, isLong, p);
    }

    let isFutures = Helper.isFutures(symbol);
    if (isLong) {
        p = Models.getLowestPrice(symbol, isFutures);
    } else {
        p = Models.getHighestPrice(symbol, isFutures);
    }
    return roundStopLossPrice(symbol, isLong, p);
};

const roundStopLossPrice = (symbol: string, isLong: boolean, p: number) => {
    if (isLong) {
        return Helper.roundToCentsOrOz(symbol, p, false);
    } else {
        return Helper.roundToCentsOrOz(symbol, p, true);
    }
};
export const hasCustomEntryPrice = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget)
        return false;
    if (widget.entryPriceLine) {
        return true;
    } else {
        return false;
    }
}
/**
 * If market order, return current price.
 * If entry price drawn, use entry price drawn on the chart.
 * If not drawn, use high/low of the day, 
 * unless useFirstNewHigh is true, use first new high within first 5 minutes.
 */
export const getBreakoutEntryPrice = (symbol: string, isLong: boolean, marketOrder: boolean, entryParameters: Models.TradebookEntryParameters) => {
    // 
    if (marketOrder) {
        return Models.getCurrentPrice(symbol);
    }
    let p = 0;
    let widget = Models.getChartWidget(symbol);
    if (!widget)
        return 0;
    if (widget.entryPriceLine) {
        p = widget.entryPriceLine.options().price;
    } else {
        let symbolData = Models.getSymbolData(symbol);
        if (isLong) {
            p = symbolData.highOfDay;
        } else {
            p = symbolData.lowOfDay;
        }
        if (entryParameters.useFirstNewHigh) {
            let newHigh = Patterns.getFirstNewHighInFirstFiveMinutes(symbol, isLong);
            if (newHigh) {
                p = newHigh;
            }
        } else if (entryParameters.useCurrentCandleHigh) {
            let currentCandle = CandleModels.getCurrentCandle(symbol);
            if (currentCandle) {
                p = isLong ? currentCandle.high : currentCandle.low;
            }
        }
    }
    if (isLong) {
        return Helper.roundToCentsOrOz(symbol, p, true);
    } else {
        return Helper.roundToCentsOrOz(symbol, p, false);
    }
};

export const getMultiplier = (symbol: string) => {
    return 1;
    /*
    let qty = widget.htmlContents.quantityInput.value;
    if (!qty || !qty.endsWith("%")) {
        return 1;
    }
    let multiplier = parseFloat(qty.substring(0, qty.length - 1));
    return multiplier / 100;*/
};


export const addToQuoteBar = (symbol: string, classname: string, quotes: Models.LevelOneQuote[]) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    let container = widget.htmlContents.container;
    let quoteBar = container.getElementsByClassName(classname)[0] as HTMLElement;
    quoteBar.innerHTML = '';
    let atr = Models.getAtr(symbol).average;
    for (let i = quotes.length - 1; i >= 0; i--) {
        let quote = quotes[i];
        let spread = quote.askPrice - quote.bidPrice;
        let spreadString = Calculator.getPercentageString(spread, atr, 1);
        let li = document.createElement("div");
        li.innerText = `${spreadString} ${quote.bidSize}x${quote.askSize}`;
        let spreadStatus = OrderFlowManager.isSingleSpreadTooLarge(spread, atr);
        if (spreadStatus == "too large") {
            li.style.color = 'red';
        } else if (spreadStatus == "quite large") {
            li.style.color = 'brown';
        }
        quoteBar.appendChild(li);
    }
}
export const addToTimeAndSalesOld = (widget: Models.ChartWidget, lastPrice: number, lastSize: number) => {
    let target = widget.htmlContents.timeAndSales;
    let li = document.createElement("div");
    li.innerText = `${lastPrice} ${lastSize}`;
    if (!target.firstChild) {
        target.appendChild(li);
    } else {
        target.insertBefore(li, target.firstChild);
    }
    target.insertBefore(li, target.firstChild);
    while (target.children.length > 4) {
        let lastChild = target.lastChild;
        lastChild?.remove();
    }
}
export const addToTimeAndSales = (
    symbol: string, classname: string, shouldFilter: boolean, record: Models.TimeSale
) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    let container = widget.htmlContents.container;
    let classnameForUnfiltered = `${classname}Unfiltered`;
    let classnameForFiltered = `${classname}Filtered`;
    if (!shouldFilter) {
        addToTimeAndSalesSection(true, classnameForFiltered, container, record);
    } else {
        addToTimeAndSalesSection(false, classnameForUnfiltered, container, record);
    }
    let classnameForSequence = `${classname}Sequence`;
    let sequenceContainer = container.getElementsByClassName(classnameForSequence)[0] as HTMLElement;
    if (sequenceContainer)
        sequenceContainer.innerText = `${record.rawTimestamp ?? ''}`;
}
const addToTimeAndSalesSection = (filtered: boolean, classnameToUse: string, container: HTMLElement, record: Models.TimeSale) => {
    let parent = container.getElementsByClassName(classnameToUse)[0] as HTMLElement;
    let li = document.createElement("div");
    if (!filtered) {
        li.innerText = `${record.lastPrice ?? 0}x${record.lastSize ?? 0},${record.conditions.join(',')}`;
    } else {
        li.innerText = `${record.lastPrice ?? 0}x${record.lastSize ?? 0}`;
    }
    if (!parent.firstChild) {
        parent.appendChild(li);
    } else {
        parent.insertBefore(li, parent.firstChild);
    }
    while (parent.children.length > 10) {
        let lastChild = parent.lastChild;
        lastChild?.remove();
    }
}

export const addToListView = (widget: Models.ChartWidget, text: string) => {
    let target = widget.htmlContents.level1QuoteLargeOrders;
    let li = document.createElement("div");
    li.innerText = text;
    if (!target.firstChild) {
        target.appendChild(li);
    } else {
        target.insertBefore(li, target.firstChild);
    }
    while (target.children.length > 5) {
        let lastChild = target.lastChild;
        lastChild?.remove();
    }
};
export const drawOrderExecutions = (symbol: string, widget: Models.ChartWidget) => {
    if (!window.HybridApp.AccountCache)
        return;
    let trades = window.HybridApp.AccountCache.trades.get(symbol);
    if (!trades)
        return;
    let executions = flattenTrades(trades);
    let allCharts = Models.getChartsInAllTimeframes(symbol);
    allCharts.forEach(chart => {
        drawOrderExecutionsForTimeframe(chart, executions);
    });
}
export const drawOrderExecutionsForTimeframe = (timeframeChart: Models.TimeFrameChart, executions: Models.OrderExecution[]) => {
    timeframeChart.tradeMarkers = [];
    let usedTimeframe = timeframeChart.timeframe;
    executions.forEach(execution => {
        let color = execution.isBuy ? '#2e7d32' : 'darkred';
        let timeInBucket = TimeHelper.roundToTimeFrameBucketTime(Helper.tvTimestampToLocalJsDate(execution.tradingViewTime), usedTimeframe);
        let marker: LightweightCharts.SeriesMarker<LightweightCharts.UTCTimestamp> = {
            time: Helper.jsDateToUTC(timeInBucket),
            position: 'atPrice',
            color: color,
            shape: 'circle',
            text: `${execution.price}`,
            //price: 3815,
            size: 0.1,
        };
        timeframeChart.tradeMarkers.push(marker);
    });
    showMarkers(timeframeChart);
};

const showMarkers = (timeframeChart: Models.TimeFrameChart) => {
    let allMarkers = timeframeChart.markers.concat(timeframeChart.tradeMarkers);
    if (timeframeChart.liveRMarker) {
        allMarkers.push(timeframeChart.liveRMarker);
    }
    allMarkers.sort(function (a, b) {
        return a.time - b.time;
    });

    // this line causes error
    if (timeframeChart.timeframe == 1) {
        timeframeChart.candleSeries.setMarkers(allMarkers);
    } else {
        timeframeChart.candleSeries.setMarkers(allMarkers);
    }
};

const flattenTrades = (trades: Models.TradeExecution[]) => {
    let executions: Models.OrderExecution[] = [];
    trades.forEach(trade => {
        executions.push(...trade.entries);
        executions.push(...trade.exits);
    });
    return executions;
};

export const createDrawingOrder = (symbol: string, order: Models.OrderModel | undefined,
    entryPrice: number, stopOutPrice: number | undefined) => {
    if (!order) {
        return null;
    }
    let price = order.price ?? 0;
    let isBuyOrder = order.isBuy;
    let color = isBuyOrder ? 'green' : 'red';
    let q = Math.abs(order.quantity);
    let isLongPosition = !isBuyOrder;
    if (!order.positionEffectIsOpen) {
        isLongPosition = !isBuyOrder;
    } else {
        isLongPosition = isBuyOrder;
    }
    let riskMultiples = getRiskMultiplesForDisplay(symbol, isLongPosition, entryPrice, stopOutPrice, q);
    let result: Models.ExitOrderToDraw = {
        price: price,
        label: "",
        sequenceNumber: 0,
        legNumber: 0,
        color: color,
        isBuyOrder: isBuyOrder,
        orderType: order.orderType,
        q: q,
        riskMultiples: riskMultiples,
        orderData: order
    };
    return result;
};

const groupExitOrdersByPrice = (orders: Models.ExitOrderToDraw[]) => {
    let map = new Map<number, Models.ExitOrderToDraw[]>();
    for (let i = 0; i < orders.length; i++) {
        let o = orders[i];
        let entry = map.get(o.price);
        if (entry) {
            entry.push(o);
        } else {
            map.set(o.price, [o]);
        }
    }
    let result: Models.ExitOrderToDraw[] = [];
    map.forEach((orders, price) => {
        const groupedOrder = combineExitOrdersByLegNumber(orders);
        result.push(groupedOrder);

    });
    return result;
};

const combineExitOrdersByLegNumber = (orders: Models.ExitOrderToDraw[]) => {
    let legNumberMap = new Map<number, Models.ExitOrderToDraw[]>();
    for (let i = 0; i < orders.length; i++) {
        let currentLegNumber = orders[i].legNumber;
        let currentLegNumberEntry = legNumberMap.get(currentLegNumber);
        if (currentLegNumberEntry) {
            currentLegNumberEntry.push(orders[i]);
        } else {
            legNumberMap.set(currentLegNumber, [orders[i]]);
        }
    }
    let text = "";
    legNumberMap.forEach((subOrders, legNumber) => {
        if (legNumber == 1) {
            text += `Leg1 M1:`;
        } else if (legNumber == 2) {
            text += `Leg2 M5:`;
        } else if (legNumber == 3) {
            text += `Leg3 M15:`;
        }

        for (let i = 0; i < subOrders.length; i++) {
            text += `${subOrders[i].sequenceNumber},`;
        }
    });
    let result: Models.ExitOrderToDraw = {
        ...orders[0],
        label: text,
    };
    return result;

}

const getRiskMultiplesForDisplay = (symbol: string, isLongPosition: boolean,
    entryPrice: number, stopOutPrice: number | undefined, quantity: number) => {
    let riskPerShare = getRiskPerShare(symbol, isLongPosition, entryPrice, stopOutPrice);
    // consider premarket positions
    let riskMultiples = RiskManager.quantityToRiskMultiples(riskPerShare, quantity);
    let display = riskMultiples * 100;
    return Math.round(display * 10) / 10
};

const getRiskPerShare = (symbol: string, isLong: boolean,
    entry: number, stopOut: number | undefined) => {
    if (stopOut) {
        return RiskManager.getRiskPerShare(symbol, entry, stopOut);
    }
    let symbolData = Models.getSymbolData(symbol);
    if (isLong) {
        return RiskManager.getRiskPerShare(symbol, entry, symbolData.lowOfDay);
    } else {
        return RiskManager.getRiskPerShare(symbol, entry, symbolData.highOfDay);
    }
}

export const updateAccountUIStatus = async (symbolList: string[], source: string) => {
    let done = await Broker.syncAccount(source);
    if (done) {
        if (!symbolList || symbolList.length == 0) {
            let wl = Models.getWatchlist();
            wl.forEach(element => {
                updateAccountUIStatusForSymbol(element.symbol);
            });
        } else {
            symbolList.forEach(symbol => {
                updateAccountUIStatusForSymbol(symbol);
            });
        }
        TraderFocus.updateTradeManagementUI();
    }
};

export const updateAccountUIStatusForSymbol = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    let cache = window.HybridApp.AccountCache;

    let position = cache?.positions.get(symbol);
    drawFilledPrice(position, widget);
    drawTradeManagementInChart(symbol, position, widget);
    let riskMultiple = showPositionSize(symbol, position, widget);
    drawProfitRatio(symbol, position, widget, riskMultiple);
    drawWorkingOrders(symbol, position, widget);
    drawOrderExecutions(symbol, widget);
    //drawMomentumLevels(widget);
    //AutoTrader.onAccountDataRefresh(symbol);
};
const drawTradeManagementInChart = (symbol: string, position: Models.Position | undefined, widget: Models.ChartWidget) => {
    if (!position) {
        return;
    }
    let isLong = position.netQuantity > 0;
    // clear previous lines
    let allCharts = Models.getChartsInAllTimeframes(symbol);
    allCharts.forEach(chart => {
        for (let i = 0; chart.tradeManagementLevels.length > i; i++) {
            let l = chart.tradeManagementLevels[i];
            chart.candleSeries.removePriceLine(l);
        }
        chart.tradeManagementLevels = [];
    });

    let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
    let tradebookID = breakoutTradeState.submitEntryResult.tradeBookID;
    let tradebook = TradebooksManager.getTradebookByID(symbol, tradebookID);
    if (!tradebook) {
        return;
    }
    let tighstopLevels = tradebook.getTightStopLevels();
    tighstopLevels.forEach(level => {
        allCharts.forEach(chart => {
            let line = createPriceLine(chart.candleSeries, level.level, level.title, "purple", null, false, "solid");
            chart.tradeManagementLevels.push(line);
        });
    });
    // draw final target
    let finalTargets = TradingPlans.calculateTargets(symbol, isLong);
    TradingPlans.populateTargetsLabels(symbol, finalTargets);
    finalTargets.forEach(target => {
        allCharts.forEach(chart => {
            let line = createPriceLine(chart.candleSeries, target.level, target.label ?? "", "black", null, false, "solid");
            chart.tradeManagementLevels.push(line);
        });
    });
}

const drawProfitRatio = (symbol: string, position: Models.Position | undefined,
    widget: Models.ChartWidget, riskMultiple: number) => {
    if (!position) {
        clearProfitRatio(widget);
        return;
    }

    let price = Models.getAveragePrice(symbol);
    let currentQuantity = Models.getPositionNetQuantity(symbol);
    currentQuantity = Math.abs(currentQuantity);
    let isLong = position.netQuantity > 0;
    let atr = Models.getAtr(symbol).average;
    let symbolData = Models.getSymbolData(symbol);
    let hod = symbolData.highOfDay;
    let lod = symbolData.lowOfDay;
    let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
    let initialRiskLevel = breakoutTradeState.riskLevel;
    // quantity increased, redraw everything
    if (currentQuantity > widget.initialQuantity) {
        clearProfitRatio(widget);
        widget.initialQuantity = currentQuantity;
        TradingState.updatePeakRisk(symbol, riskMultiple);
        widget.initialCost = price;
        widget.initialStopPrice = Models.getFarthestStopOrderPrice(symbol);

        let direction = isLong ? 1 : -1;
        let risk = Math.abs(initialRiskLevel - price);
        let targetRatios = [1, 2, 3];
        targetRatios.forEach(ratio => {
            let target = price + direction * risk * ratio;
            target = Helper.roundPrice(symbol, target);
            let l = createPriceLine(widget.candleSeries, target, `${ratio}R`, "black", null, false, "solid");
            widget.profitRatios.push(l);
        });
    }
};

const clearProfitRatio = (widget: Models.ChartWidget) => {
    if (widget.profitRatios && widget.profitRatios.length > 0) {
        widget.profitRatios.forEach(l => {
            widget.candleSeries.removePriceLine(l);
        });
    }
    widget.profitRatios = [];
    widget.initialQuantity = 0;
};
export const drawMaxEntry = (symbol: string, maxEntry: number) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    clearMaxEntry(symbol);
    let m1Chart = widget.timeframeChartM1;
    m1Chart.maxEntryLine = createPriceLine(m1Chart.candleSeries, maxEntry, "Max Entry", "black", null, false, "solid");
}
export const clearMaxEntry = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    let m1Chart = widget.timeframeChartM1;
    if (m1Chart.maxEntryLine) {
        m1Chart.candleSeries.removePriceLine(m1Chart.maxEntryLine);
    }
    m1Chart.maxEntryLine = undefined;
}

const drawFilledPrice = async (position: Models.Position | undefined, widget: Models.ChartWidget) => {
    if (!position) {
        clearFilledPrice(widget);
        return;
    }

    let allCharts = Models.getChartsInAllTimeframes(widget.symbol);
    allCharts.forEach(chart => {
        drawFilledPriceForTimeframe(position, chart);
    });
};

export const drawFilledPriceForTimeframe = (position: Models.Position, timeframeChart: Models.TimeFrameChart) => {
    let newPrice = position.averagePrice;
    let oldPrice = timeframeChart.filledPriceLine?.options().price;
    if (newPrice != oldPrice) {
        clearFilledPriceForTimeframe(timeframeChart);
        timeframeChart.filledPriceLine = createPriceLine(timeframeChart.candleSeries, newPrice, "Filled", "black", null, false, "solid");
    }
}
const clearFilledPrice = (widget: Models.ChartWidget) => {
    let allCharts = Models.getChartsInAllTimeframes(widget.symbol);
    allCharts.forEach(chart => {
        clearFilledPriceForTimeframe(chart);
    });
};
export const clearFilledPriceForTimeframe = (timeframeChart: Models.TimeFrameChart) => {
    if (timeframeChart.filledPriceLine) {
        timeframeChart.candleSeries.removePriceLine(timeframeChart.filledPriceLine);
        timeframeChart.filledPriceLine = undefined;
    }
};
export const showToolTips = (symbol: string, text: string) => {
    let netQuantity = Models.getPositionNetQuantity(symbol);
    let isLong = netQuantity >= 0;
    let markerPosition: LightweightCharts.SeriesMarkerPosition = isLong ? 'aboveBar' : 'belowBar';
    let allCharts = Models.getChartsInAllTimeframes(symbol);
    let currentCandle = Models.getCurrentCandle(symbol);
    allCharts.forEach(chart => {
        chart.liveRMarker = {
            time: currentCandle.time,
            position: markerPosition,
            color: 'black',
            shape: 'circle',
            text: text,
            size: 0.1,
        };
    });

}
export const showLiveR = (symbol: string, position: Models.Position | undefined, widget: Models.ChartWidget) => {
    return;
    /*
    if (!position) {
        return;
    }
    let currentProfitRatio = getCurrentProfitRatio(symbol, position, widget);
    if (currentProfitRatio > 0) {
        let allCharts = Models.getChartsInAllTimeframes(symbol);
        allCharts.forEach(chart => {
            showLiveRForTimeframe(symbol, position, currentProfitRatio, chart);
        });
    }*/
}
export const showLiveRForTimeframe = (symbol: string, position: Models.Position,
    currentProfitRatio: number, timeframeChart: Models.TimeFrameChart) => {
    let isLong = position.netQuantity > 0;
    let markerPosition: LightweightCharts.SeriesMarkerPosition = isLong ? 'aboveBar' : 'belowBar';
    let markerShape: LightweightCharts.SeriesMarkerShape = isLong ? 'arrowUp' : 'arrowDown';
    let candles = Models.getCandlesFromDisplay(symbol);
    let lastCandle = candles[candles.length - 1];
    let atr = TradingState.getAtrInTrade(symbol);
    let todayRange = Models.getTodayRange(atr);
    let currentRange = Models.getCurrentRange(symbol, isLong);
    let atrText = `atr: ${currentRange}/${todayRange}`;
    timeframeChart.liveRMarker = {
        time: lastCandle.time,
        position: markerPosition,
        color: 'black',
        shape: markerShape,
        text: `${currentProfitRatio}R ${atrText}`,
        size: 0.1,
    };
    showMarkers(timeframeChart);
};
const getCurrentProfitRatio = (symbol: string, position: Models.Position | undefined, widget: Models.ChartWidget) => {
    if (!position) {
        return 0;
    }
    let currentPrice = Models.getCurrentPrice(symbol);
    let filledPrice = widget.initialCost;
    let stopPrice = widget.initialStopPrice;
    let isLong = position.netQuantity > 0;
    if ((isLong && currentPrice < filledPrice) || (!isLong && currentPrice > filledPrice)) {
        // do not show current loss
        return 0;
    }

    let currentProfit = Math.abs(currentPrice - filledPrice);
    let risk = Math.abs(stopPrice - filledPrice);
    let ratio = currentProfit / risk;
    ratio = Math.round(ratio * 10) / 10;
    return ratio;
};
/**
 * @returns the risk multiples
 */
const showPositionSize = (symbol: string, position: Models.Position | undefined, widget: any) => {
    let html = widget.htmlContents.positionCount;
    if (!position) {
        html.innerText = 'Pos: 0';
        html.style.color = 'black';
        return 0;
    }

    let display = `${Math.abs(position.netQuantity)}`;
    let riskMultiples = RiskManager.getRiskMultiplesFromExistingPosition(symbol);
    if (riskMultiples == 0)
        return 0;
    else {
        let percent = riskMultiples * 100;
        if (percent > 2) {
            percent = Math.round(percent);
        } else {
            percent = Math.round(percent * 10) / 10;
        }
        display = `${percent}%`;
    }

    // show relative position size regarding to risk size
    if (position.netQuantity > 0) {
        html.innerText = `Pos: +${display}`;
        html.style.color = 'green';
        return riskMultiples;
    } else if (position.netQuantity < 0) {
        html.innerText = `Pos: -${display}`;
        html.style.color = 'red';
        return riskMultiples;
    }
    return riskMultiples;
};

const drawWorkingOrders = async (
    symbol: string, position: Models.Position | undefined,
    widget: Models.ChartWidget) => {
    // clear previous orders before re-draw every order
    clearDrawnOrders(widget, widget.entryOrdersPriceLines);
    widget.entryOrdersPriceLines = [];
    widget.entryOrders = [];

    clearDrawnOrders(widget, [widget.stopLossOfPendingEntryPriceLine]);

    clearDrawnOrders(widget, widget.exitOrdersPriceLines);
    widget.htmlContents.exitOrders.innerText = "Exits:";
    widget.exitOrdersPriceLines = [];
    widget.exitOrderPairs = [];

    let exitOrderPairs: Models.ExitPair[] = [];
    let entryOrders: Models.EntryOrderModel[] = [];
    if (window.HybridApp.AccountCache) {
        exitOrderPairs = window.HybridApp.AccountCache.exitPairs.get(symbol) ?? [];
        entryOrders = window.HybridApp.AccountCache.entryOrders.get(symbol) ?? [];
    }
    widget.exitOrderPairs = exitOrderPairs;
    widget.entryOrders = entryOrders;
    TradingState.updateLowestExitBatchCount(symbol, exitOrderPairs.length);


    if (entryOrders.length === 0 && exitOrderPairs.length === 0)
        return;

    exitOrderPairs.sort(function (a, b) {
        if (!a.LIMIT || !b.LIMIT) {
            return 1;
        }
        let limitA = a['LIMIT'];
        let limitB = b['LIMIT'];
        let isBuyOrder = limitB.isBuy;
        let isLong = !isBuyOrder;

        let priceA = limitA.price ?? 0;
        let priceB = limitB.price ?? 0;
        if (isLong) {
            return priceA - priceB;
        } else {
            return priceB - priceA;
        }
    });
    widget.exitOrderPairs = exitOrderPairs;

    let exitGroupsLeg1: number[] = [];
    let exitGroupsLeg2: number[] = [];
    let exitGroupsLeg3: number[] = [];
    for (let i = exitOrderPairs.length - 1; i >= 0; i--) {
        if (exitGroupsLeg3.length < 3) {
            exitGroupsLeg3.push(i + 1);
        } else if (exitGroupsLeg2.length < 4) {
            exitGroupsLeg2.push(i + 1);
        } else {
            exitGroupsLeg1.push(i + 1);
        }
    }
    let exitOrdersString = "";
    if (exitGroupsLeg1.length > 0) {
        exitGroupsLeg1.reverse();
        exitOrdersString += `leg1 M1: ${exitGroupsLeg1.join(",")}, `;
    }
    if (exitGroupsLeg2.length > 0) {
        exitGroupsLeg2.reverse();
        exitOrdersString += `leg2 M5: ${exitGroupsLeg2.join(",")}, `;
    }
    if (exitGroupsLeg3.length > 0) {
        exitGroupsLeg3.reverse();
        exitOrdersString += `leg3 M15: ${exitGroupsLeg3.join(",")}, `;
    }

    // draw exit orders
    let ordersToDraw = [];
    for (let i = 0; i < exitOrderPairs.length; i++) {
        let orderSource = exitOrderPairs[i]['source'];
        if (orderSource != 'OTO' && orderSource != 'OCO') {
            Firestore.logError(`exit order pair is not from OTO or OCO, got ${exitOrderPairs[i]} instead`);
        }
        let entryPrice = 0;
        if (position)
            entryPrice = position.averagePrice;
        let stopOutPrice = exitOrderPairs[i]['STOP']?.price;
        let drawingStopOrder = createDrawingOrder(symbol, exitOrderPairs[i]['STOP'], entryPrice, stopOutPrice);
        let drawingLimitOrder = createDrawingOrder(symbol, exitOrderPairs[i]['LIMIT'], entryPrice, stopOutPrice);
        let takenPartialCount = TakeProfit.BatchCount - exitOrderPairs.length;
        if (takenPartialCount < 0) {
            takenPartialCount = 0;
        }
        let currentPartialNumber = i + 1 + takenPartialCount;
        let legNumber = 1;
        if (currentPartialNumber <= 3) {
            legNumber = 1;
        } else if (currentPartialNumber <= 7) {
            legNumber = 2;
        } else {
            legNumber = 3;
        }
        if (drawingStopOrder) {
            drawingStopOrder.legNumber = legNumber;
            drawingStopOrder.sequenceNumber = i + 1;
        }
        if (drawingLimitOrder) {
            drawingLimitOrder.legNumber = legNumber;
            drawingLimitOrder.sequenceNumber = i + 1;
        }
        if (drawingStopOrder) {

            //text = `${i + 1}:${drawingStopOrder.riskMultiples}%,`;
            ordersToDraw.push(drawingStopOrder);
        }
        if (drawingLimitOrder) {
            ordersToDraw.push(drawingLimitOrder);

            //text = `${i + 1}:${drawingLimitOrder.riskMultiples}%,`;
        }
        //exitOrdersString += text;
        /*
        ordersToDraw.forEach(orderToDraw => {
            let hasOrdersAtSamePrice = false;
            for (let j = 0; j < widget.exitOrdersPriceLines.length; j++) {
                let oldPriceLine = widget.exitOrdersPriceLines[j];
                if (oldPriceLine.options().price === orderToDraw.price) {
                    hasOrdersAtSamePrice = true;
                    oldPriceLine.applyOptions({
                        ...oldPriceLine.options(),
                        title: oldPriceLine.options().title + "," + text
                    })
                    break;
                }
            }
            if (!hasOrdersAtSamePrice) {
                let l = createPriceLine(widget.candleSeries, orderToDraw.price, text, orderToDraw.color, null, false, "solid");
                widget.exitOrdersPriceLines.push(l);
            }
            console.log(`hasOrdersAtSamePrice: ${hasOrdersAtSamePrice}`);
        });*/
    }
    let groupedExitOrders = groupExitOrdersByPrice(ordersToDraw);
    groupedExitOrders.forEach(orderToDraw => {
        let l = createPriceLine(widget.candleSeries, orderToDraw.price, orderToDraw.label, orderToDraw.color, null, false, "solid");
        widget.exitOrdersPriceLines.push(l);
    });
    widget.htmlContents.exitOrders.innerText = exitOrdersString;

    if (entryOrders.length > 0) {
        // assume all entry orders are stop orders
        // because 2 way breakout, not all entries are the same price
        // group them based on diffferent prices
        let entryGroups = new Map<number, Models.EntryOrderModel[]>();
        entryOrders.forEach(o => {
            let price = o.price ?? 0; // TODO: set price for market order
            let mapValue = entryGroups.get(price);
            if (mapValue) {
                mapValue.push(o);
            } else {
                entryGroups.set(price, [o]);
            }
        });
        let totalRiskForLong = 0;
        let totalRiskForShort = 0;
        entryGroups.forEach((mapEntryOrders, entryPrice) => {
            let stopOutPrice = mapEntryOrders[0].exitStopPrice;
            let firstEntryOrderToDraw = createDrawingOrder(symbol, mapEntryOrders[0], entryPrice, stopOutPrice);
            if (firstEntryOrderToDraw) {
                for (let i = 1; i < mapEntryOrders.length; i++) {
                    let nextEntryORderToDraw = createDrawingOrder(symbol, mapEntryOrders[i], entryPrice, stopOutPrice);
                    if (nextEntryORderToDraw)
                        firstEntryOrderToDraw.riskMultiples += nextEntryORderToDraw.riskMultiples;
                }
                let l = createPriceLine(widget.candleSeries, firstEntryOrderToDraw.price, `entry: ${firstEntryOrderToDraw.riskMultiples}%`, firstEntryOrderToDraw.color, null, false, "solid");
                widget.entryOrdersPriceLines.push(l);
                if (firstEntryOrderToDraw.isBuyOrder) {
                    totalRiskForLong += firstEntryOrderToDraw.riskMultiples;
                } else {
                    totalRiskForShort += firstEntryOrderToDraw.riskMultiples;
                }
            }
        });
        let stopLoss = Models.getEntryOrderStopLossPrice(symbol);
        widget.stopLossOfPendingEntryPriceLine = createPriceLine(
            widget.candleSeries, stopLoss, `pending stop`, 'black', null, false, "solid",
        )
        widget.entryOrderLabelRiskMultiple = Math.max(totalRiskForLong, totalRiskForShort) / 100;
    }
};

const clearDrawnOrders = (widget: any, widgetPriceLines: any) => {
    if (widgetPriceLines && widgetPriceLines.length > 0) {
        widgetPriceLines.forEach((l: any) => {
            if (l)
                widget.candleSeries.removePriceLine(l);
        });
        widgetPriceLines = [];
    }
};

export const getCrossHairPrice = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget)
        return;
    let crosshairPrice = widget.chartState.crosshairPrice;
    return Helper.roundPrice(symbol, crosshairPrice);
};

export const hideChart = (symbol: string) => {
    let chartWidget = Models.getChartWidget(symbol);
    if (!chartWidget)
        return;
    let container = chartWidget.htmlContents.container;
    container.style.display = 'none';
};
export const showChart = (symbol: string) => {
    let chartWidget = Models.getChartWidget(symbol);
    if (!chartWidget)
        return;
    let container = chartWidget.htmlContents.container;
    container.style.display = 'block';
};
export const invisibleChart = (symbol: string) => {
    let chartWidget = Models.getChartWidget(symbol);
    if (!chartWidget)
        return;
    let container = chartWidget.htmlContents.container;
    container.style.visibility = 'hidden';
};
export const visibleChart = (symbol: string) => {
    let chartWidget = Models.getChartWidget(symbol);
    if (!chartWidget)
        return;
    let container = chartWidget.htmlContents.container;
    container.style.visibility = 'visible';
};
export const maximizeChart = (symbol: string) => {
    resizeChart(symbol, ChartSettings.bigChartSize.width, ChartSettings.bigChartSize.height);
};
export const normalSizeChart = (symbol: string) => {
    resizeChart(symbol, ChartSettings.quarterChartSize.width, ChartSettings.quarterChartSize.height);
};
export const resizeChart = (symbol: string, width: number, height: number) => {
    let charts = Models.getChartsInAllTimeframes(symbol);
    charts.forEach(timeframeChart => {
        timeframeChart.chart.applyOptions({
            width: width,
            height: height,
        });
    });
};
export const addMarker = (
    marker: LightweightCharts.SeriesMarker<LightweightCharts.UTCTimestamp>,
    timeframeChart: Models.TimeFrameChart
) => {
    timeframeChart.markers.push(marker);
    showMarkers(timeframeChart);
};

export const clearPriceLines = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget)
        return;
    if (widget.entryPriceLine) {
        widget.candleSeries.removePriceLine(widget.entryPriceLine);
        widget.entryPriceLine = undefined;
    }
    if (widget.stopLossOfPendingEntryPriceLine) {
        widget.candleSeries.removePriceLine(widget.stopLossOfPendingEntryPriceLine);
        widget.stopLossOfPendingEntryPriceLine = undefined;
    }
    if (widget.stopLossPriceLine) {
        widget.candleSeries.removePriceLine(widget.stopLossPriceLine);
        widget.stopLossPriceLine = undefined;
    }
    if (widget.riskLevelPriceLine) {
        widget.candleSeries.removePriceLine(widget.riskLevelPriceLine);
        widget.riskLevelPriceLine = undefined;
    }
};

export const updateUI = (symbol: string, className: string, text: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    let htmlContainter = widget.htmlContents.container;
    let target = htmlContainter.getElementsByClassName(className)[0] as HTMLElement;
    if (target)
        target.innerText = text;
};

export const drawRiskLevel = (symbol: string, price: number) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget)
        return;

    if (widget.riskLevelPriceLine) {
        widget.candleSeries.removePriceLine(widget.riskLevelPriceLine);
    }
    widget.riskLevelPriceLine = createPriceLine(widget.candleSeries, price, "Risk Level", null, null, false, "solid");
};
export const drawStopLoss = (symbol: string, price: number) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget)
        return;

    if (widget.stopLossPriceLine) {
        widget.candleSeries.removePriceLine(widget.stopLossPriceLine);
    }
    widget.stopLossPriceLine = createPriceLine(widget.candleSeries, price, "S/L", null, null, false, "solid");
};
export const drawEntry = (symbol: string, price: number) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget)
        return;
    if (widget.entryPriceLine) {
        widget.candleSeries.removePriceLine(widget.entryPriceLine);
    }
    widget.entryPriceLine = createPriceLine(widget.candleSeries, price, "Entry", null, null, false, "solid");
};


export const createPriceLine = (
    series: LightweightCharts.ISeriesApi<LightweightCharts.SeriesType>,
    price: number, title: string, color: string | null, lineWidth: LightweightCharts.LineWidth | null,
    noPriceLabel: boolean, lineStyle: string) => {
    // check undefined for price
    if (!color) {
        color = 'blue';
    }
    if (!lineWidth) {
        lineWidth = 1;
    }
    let axisLabelVisible = true;
    if (noPriceLabel) {
        axisLabelVisible = false;
    }
    let tvLineStyle = LightweightCharts.LineStyle.Solid;
    if (lineStyle == "dashed") {
        tvLineStyle = LightweightCharts.LineStyle.Dashed;
    }
    return series.createPriceLine({
        price: price,
        color: color,
        title: title,
        lineStyle: tvLineStyle,
        lineWidth: lineWidth,
        axisLabelVisible: axisLabelVisible
    });
};

export const blinkChart = (symbol: string, isLong: boolean) => {
    let color = isLong ? "green" : "red";
    let widget = Models.getChartWidget(symbol);
    if (!widget)
        return;
    let chart = widget.htmlContents.chartM1;
    let a = setInterval(function () {
        if (chart.style.backgroundColor != color) {
            chart.style.backgroundColor = color;
        } else {
            chart.style.backgroundColor = '';
        }
    }, 300);
    setTimeout(() => {
        clearInterval(a);
        chart.style.backgroundColor = '';
    }, 10000);
};

/* #region Indicators */

const redColor = '#ff4444';
const greenColor = '#00c851';
const blueColor = '#304ffe';



export const populatePreMarketLineSeries = (time: number, high: number, low: number, widget: Models.ChartWidget) => {
    let charts = Models.getChartsInAllTimeframes(widget.symbol);
    charts = [charts[0]];
    charts.forEach(timeframeChart => {
        if (timeframeChart.premktHigh) {
            let newData: LightweightCharts.LineData = {
                time: time as LightweightCharts.UTCTimestamp,
                value: high,
            };
            timeframeChart.premktHigh.update(newData);
        }
        if (timeframeChart.premktLow) {
            let newData: LightweightCharts.LineData = {
                time: time as LightweightCharts.UTCTimestamp,
                value: low,
            };
            timeframeChart.premktLow.update(newData);
        }
    });
};

export const drawKeyAreas = (widget: Models.ChartWidget, isLong: boolean, areas: TradingPlansModels.PriceArea[]) => {
    let color = isLong ? ChartSettings.defaultGreen : ChartSettings.defaultRed;
    areas.forEach(area => {
        createPriceLine(widget.candleSeries, area.priceLevel, "", color, 2, true, "solid");
        if (area.upperRoom) {
            createPriceLine(widget.candleSeries, area.priceLevel + area.upperRoom, "", color, 1, true, "dashed");
        }
        if (area.lowerRoom) {
            createPriceLine(widget.candleSeries, area.priceLevel - area.lowerRoom, "", color, 1, true, "dashed");
        }
    });
};
export const drawMomentumLevels = (widget: Models.ChartWidget) => {
    let momentumStartForLong = TradingPlans.getMomentumStartLevel(widget.symbol, true);
    let momentumStartForShort = TradingPlans.getMomentumStartLevel(widget.symbol, false);
    let sameLevel = momentumStartForLong == momentumStartForShort;
    let allCharts = Models.getChartsInAllTimeframes(widget.symbol);
    allCharts.forEach(chart => {
        for (let i = 0; chart.momentumLevels.length > i; i++) {
            let l = chart.momentumLevels[i];
            chart.candleSeries.removePriceLine(l);
        }
        chart.momentumLevels = [];
        if (momentumStartForShort != 0) {
            let text = sameLevel ? "inflection" : "downtrend start";
            let l =
                createPriceLine(
                    chart.candleSeries, momentumStartForShort,
                    text, "red", 2, false, "solid",
                );
            chart.momentumLevels.push(l);
        }
        if (momentumStartForLong != 0 && !sameLevel) {
            let l = createPriceLine(
                chart.candleSeries, momentumStartForLong,
                "uptrend start", "green", 2, false, "solid",
            );
            chart.momentumLevels.push(l);
        }
        let topPlan = TradingPlans.getTradingPlans(widget.symbol);
        if (topPlan.long.firstTargetToAdd > 0) {
            let l = createPriceLine(
                chart.candleSeries, topPlan.long.firstTargetToAdd,
                "T1 to add", "green", 1, false, "solid",
            );
            chart.momentumLevels.push(l);
        }
        if (topPlan.short.firstTargetToAdd > 0) {
            let l = createPriceLine(
                chart.candleSeries, topPlan.short.firstTargetToAdd,
                "T1 to add", "red", 1, false, "solid",
            );
            chart.momentumLevels.push(l);
        }
    });
}
export const drawKeyLevels = (widget: Models.ChartWidget, keyLevels: TradingPlansModels.keyLevels,
    lastSupport: number[], lastResistance: number[]) => {
    if (keyLevels.otherLevels) {
        keyLevels.otherLevels.forEach(price => {
            createPriceLine(widget.candleSeries, price, "", "black", 2, true, "solid");
        });
    }

    lastSupport.forEach(price => {
        createPriceLine(widget.candleSeries, price, "last support", "green", 2, false, "solid");
    });
    lastResistance.forEach(price => {
        createPriceLine(widget.candleSeries, price, "last resistance", "red", 2, false, "solid");
    });
    drawMomentumLevels(widget);
};
export const drawIndicatorsForNewlyClosedCandle = (end: number, candles: Models.CandlePlus[], widget: Models.ChartWidget) => {
    // only check within first hour after market open
    if (candles[end].minutesSinceMarketOpen < 0 ||
        candles[end].minutesSinceMarketOpen > 60) {
        return;
    }
};


export const resetPreMarketLowLineSeries = (widget: Models.ChartWidget | null | undefined) => {
    if (!widget)
        return;
    let symbol = widget.symbol;
    let charts = Models.getChartsInAllTimeframes(symbol);
    let timeframeChart = charts[0];
    if (timeframeChart.premktLow) {
        timeframeChart.chart.removeSeries(timeframeChart.premktLow);
    }
    timeframeChart.premktLow = timeframeChart.chart.addLineSeries(ChartSettings.preMarketLineSettings);
}

export const resetPreMarketHighLineSeries = (widget: Models.ChartWidget) => {
    if (!widget)
        return;
    let symbol = widget.symbol;
    let charts = Models.getChartsInAllTimeframes(symbol);
    let timeframeChart = charts[0];
    if (timeframeChart.premktHigh) {
        timeframeChart.chart.removeSeries(timeframeChart.premktHigh);
    }
    timeframeChart.premktHigh = timeframeChart.chart.addLineSeries(ChartSettings.preMarketLineSettings);
}
const runPostCandleCloseIndicators = (newlyClosedCandle: Models.CandlePlus) => {
    let localTime = Helper.tvTimestampToLocalJsDate(newlyClosedCandle.time);
    checkVwapBeforeOpen(newlyClosedCandle, localTime);
};
const checkVwapBeforeOpen = (newlyClosedCandle: Models.CandlePlus, localTime: any) => {
    // check when 6:29 AM is closed.
};
/* #endregion */

export const displayState = (symbol: string, status: string, exitLocked: boolean) => {
    let text = `State: ${status}`;
    if (exitLocked) {
        text += ' locked';
    } else {
        text += ' unlocked';
    }
    updateUI(symbol, "topBarRight2", text);
};
const setupTradingPlans = (symbol: string, container: Models.AlgoElements, sideBar: HTMLElement) => {
    let tradebooksMap = new Map<string, Tradebook>();
    if (!container)
        return tradebooksMap;


    return setupTradebookButtons(symbol, container.long, container.short, sideBar);
};
const hideButtonAfterSeconds = (button: HTMLElement, secondsSinceMarketOpen: number, hideAfterSeconds: number) => {
    let waitSeconds = hideAfterSeconds - secondsSinceMarketOpen;
    setTimeout(() => {
        button.style.display = 'none';
    }, waitSeconds * 1000);
}
const setupTradebookButtons = (symbol: string, longContainer: HTMLElement, shortContainer: HTMLElement, sideBar: HTMLElement) => {
    let tradebooksMap = TradebooksManager.createAllTradebooks(symbol);
    tradebooksMap.forEach(tradebook => {
        let className = tradebook.isLong ? "longButton" : "shortButton";
        let { buttons, stats, container } = createTradebookUI(tradebook, sideBar, className);
        tradebook.linkButton(buttons, stats, container);
        if (tradebook.isEnabled()) {
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    });
    return tradebooksMap;
}
const createTradebookUINew = (tradebook: Tradebook, sideBar: HTMLElement, className: string) => {
    let entryMethods = tradebook.getEntryMethods();
    let container = document.createElement("div");
    let title = document.createElement("div");
    title.textContent = tradebook.buttonLabel;
    container.appendChild(title);
    let stats = document.createElement("div");
    container.appendChild(stats);
    let buttons: HTMLElement[] = [];
    entryMethods.forEach(entryMethod => {
        let entryMethodButton = createButton(entryMethod, "div", container);
        entryMethodButton.classList.add(className);
        container.appendChild(entryMethodButton);
        buttons.push(entryMethodButton);
    });
    return { buttons, stats, container };
}

const createTradebookUI = (tradebook: Tradebook, sideBar: HTMLElement, className: string) => {\
    let entryMethods = tradebook.getEntryMethods();
    if (entryMethods.length > 0) {
        createTradebookUINew(tradebook, sideBar, className);
        return;
    }
    let buttonText = tradebook.buttonLabel;
    let container = document.createElement("div");
    let mainButton = createButton(buttonText, "div", container);
    let buttons = [mainButton];
    mainButton.classList.add(className);
    container.appendChild(mainButton);
    let entryParametersList: Models.TradebookEntryParameters[] = [
        Models.getDefaultEntryParameters(),
    ];

    let entryParameters = tradebook.getEligibleEntryParameters();
    if (entryParameters.useFirstNewHigh) {
        let firstNewHighButtonText = tradebook.isLong ? "1st High" : "1st Low";
        let firstNewHighButton = createButton(firstNewHighButtonText, "div", container);
        firstNewHighButton.classList.add(className);
        container.appendChild(firstNewHighButton);
        buttons.push(firstNewHighButton);
        entryParametersList.push({
            useCurrentCandleHigh: false,
            useFirstNewHigh: true,
            useMarketOrderWithTightStop: false,
        });
    }
    if (entryParameters.useCurrentCandleHigh) {
        let currentCandleHighButtonText = tradebook.isLong ? "Cur High" : "Cur Low";
        let currentCandleHighButton = createButton(currentCandleHighButtonText, "div", container);
        currentCandleHighButton.classList.add(className);
        container.appendChild(currentCandleHighButton);
        buttons.push(currentCandleHighButton);
        entryParametersList.push({
            useCurrentCandleHigh: true,
            useFirstNewHigh: false,
            useMarketOrderWithTightStop: false,
        });
    }
    if (entryParameters.useMarketOrderWithTightStop) {
        let chaseWithMarketOrderButtonText = tradebook.isLong ? "Mkt w/tight stp" : "Mkt w/tight stp";
        let chaseWithMarketOrderButton = createButton(chaseWithMarketOrderButtonText, "div", container);
        chaseWithMarketOrderButton.classList.add(className);
        container.appendChild(chaseWithMarketOrderButton);
        buttons.push(chaseWithMarketOrderButton);
        entryParametersList.push({
            useCurrentCandleHigh: false,
            useFirstNewHigh: false,
            useMarketOrderWithTightStop: true,
        });
    }

    for (let i = 0; i < buttons.length; i++) {
        let button = buttons[i];
        button.addEventListener("click", (pointerEvent) => {
            Firestore.logInfo(`tradebook ${tradebook.buttonLabel} clicked`);
            tradebook.startEntry(pointerEvent.shiftKey, false, entryParametersList[i]);
        });
    }
    

    let stats = document.createElement("div");
    container.appendChild(stats);

    let sizingBar = document.createElement("div");
    container.appendChild(sizingBar);
    /*
    let sizingBarButtonsText = ["A+10", "A9", "A-7", "B+5", "B3"];
    let sizingBarButtonsSize = [10, 9, 7, 5, 3];
    for (let i = 0; i < sizingBarButtonsText.length; i++) {
        let sizingButton = createButton(sizingBarButtonsText[i], "span", sizingBar);
        sizingButton.classList.add("sizingButton");
        sizingButton.addEventListener("click", (pointerEvent) => {
            Firestore.logInfo(`set sizing count to ${sizingBarButtonsSize[i]}`);
            tradebook.sizingCount = sizingBarButtonsSize[i];
        });
    }*/
    sideBar.appendChild(container);
    container.style.display = 'none';
    return { buttons, stats, container };
}

export const createButton = (text: string, tag: string, container: HTMLElement) => {
    let buttonElement = document.createElement(tag);
    buttonElement.textContent = text;
    container.appendChild(buttonElement);
    return buttonElement;
};

export const darkChart = (symbol: string) => {
    let chart = Models.getChartWidget(symbol);
    if (!chart)
        return;
    if (chart.isDark)
        return;
    let allCharts = Models.getChartsInAllTimeframes(symbol);
    allCharts.forEach(chart => {
        chart.chart.applyOptions({
            layout: {
                background: {
                    color: '#BDBDBD',
                }
            }
        });
    });

    chart.isDark = true;
}
export const setWatermark = (symbol: string, text: string) => {
    let chart = Models.getChartWidget(symbol);
    if (!chart)
        return;
    chart.chartM1.applyOptions({
        watermark: {
            text: text,
            visible: true,
        }
    });
}
export const lightChart = (symbol: string) => {
    let chart = Models.getChartWidget(symbol);
    if (!chart)
        return;
    if (!chart.isDark)
        return;

    let allCharts = Models.getChartsInAllTimeframes(symbol);
    allCharts.forEach(chart => {
        chart.chart.applyOptions({
            layout: {
                background: {
                    color: '#ffffff',
                }
            }
        });
    });

    chart.isDark = false;
}


export const updateToolTipPriceLine = (symbol: string, text: string) => {
    let chart = Models.getChartWidget(symbol);
    if (!chart)
        return;
    let m1Chart = chart.timeframeChartM1;
    if (m1Chart.toolTipPriceLine) {
        m1Chart.candleSeries.removePriceLine(m1Chart.toolTipPriceLine);
    }
    let currentPrice = Models.getCurrentPrice(symbol);
    m1Chart.toolTipPriceLine = createPriceLine(
        m1Chart.candleSeries, currentPrice, text, "black", 1, false, "dashed");
}