import type { TradeCluster, ClusterKey, BookmapConfig } from './bookmapModels';
import type * as LightweightCharts from 'sunrise-tv-lightweight-charts';
import * as Helper from '../utils/helper';

/**
 * Manages trade clustering for one symbol.
 * Trades are bucketed by time (N-second intervals) and price (tick-size bins).
 */
export class TradeClusterer {
    private clusters: Map<ClusterKey, TradeCluster> = new Map();
    public lastTradePrice: number = 0;
    private config: BookmapConfig;

    constructor(config: BookmapConfig) {
        this.config = config;
    }

    private makeKey(timeBucket: number, priceLevel: number): ClusterKey {
        return `${timeBucket}|${priceLevel}`;
    }

    private priceToBucket(price: number): number {
        return Math.round(price / this.config.priceBucketSize) * this.config.priceBucketSize;
    }

    private timeToBucket(timestamp: number): number {
        let bucketMs = this.config.timeBucketSeconds * 1000;
        return Math.floor(timestamp / bucketMs) * bucketMs;
    }

    addTrade(price: number, size: number, timestamp: number): TradeCluster {
        let priceLevel = this.priceToBucket(price);
        let timeBucket = this.timeToBucket(timestamp);
        let key = this.makeKey(timeBucket, priceLevel);

        let isUptick = price >= this.lastTradePrice;
        if (this.lastTradePrice === 0) isUptick = true;
        this.lastTradePrice = price;

        let existing = this.clusters.get(key);
        if (existing) {
            existing.totalSize += size;
            existing.tradeCount++;
            if (isUptick) {
                existing.uptickSize += size;
                existing.netDirection += size;
            } else {
                existing.downtickSize += size;
                existing.netDirection -= size;
            }
            return existing;
        } else {
            let bucketDate = new Date(timeBucket);
            bucketDate.setSeconds(0, 0);
            let chartTime = Helper.jsDateToUTC(bucketDate);

            let cluster: TradeCluster = {
                priceLevel: priceLevel,
                timeBucket: timeBucket,
                chartTime: chartTime,
                totalSize: size,
                netDirection: isUptick ? size : -size,
                tradeCount: 1,
                uptickSize: isUptick ? size : 0,
                downtickSize: isUptick ? 0 : size,
            };
            this.clusters.set(key, cluster);
            return cluster;
        }
    }

    getAllClusters(): TradeCluster[] {
        return Array.from(this.clusters.values());
    }

    getVisibleClusters(): TradeCluster[] {
        let result: TradeCluster[] = [];
        this.clusters.forEach(cluster => {
            if (cluster.totalSize >= this.config.minClusterSize) {
                result.push(cluster);
            }
        });
        return result;
    }

    clear(): void {
        this.clusters.clear();
        this.lastTradePrice = 0;
    }

    pruneOlderThan(cutoffMs: number): void {
        this.clusters.forEach((_cluster, key) => {
            let timeBucket = parseInt(key.split('|')[0]);
            if (timeBucket < cutoffMs) {
                this.clusters.delete(key);
            }
        });
    }

    updateConfig(config: Partial<BookmapConfig>): void {
        this.config = { ...this.config, ...config };
    }
}
