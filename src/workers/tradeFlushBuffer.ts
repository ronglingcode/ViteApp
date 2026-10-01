import type * as Models from '../models/models';
import type * as Messages from './marketDataMessages';

const FLUSH_INTERVAL_MS = 100;

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

            let trades: Messages.ParsedTrade[] = items
                .filter(item => item.shouldFilter)
                .map(item => ({ record: item.record, shouldFilter: true }));

            bySymbol.forEach(records => {
                records.forEach(record => {
                    trades.push({ record, shouldFilter: false });
                });
            });

            trades.sort((a, b) => (a.record.timestamp ?? 0) - (b.record.timestamp ?? 0));
            if (trades.length > 0) {
                this.post({ type: 'timeSaleFlush', source, trades });
            }
        });
    }
}
