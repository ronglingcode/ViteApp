import type * as LightweightCharts from 'sunrise-tv-lightweight-charts';

// ============================================
// Volume Dots: Trade Clustering
// ============================================

export interface BookmapTrade {
    symbol: string;
    price: number;
    size: number;
    timestamp: number;
    isUptick: boolean;
}

/**
 * A cluster of trades aggregated by time+price proximity.
 * Represents one "volume dot" on the chart.
 */
export interface TradeCluster {
    priceLevel: number;
    timeBucket: number;
    chartTime: LightweightCharts.UTCTimestamp;
    totalSize: number;
    /** Positive = net uptick (green), negative = net downtick (red) */
    netDirection: number;
    tradeCount: number;
    uptickSize: number;
    downtickSize: number;
}

export type ClusterKey = string;

// ============================================
// Heatmap: Order Book / Level 2
// ============================================

export interface OrderBookLevel {
    price: number;
    size: number;
    lastUpdate: number;
}

export interface OrderBookSnapshot {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    lastUpdate: number;
}

// ============================================
// Configuration
// ============================================

export interface BookmapConfig {
    timeBucketSeconds: number;
    priceBucketSize: number;
    minClusterSize: number;
    maxDotRadius: number;
    minDotRadius: number;
    dotOpacity: number;
    maxSharesForScaling: number;

    heatmapEnabled: boolean;
    maxBarWidth: number;
    barOpacity: number;
    heatmapLevels: number;
}

export const DEFAULT_BOOKMAP_CONFIG: BookmapConfig = {
    timeBucketSeconds: 0.5,
    priceBucketSize: 0.01,
    minClusterSize: 500,
    maxDotRadius: 12,
    minDotRadius: 2,
    dotOpacity: 0.7,
    maxSharesForScaling: 50000,

    heatmapEnabled: false,
    maxBarWidth: 60,
    barOpacity: 0.4,
    heatmapLevels: 20,
};
