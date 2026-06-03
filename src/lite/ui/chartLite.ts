import * as LightweightCharts from 'sunrise-tv-lightweight-charts';
import * as StateLite from '../models/stateLite';

interface LiteChartWidget {
    chart: any;
    candleSeries: any;
    resizeObserver: ResizeObserver;
    crosshairPrice: number;
    exitOrderPairs: StateLite.LiteExitPair[];
    exitOrderPriceLines: any[];
}

interface ExitOrderToDraw {
    price: number;
    label: string;
    color: string;
}

const widgets = new Map<string, LiteChartWidget>();
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
        timeVisible: true,
        rightOffset: 10,
        barSpacing: 10,
    },
};

const candleToSeriesData = (candle: StateLite.Candle) => ({
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
});

const roundPrice = (price: number) => {
    if (!Number.isFinite(price)) {
        return undefined;
    }
    if (price >= 1) {
        return Math.round(price * 100) / 100;
    }
    return Math.round(price * 10000) / 10000;
};

const createPriceLine = (series: any, price: number, title: string, color: string) => {
    return series.createPriceLine({
        price,
        color,
        title,
        lineStyle: LightweightCharts.LineStyle.Solid,
        lineWidth: 1,
        axisLabelVisible: true,
    });
};

const clearPriceLines = (widget: LiteChartWidget) => {
    widget.exitOrderPriceLines.forEach(line => {
        if (line) {
            widget.candleSeries.removePriceLine(line);
        }
    });
    widget.exitOrderPriceLines = [];
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
    let candlestickSettings: any = {
        borderVisible: false,
        scaleMargins: {
            top: 0,
            bottom: 0.3,
        },
    };
    let candleSeries = chart.addCandlestickSeries(candlestickSettings);
    let resizeObserver = new ResizeObserver(() => {
        chart.resize(container.clientWidth || settings.width, container.clientHeight || settings.height);
    });
    resizeObserver.observe(container);
    let widget: LiteChartWidget = {
        chart,
        candleSeries,
        resizeObserver,
        crosshairPrice: 0,
        exitOrderPairs: [],
        exitOrderPriceLines: [],
    };
    chart.subscribeCrosshairMove((param: any) => {
        if (!param.point) {
            return;
        }
        let price = candleSeries.coordinateToPrice(param.point.y);
        if (price) {
            widget.crosshairPrice = price;
        }
    });
    widgets.set(symbol, widget);
};

export const setLiteChartHistory = (symbol: string, candles: StateLite.Candle[]) => {
    let widget = widgets.get(symbol);
    if (!widget) {
        return;
    }
    widget.candleSeries.setData(candles.map(candleToSeriesData));
    widget.chart.timeScale().fitContent();
};

export const updateLiteChartCandle = (symbol: string, candle: StateLite.Candle | undefined) => {
    if (!candle) {
        return;
    }
    let widget = widgets.get(symbol);
    if (!widget) {
        return;
    }
    widget.candleSeries.update(candleToSeriesData(candle));
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

export const drawExitPairs = (symbol: string, pairs: StateLite.LiteExitPair[]) => {
    let widget = widgets.get(symbol);
    if (!widget) {
        return 'Exits: ';
    }
    clearPriceLines(widget);
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
            widget.candleSeries,
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
};
