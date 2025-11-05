/** ------------------------------------------------------------------------
 *  SimpleRollingWindow
 *  --------------------------------------------------------------------- */

/**
 * Maintains a fixed-size circular buffer of the last N items.
 * No time-based expiration, just keeps the most recent N items.
 */
export class SimpleRollingWindow<T> {
    private readonly maxN: number;
    private datapoints: T[];
    private head = 0;
    private len = 0;

    /**
     * @param maxPoints Maximum number of points to store (default: 300)
     */
    constructor(maxPoints = 300) {
        this.maxN = maxPoints;
        this.datapoints = new Array(maxPoints);
    }

    /** Add a new data point */
    push(datapoint: T): void {
        // Make a deep copy of the datapoint before storing
        const datapointCopy = JSON.parse(JSON.stringify(datapoint));
        this.datapoints[this.head] = datapointCopy;
        this.head = (this.head + 1) % this.maxN;
        this.len = Math.min(this.len + 1, this.maxN);
    }

    /** Returns all currently stored valid items in chronological order */
    getItems(): T[] {
        if (this.len === 0) return [];

        const result = new Array(this.len);
        // Calculate the starting index for the oldest item
        const startIdx = (this.head - this.len + this.maxN) % this.maxN;

        for (let i = 0; i < this.len; i++) {
            const idx = (startIdx + i) % this.maxN;
            result[i] = this.datapoints[idx];
        }


        return result;
    }

    /** Returns the number of items currently stored */
    size(): number {
        return this.len;
    }

    /** True when the window contains at least one data point */
    ready(): boolean {
        return this.len > 0;
    }
} 