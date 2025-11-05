/** ------------------------------------------------------------------------
 *  RollingWindow
 *  --------------------------------------------------------------------- */

/**
 * Maintains the average datapoints and its sample standard-deviation over a
 * sliding window of W seconds while capping memory at MAX_N points.
 */
export class RollingWindow {
    private readonly windowMs: number;
    private readonly maxN: number;

    private datapoints: number[];      // ring buffer for spreads
    private times: number[];        // matching timestamps
    private head = 0;               // next write index
    private len = 0;                // current # of elements

    private sum = 0;                // Σ datapoints
    private sum2 = 0;               // Σ datapoints²

    /**
     * @param windowSec Window length in seconds (default: 60 s)
     * @param maxPoints Maximum stored quotes (default: 300)
     */
    constructor(windowSec = 60, maxPoints = 300) {
        this.windowMs = windowSec * 1000;
        this.maxN = maxPoints;
        this.datapoints = new Array(maxPoints);
        this.times = new Array(maxPoints);
    }

    /** Add a new data point */
    push(datapoint: number): void {
        const ts = Date.now();

        // 1. Evict items that fell out of the time window
        while (
            this.len &&
            ts - this.times[(this.head - this.len + this.maxN) % this.maxN] >
            this.windowMs
        ) {
            this.popOldest();
        }

        // 2. If buffer is full, drop the oldest to respect maxN
        if (this.len === this.maxN) this.popOldest();

        // 3. Insert the new point
        const datapointCopy = JSON.parse(JSON.stringify(datapoint));
        this.datapoints[this.head] = datapointCopy;
        this.times[this.head] = ts;
        this.head = (this.head + 1) % this.maxN;
        this.len++;

        // 4. Update running sums
        this.sum += datapoint;
        this.sum2 += datapoint * datapoint;
    }

    /** True when the monitor contains at least two data points. */
    ready(): boolean {
        return this.len > 1;
    }

    /** Average spread in the current window. */
    avg(): number {
        return this.ready() ? this.sum / this.len : NaN;
    }

    /** Sample standard deviation of spread in the current window. */
    vol(): number {
        if (!this.ready()) return NaN;
        const mean = this.avg();
        const variance = Math.max(this.sum2 - this.len * mean * mean, 0) /
            (this.len - 1);
        return Math.sqrt(variance);
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private popOldest(): void {
        const idx = (this.head - this.len + this.maxN) % this.maxN;
        const s = this.datapoints[idx];
        this.sum -= s;
        this.sum2 -= s * s;
        this.len--;
    }

    public debugString(): void {
        console.log(`length: ${this.len}`);
        console.log(this.datapoints);
    }
}
