import type { OrderBookSnapshot } from './bookmapModels';

/**
 * A single time-stamped snapshot of the order book,
 * stored as a Map<price, size> for fast lookup during rendering.
 */
export interface BookSlice {
    timestamp: number;
    levels: Map<number, number>; // price → total size (bids + asks combined)
}

/**
 * Best bid/ask price at a point in time, filtered by size percentile.
 */
export interface BidAskPoint {
    timestamp: number;
    bestBid: number | null;
    bestAsk: number | null;
}

/**
 * Stores time-series history of order book snapshots for heatmap rendering.
 * Each incoming snapshot is converted to a compact BookSlice and appended.
 */
export class OrderBookHistory {
    private slices: BookSlice[] = [];
    private bidAskPoints: BidAskPoint[] = [];
    private maxSlices: number;

    // Rolling threshold for bid/ask lines — recalculated periodically from recent snapshots
    private bidAskThreshold: number = 0;
    private bidAskSizeBuffer: number[] = [];
    private lastThresholdRecalc: number = 0;
    private static readonly THRESHOLD_RECALC_MS = 2000;
    private static readonly SIZE_BUFFER_MAX = 5000;

    constructor(maxSlices: number = 10000) {
        this.maxSlices = maxSlices;
    }

    addSnapshot(snapshot: OrderBookSnapshot): void {
        let levels = new Map<number, number>();

        for (let level of snapshot.bids) {
            levels.set(level.price, (levels.get(level.price) || 0) + level.size);
        }
        for (let level of snapshot.asks) {
            levels.set(level.price, (levels.get(level.price) || 0) + level.size);
        }

        this.slices.push({
            timestamp: snapshot.lastUpdate,
            levels,
        });

        // Prune old slices
        if (this.slices.length > this.maxSlices) {
            this.slices.splice(0, this.slices.length - this.maxSlices);
        }
    }

    /**
     * Get all slices within the given time range.
     */
    getSlicesInRange(timeFrom: number, timeTo: number): BookSlice[] {
        // Binary search for start index
        let startIdx = this.lowerBound(timeFrom);
        let result: BookSlice[] = [];
        for (let i = startIdx; i < this.slices.length; i++) {
            if (this.slices[i].timestamp > timeTo) break;
            result.push(this.slices[i]);
        }
        return result;
    }

    /**
     * Get the size at a specific price for the nearest slice to the given timestamp.
     */
    getSizeAt(timestamp: number, price: number): number {
        let idx = this.nearestIndex(timestamp);
        if (idx < 0) return 0;
        return this.slices[idx].levels.get(price) || 0;
    }

    get length(): number {
        return this.slices.length;
    }

    /**
     * Extract best bid/ask from a snapshot, filtered by a rolling 90th percentile
     * size threshold computed across recent snapshots. This keeps the line stable
     * by using a consistent threshold rather than per-snapshot percentiles.
     */
    addBidAskPoint(snapshot: OrderBookSnapshot): void {
        // Feed sizes into rolling buffer
        for (let level of snapshot.bids) {
            if (level.size > 0) this.bidAskSizeBuffer.push(level.size);
        }
        for (let level of snapshot.asks) {
            if (level.size > 0) this.bidAskSizeBuffer.push(level.size);
        }
        if (this.bidAskSizeBuffer.length > OrderBookHistory.SIZE_BUFFER_MAX) {
            this.bidAskSizeBuffer.splice(0, this.bidAskSizeBuffer.length - OrderBookHistory.SIZE_BUFFER_MAX);
        }

        // Recalculate threshold periodically from the rolling buffer
        let now = snapshot.lastUpdate;
        if (now - this.lastThresholdRecalc > OrderBookHistory.THRESHOLD_RECALC_MS
            && this.bidAskSizeBuffer.length >= 20) {
            this.lastThresholdRecalc = now;
            let sorted = this.bidAskSizeBuffer.slice().sort((a, b) => a - b);
            let p90Idx = Math.floor(sorted.length * 0.90);
            this.bidAskThreshold = sorted[Math.min(p90Idx, sorted.length - 1)];
        }

        let bestBid: number | null = null;
        let bestAsk: number | null = null;
        let threshold = this.bidAskThreshold;

        if (threshold > 0) {
            for (let level of snapshot.bids) {
                if (level.size >= threshold) {
                    if (bestBid === null || level.price > bestBid) {
                        bestBid = level.price;
                    }
                }
            }
            for (let level of snapshot.asks) {
                if (level.size >= threshold) {
                    if (bestAsk === null || level.price < bestAsk) {
                        bestAsk = level.price;
                    }
                }
            }
        }

        this.bidAskPoints.push({
            timestamp: now,
            bestBid,
            bestAsk,
        });

        if (this.bidAskPoints.length > this.maxSlices) {
            this.bidAskPoints.splice(0, this.bidAskPoints.length - this.maxSlices);
        }
    }

    getBidAskPointsInRange(timeFrom: number, timeTo: number): BidAskPoint[] {
        let startIdx = this.bidAskLowerBound(timeFrom);
        let result: BidAskPoint[] = [];
        for (let i = startIdx; i < this.bidAskPoints.length; i++) {
            if (this.bidAskPoints[i].timestamp > timeTo) break;
            result.push(this.bidAskPoints[i]);
        }
        return result;
    }

    clear(): void {
        this.slices = [];
        this.bidAskPoints = [];
        this.bidAskSizeBuffer = [];
        this.bidAskThreshold = 0;
        this.lastThresholdRecalc = 0;
    }

    private lowerBound(timestamp: number): number {
        let lo = 0, hi = this.slices.length;
        while (lo < hi) {
            let mid = (lo + hi) >> 1;
            if (this.slices[mid].timestamp < timestamp) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    private bidAskLowerBound(timestamp: number): number {
        let lo = 0, hi = this.bidAskPoints.length;
        while (lo < hi) {
            let mid = (lo + hi) >> 1;
            if (this.bidAskPoints[mid].timestamp < timestamp) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    private nearestIndex(timestamp: number): number {
        if (this.slices.length === 0) return -1;
        let idx = this.lowerBound(timestamp);
        if (idx >= this.slices.length) return this.slices.length - 1;
        if (idx === 0) return 0;
        let prev = this.slices[idx - 1];
        let curr = this.slices[idx];
        return (timestamp - prev.timestamp < curr.timestamp - timestamp) ? idx - 1 : idx;
    }
}
