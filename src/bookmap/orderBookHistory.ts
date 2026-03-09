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
 * Stores time-series history of order book snapshots for heatmap rendering.
 * Each incoming snapshot is converted to a compact BookSlice and appended.
 */
export class OrderBookHistory {
    private slices: BookSlice[] = [];
    private maxSlices: number;

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

    clear(): void {
        this.slices = [];
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
