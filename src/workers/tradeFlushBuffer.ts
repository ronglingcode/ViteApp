import type * as Models from '../models/models';
import type * as Messages from './marketDataMessages';

const FLUSH_INTERVAL_MS = 100;

/** Merge same-symbol trades in the same M1 bucket into one record (worker-side). */
export const mergeTradesInMinuteBucket = (records: Models.TimeSale[]): Models.TimeSale[] => {
    if (records.length <= 1) {
        return records;
    }
    let sorted = [...records].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    let merged: Models.TimeSale[] = [];
    let group: Models.TimeSale[] = [sorted[0]];

    const flushGroup = () => {
        if (group.length === 1) {
            merged.push(group[0]);
            return;
        }
        let first = group[0];
        let last = group[group.length - 1];
        let totalSize = 0;
        let earliestTradeTime = first.tradeTime ?? first.timestamp;
        for (let record of group) {
            totalSize += record.lastSize ?? 0;
            if (record.tradeTime != null && record.tradeTime < earliestTradeTime) {
                earliestTradeTime = record.tradeTime;
            }
        }
        merged.push({
            ...last,
            lastSize: totalSize,
            tradeTime: earliestTradeTime,
            receivedTime: last.receivedTime,
        });
    };

    for (let i = 1; i < sorted.length; i++) {
        let prevBucket = Math.floor((sorted[i - 1].tradeTime ?? sorted[i - 1].timestamp) / 60_000);
        let bucket = Math.floor((sorted[i].tradeTime ?? sorted[i].timestamp) / 60_000);
        if (bucket === prevBucket) {
            group.push(sorted[i]);
        } else {
            flushGroup();
            group = [sorted[i]];
        }
    }
    flushGroup();
    return merged;
};

type BufferedTrade = Messages.ParsedTrade & { source: Messages.TradeSource };

export class TradeFlushBuffer {
    private pending: BufferedTrade[] = [];
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly post: (message: Messages.WorkerToMainMessage) => void,
        private readonly intervalMs = FLUSH_INTERVAL_MS,
    ) { }

    start() {
        this.stop();
        this.timer = setInterval(() => this.flush(), this.intervalMs);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.pending = [];
    }

    push(trade: Messages.ParsedTrade, source: Messages.TradeSource) {
        this.pending.push({ ...trade, source });
    }

    flush() {
        if (this.pending.length === 0) {
            return;
        }
        let batch = this.pending;
        this.pending = [];

        let bySource = new Map<Messages.TradeSource, BufferedTrade[]>();
        batch.forEach(item => {
            let list = bySource.get(item.source) ?? [];
            list.push(item);
            bySource.set(item.source, list);
        });

        bySource.forEach((items, source) => {
            let bySymbol = new Map<string, Models.TimeSale[]>();
            items.forEach(item => {
                if (item.shouldFilter) {
                    return;
                }
                let list = bySymbol.get(item.record.symbol) ?? [];
                list.push(item.record);
                bySymbol.set(item.record.symbol, list);
            });
            let trades: Messages.ParsedTrade[] = [];
            bySymbol.forEach(records => {
                mergeTradesInMinuteBucket(records).forEach(record => {
                    trades.push({ record, shouldFilter: false });
                });
            });
            if (trades.length > 0) {
                this.post({ type: 'timeSaleFlush', source, trades });
            }
        });
    }
}
