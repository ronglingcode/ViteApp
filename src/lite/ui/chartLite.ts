import * as LightweightCharts from 'sunrise-tv-lightweight-charts';
import * as TradingPlans from '../../models/tradingPlans/tradingPlans';
import * as StateLite from '../models/stateLite';
import * as StatusLite from './statusLite';

interface LiteChartWidget {
    chart: any;
    rangeSeries: any;
    resizeObserver: ResizeObserver;
    crosshairPrice: number;
    exitOrderPairs: StateLite.LiteExitPair[];
    entryOrders: StateLite.LiteOrderModel[];
    exitOrderPriceLines: any[];
    entryOrderPriceLines: any[];
    currentPriceLine?: any;
    lastPrice?: number;
    rangeCenter?: number;
    rangeHalfSize?: number;
}

interface ExitOrderToDraw {
    price: number;
    label: string;
    color: string;
}

const widgets = new Map<string, LiteChartWidget>();
const rangeWarningKeys = new Set<string>();
const recenterThresholdRatio = 0.3;

const focusChartSize = {
    width: 455,
    height: 550,
};
const quarterChartSize = {
    width: 330,
    height: 400,
};
const halfChartSize = {
    width: 500,
    height: 500,
};
const chartSettings = {
    width: focusChartSize.width,
    height: focusChartSize.height,
    layout: {
        background: {
            color: '#bdbdbd',
        },
        textColor: 'rgba(33, 56, 77, 1)',
    },
    grid: {
        horzLines: {
            visible: false,
        },
        vertLines: {
            visible: false,
        },
    },
    crosshair: {
        mode: 0,
        vertLine: {
            style: 0,
        },
        horzLine: {
            style: 0,
        },
    },
    rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.8)',
    },
    timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.8)',
        timeVisible: false,
        rightOffset: 1,
        barSpacing: 80,
    },
};

const roundPrice = (price: number) => {
    if (!Number.isFinite(price)) {
        return undefined;
    }
    if (price >= 1) {
        return Math.round(price * 100) / 100;
    }
    return Math.round(price * 10000) / 10000;
};

const logRangeWarningOnce = (symbol: string, message: string) => {
    let key = `${symbol}:${message}`;
    if (rangeWarningKeys.has(key)) {
        return;
    }
    rangeWarningKeys.add(key);
    StatusLite.logEvent(`${symbol} ${message}`, true);
    console.error(`[LiteChart] ${symbol} ${message}`);
};

const getAtrRange = (symbol: string) => {
    try {
        let atr = TradingPlans.getTradingPlans(symbol).atr.average;
        if (!Number.isFinite(atr) || atr <= 0) {
            logRangeWarningOnce(symbol, 'missing ATR for order chart range');
            return undefined;
        }
        return atr;
    } catch (error) {
        logRangeWarningOnce(symbol, `failed to read ATR: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
};

const createPriceLine = (
    series: any,
    price: number,
    title: string,
    color: string,
    lineStyle = LightweightCharts.LineStyle.Solid,
    lineWidth: LightweightCharts.LineWidth = 1
) => {
    return series.createPriceLine({
        price,
        color,
        title,
        lineStyle,
        lineWidth,
        axisLabelVisible: true,
    });
};

const removePriceLine = (widget: LiteChartWidget, line: any) => {
    if (line) {
        widget.rangeSeries.removePriceLine(line);
    }
};

const clearLineList = (widget: LiteChartWidget, lines: any[]) => {
    lines.forEach(line => removePriceLine(widget, line));
    return [];
};

const clearPriceLines = (widget: LiteChartWidget) => {
    widget.exitOrderPriceLines = clearLineList(widget, widget.exitOrderPriceLines);
    widget.entryOrderPriceLines = clearLineList(widget, widget.entryOrderPriceLines);
    removePriceLine(widget, widget.currentPriceLine);
    widget.currentPriceLine = undefined;
};

const updateCurrentPriceLine = (widget: LiteChartWidget, currentPrice: number) => {
    removePriceLine(widget, widget.currentPriceLine);
    widget.currentPriceLine = createPriceLine(widget.rangeSeries, currentPrice, 'Last', '#304ffe', LightweightCharts.LineStyle.Solid, 2);
};

const sortExitPairs = (pairs: StateLite.LiteExitPair[]) => {
    pairs.sort((a, b) => {
        if (!a.LIMIT || !b.LIMIT) {
            return 1;
        }
        let isLong = !b.LIMIT.isBuy;
        let priceA = a.LIMIT.price ?? 0;
        let priceB = b.LIMIT.price ?? 0;
        return isLong ? priceA - priceB : priceB - priceA;
    });
};

const createDrawingOrder = (order: StateLite.LiteOrderModel | undefined, label: string): ExitOrderToDraw | undefined => {
    if (!order?.price) {
        return undefined;
    }
    return {
        price: order.price,
        label,
        color: order.isBuy ? 'green' : 'red',
    };
};

export const buildExitOrdersSummary = (pairs: StateLite.LiteExitPair[]) => {
    return pairs.length > 0 ? `Exits: ${pairs.length}` : 'Exits: ';
};

export const getLiteChartSettings = (tabIndex: number, totalCount: number) => {
    let width = focusChartSize.width;
    let height = focusChartSize.height;
    if (totalCount === 1) {
        width = halfChartSize.width;
        height = halfChartSize.height;
    } else if (totalCount === 2) {
        width = halfChartSize.width;
        height = halfChartSize.height;
    } else if (totalCount > 2) {
        width = quarterChartSize.width;
        height = quarterChartSize.height;
    }
    return {
        ...chartSettings,
        width,
        height,
    };
};

export const createLiteChart = (symbol: string, container: HTMLElement, tabIndex: number, totalCount: number) => {
    let settings = getLiteChartSettings(tabIndex, totalCount);
    container.style.width = `${settings.width}px`;
    container.style.height = `${settings.height}px`;
    let chart = LightweightCharts.createChart(container, settings);
    let rangeSeries = chart.addLineSeries({
        color: 'rgba(0,0,0,0)',
        lineWidth: 1,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
    });
    let resizeObserver = new ResizeObserver(() => {
        chart.resize(container.clientWidth || settings.width, container.clientHeight || settings.height);
    });
    resizeObserver.observe(container);
    let widget: LiteChartWidget = {
        chart,
        rangeSeries,
        resizeObserver,
        crosshairPrice: 0,
        exitOrderPairs: [],
        entryOrders: [],
        exitOrderPriceLines: [],
        entryOrderPriceLines: [],
    };
    chart.subscribeCrosshairMove((param: any) => {
        if (!param.point) {
            return;
        }
        let price = rangeSeries.coordinateToPrice(param.point.y);
        if (price) {
            widget.crosshairPrice = price;
        }
    });
    widgets.set(symbol, widget);
};

export const updateOrderChartRange = (symbol: string, currentPrice: number | undefined) => {
    let widget = widgets.get(symbol);
    if (!widget) {
        return;
    }
    if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) {
        logRangeWarningOnce(symbol, 'missing current price for order chart range');
        return;
    }
    let atr = getAtrRange(symbol);
    if (!atr) {
        return;
    }

    widget.lastPrice = currentPrice;
    updateCurrentPriceLine(widget, currentPrice);
    if (widget.rangeCenter != null && widget.rangeHalfSize != null) {
        let maxDistanceFromCenter = widget.rangeHalfSize * 2 * recenterThresholdRatio;
        if (Math.abs(currentPrice - widget.rangeCenter) < maxDistanceFromCenter) {
            return;
        }
    }

    let lower = currentPrice - atr;
    let upper = currentPrice + atr;
    let time = Math.floor(Date.now() / 1000) as any;
    widget.rangeCenter = currentPrice;
    widget.rangeHalfSize = atr;
    widget.rangeSeries.setData([
        { time, value: lower },
        { time: time + 60, value: upper },
    ]);
    widget.chart.timeScale().fitContent();
};

export const setLiteChartHistory = (symbol: string, candles: StateLite.Candle[]) => {
    let lastCandle = candles[candles.length - 1];
    updateOrderChartRange(symbol, lastCandle?.close);
};

export const updateLiteChartCandle = (symbol: string, candle: StateLite.Candle | undefined) => {
    if (!candle) {
        return;
    }
    updateOrderChartRange(symbol, candle?.close);
};

export const getCrossHairPrice = (symbol: string) => {
    let widget = widgets.get(symbol);
    if (!widget || !widget.crosshairPrice) {
        return undefined;
    }
    return roundPrice(widget.crosshairPrice);
};

export const getExitOrderPairs = (symbol: string) => {
    return widgets.get(symbol)?.exitOrderPairs ?? [];
};

export const drawEntryOrders = (symbol: string, orders: StateLite.LiteOrderModel[]) => {
    let widget = widgets.get(symbol);
    if (!widget) {
        return;
    }
    widget.entryOrderPriceLines = clearLineList(widget, widget.entryOrderPriceLines);
    widget.entryOrders = orders.slice();
    orders.forEach((order, index) => {
        let drawingOrder = createDrawingOrder(order, `${index + 1}:ENTRY`);
        if (!drawingOrder) {
            return;
        }
        widget.entryOrderPriceLines.push(createPriceLine(
            widget.rangeSeries,
            drawingOrder.price,
            drawingOrder.label,
            drawingOrder.color,
            LightweightCharts.LineStyle.Solid,
            2
        ));
    });
};

export const drawExitPairs = (symbol: string, pairs: StateLite.LiteExitPair[]) => {
    let widget = widgets.get(symbol);
    if (!widget) {
        return 'Exits: ';
    }
    widget.exitOrderPriceLines = clearLineList(widget, widget.exitOrderPriceLines);
    let sortedPairs = pairs.slice();
    sortExitPairs(sortedPairs);
    widget.exitOrderPairs = sortedPairs;

    let ordersToDraw: ExitOrderToDraw[] = [];
    sortedPairs.forEach((pair, index) => {
        let drawingStopOrder = createDrawingOrder(pair.STOP, `${index + 1}:STOP`);
        let drawingLimitOrder = createDrawingOrder(pair.LIMIT, `${index + 1}:LIMIT`);
        if (drawingStopOrder) {
            ordersToDraw.push(drawingStopOrder);
        }
        if (drawingLimitOrder) {
            ordersToDraw.push(drawingLimitOrder);
        }
    });

    ordersToDraw.forEach(orderToDraw => {
        let line = createPriceLine(
            widget.rangeSeries,
            orderToDraw.price,
            orderToDraw.label,
            orderToDraw.color
        );
        widget.exitOrderPriceLines.push(line);
    });

    return buildExitOrdersSummary(sortedPairs);
};

export const destroyLiteCharts = () => {
    widgets.forEach(widget => {
        clearPriceLines(widget);
        widget.resizeObserver.disconnect();
        widget.chart.remove();
    });
    widgets.clear();
    rangeWarningKeys.clear();
};
