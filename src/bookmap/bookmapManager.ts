import { BookmapCanvas } from './bookmapCanvas';
import type { OrderBookSnapshot, BookmapConfig } from './bookmapModels';
import * as Models from '../models/models';
import * as GlobalSettings from '../config/globalSettings';

const bookmapInstances: Map<string, BookmapCanvas> = new Map();

/**
 * Initialize bookmap for a symbol.
 * Called after chart creation in createChartWidget.
 */
export const initialize = (symbol: string, chartWidth: number): void => {
    if (!GlobalSettings.enableBookmap) return;

    let widget = Models.getChartWidget(symbol);
    if (!widget) return;

    let panelElement = widget.htmlContents.bookmapPanel;
    if (!panelElement) return;

    let config: Partial<BookmapConfig> = {
        heatmapEnabled: GlobalSettings.enableBookmapHeatmap,
    };

    let overlay = new BookmapCanvas(symbol, panelElement, chartWidth, config);
    bookmapInstances.set(symbol, overlay);
};

/**
 * Feed a trade into the bookmap clustering engine.
 */
export const onTrade = (symbol: string, price: number, size: number, timestamp: number): void => {
    let instance = bookmapInstances.get(symbol);
    if (!instance) return;
    instance.addTrade(price, size, timestamp);
};

/**
 * Update order book data for heatmap.
 */
export const onOrderBookUpdate = (symbol: string, orderBook: OrderBookSnapshot): void => {
    let instance = bookmapInstances.get(symbol);
    if (!instance) return;
    instance.updateOrderBook(orderBook);
};

/**
 * Show/hide bookmap based on timeframe selection.
 */
export const onTimeframeChange = (symbol: string, _timeframe: number): void => {
    let instance = bookmapInstances.get(symbol);
    if (!instance) return;
    instance.show();
};

export const destroy = (symbol: string): void => {
    let instance = bookmapInstances.get(symbol);
    if (instance) {
        instance.destroy();
        bookmapInstances.delete(symbol);
    }
};

export const destroyAll = (): void => {
    bookmapInstances.forEach((instance) => {
        instance.destroy();
    });
    bookmapInstances.clear();
};

export const resetAll = (): void => {
    bookmapInstances.forEach(instance => {
        instance.reset();
    });
};
