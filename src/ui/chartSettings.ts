import * as LightweightCharts from 'sunrise-tv-lightweight-charts';
export const defaultRed = 'rgb(255,82,82)';
export const defaultGreen = 'rgb(38,166,154)';
export const lightGreen = '#90EE90';
export const lightRed = '#EE9F9F';
const redColor = '#ff4444';
const greenColor = '#00c851';
const blueColor = '#304ffe';
export const defaultVolumeColor = '#CFCFCF';// '#E1F5FE';
export const bigChartSize = {
    width: 930,
    height: 780,
};
export const focusChartSize = {
    width: 455,
    height: 550,
};
export const quarterChartSize = {
    width: 330,
    height: 400,
};
export const halfChartSize = {
    width: 400,
    height: 400,
};
export const chartSettings = {
    width: focusChartSize.width,
    height: focusChartSize.height,
    layout: {
        background: {
            color: '#bdbdbd'
        },
        textColor: 'rgba(33, 56, 77, 1)',
    },
    grid: {
        horzLines: {
            //color: '#F0F3FA',
            visible: false,
        },
        vertLines: {
            //color: '#F0F3FA',
            visible: false,
        },
    },
    /* comment out because LightweightCharts is not loaded
    crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
    },*/
    crosshair: {
        mode: 0,
        vertLine: {
            style: 0, //LightweightCharts.LineStyle.Solid
        },
        horzLine: {
            style: 0, //LightweightCharts.LineStyle.Solid
        }
    },
    rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.8)'
    },
    timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.8)',
        timeVisible: true,
        //fixRightEdge: true,
        //fixLeftEdge: true,
        rightOffset: 10,
        barSpacing: 10
    },
    /*
    grid: {
        vertLines: { visible: false },
        horzLines: { visible: false }
    }*/
};

export const getPopupChartSettings = () => {
    let settings = {
        ...chartSettings,
    }
    settings.layout.background.color = '#ffffff';
    settings.timeScale.barSpacing = 50;
    settings.timeScale.rightOffset = 1;
    settings.width = 400;
    settings.height = 400;
    return settings;
};
export const getChartSettings = (tabIndex: number, totalCount: number) => {
    let width = focusChartSize.width;
    let height = focusChartSize.height;
    if (totalCount == 2) {
        width = halfChartSize.width;
        height = halfChartSize.height;
    } else if (totalCount > 2) {
        width = quarterChartSize.width;
        height = quarterChartSize.height;
    }
    // always return 1/3 of the screen as 3 stock width
    return {
        ...chartSettings,
        height: height,
        width: width,
        //width: threeStocksWidth,
    };
    /*

    let stocksCount = Models.getWatchlist().length;
    if (stocksCount == 4 || stocksCount == 1) {
        return chartSettings;
    } else if (stocksCount == 2) {
        return {
            ...chartSettings,
            width: wideWidth
        };
    } else if (stocksCount == 3) {
        if (tabIndex == 0 || tabIndex == 2) {
            return chartSettings;
        } else {
            return {
                ...chartSettings,
                width: wideWidth
            };
        }
    } else if (stocksCount == 5) {
        if (tabIndex % 2 == 0) {
            return {
                ...chartSettings,
                width: threeStocksWidth
            };
        } else {
            return chartSettings;
        }
    } else if (stocksCount == 6) {
        return {
            ...chartSettings,
            width: threeStocksWidth
        };
    } else if (stocksCount == 7) {
        if (tabIndex % 2 == 0) {
            return {
                ...chartSettings,
                width: fourStocksWidth
            };
        } else {
            return {
                ...chartSettings,
                width: threeStocksWidth
            };
        }
    } else if (stocksCount == 8) {
        return {
            ...chartSettings,
            width: fourStocksWidth
        };
    }*/
}

export const candlestickSeriesSettings = {
    //upColor: '#08b265',
    //downColor: '#fb3434',// 'rgb(255,82,82)',
    //wickUpColor: '#08b265',// '#26a69a',// 'rgb(38,166,154)',
    //wickDownColor: '#fb3434',// '#ac2e2e',//'rgb(255,82,82)',
    borderVisible: false,
    scaleMargins: {
        top: 0,
        bottom: 0.3,
    },
};
export const volumeSeriesSettings: any = {
    color: defaultVolumeColor,
    priceFormat: {
        type: 'volume',
    },
    priceScaleId: '',
    scaleMargins: {
        top: 0.89,
        bottom: 0,
    },
    priceLineVisible: false
};
export const vwapSettings: any = {
    color: '#6a1b9a',
    lineWidth: 1,
    crosshairMarkerVisible: false,
    autoscaleInfoProvider: () => null,
    priceLineVisible: false
};
export const ma5Settings: any = {
    color: 'black',
    lineWidth: 1,
    crosshairMarkerVisible: false,
    autoscaleInfoProvider: () => null,
    priceLineVisible: false
};
export const ma9Settings: any = {
    color: 'black',
    lineWidth: 1,
    crosshairMarkerVisible: false,
    autoscaleInfoProvider: () => null,
    priceLineVisible: false
};
export const openPriceSettings: any = {
    color: blueColor,
    lineWidth: 1,
    crosshairMarkerVisible: false,
    autoscaleInfoProvider: () => null,
    priceLineVisible: false
};

export const cloudAreaCandleSettings = {
    upColor: '#EFEBE9',
    downColor: '#EFEBE9',
    wickUpColor: '#EFEBE9',
    wickDownColor: '#EFEBE9',
    borderVisible: false,
    lastValueVisible: false,
    autoscaleInfoProvider: () => null,
    priceLineVisible: false
};

export const keyAreaCandleSettings = {
    upColor: '#E8F5E9',
    downColor: '#FFEBEE',
    wickUpColor: '#E8F5E9',
    wickDownColor: '#FFEBEE',
    borderVisible: false,
    lastValueVisible: false,
    autoscaleInfoProvider: () => null,
    priceLineVisible: false
};
export const cloudLineSettings: any = {
    color: 'rgba(17, 17 ,31,0.7)',
    lineWidth: 2,
    crosshairMarkerVisible: false,
    autoscaleInfoProvider: () => null,
    lastValueVisible: false,
    lineStyle: 3, //LightweightCharts.LineStyle.LargeDashed,
    priceLineVisible: false
};

export const preMarketLineSettings: any = {
    color: 'black',
    lineWidth: 1,
    autoscaleInfoProvider: () => null,
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false
};

export const openRangeLineSettings: any = {
    lineWidth: 1,
    crosshairMarkerVisible: false,
    priceLineVisible: false,
    lastValueVisible: false,
    autoscaleInfoProvider: () => null
};

export const camPivotLevels = [
    { key: "R4", color: "#90EE90", lineWidth: 2 }, // Light Green
    { key: "R3", color: "#00FF00", lineWidth: 2 }, // Green
    { key: "R2", color: "#006400", lineWidth: 1 }, // Dark Green
    { key: "R1", color: "#006400", lineWidth: 1 }, // Dark Green
    { key: "R5", color: "#00FFFF", lineWidth: 1 }, // Cyan
    { key: "R6", color: "#00FFFF", lineWidth: 1 }, // Cyan
    { key: "S4", color: "#FFC0CB", lineWidth: 2 }, // Pink
    { key: "S3", color: "#FF0000", lineWidth: 2 }, // Red
    { key: "S2", color: "#8B0000", lineWidth: 1 }, // Dark Red
    { key: "S1", color: "#8B0000", lineWidth: 1 }, // Dark Red
    { key: "S5", color: "#FF00FF", lineWidth: 1 }, // Magenta
    { key: "S6", color: "#FF00FF", lineWidth: 1 }, // Magenta
];
