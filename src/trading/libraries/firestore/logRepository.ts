import { FirestoreApi } from './api.ts';
import { marketTime } from '../../core/marketdata/marketClock.ts';

export class LogRepository {
    private readonly api: FirestoreApi;
    private readonly profile: () => string;
    private readonly now: () => number;
    constructor(api: FirestoreApi, profile: () => string, now = Date.now) { this.api = api; this.profile = profile; this.now = now; }
    private metadata(days: number) {
        const now = this.now();
        const [year, month, day] = marketTime(now).date.split('-').map(Number);
        const timestamp = (time: number) => ({ seconds: Math.floor(time / 1000), nanoseconds: (time % 1000) * 1000000 });
        return { timestamp: timestamp(now), dateStr: `${year}-${month}-${day}`, expiredAt: timestamp(now + days * 86400000) };
    }
    log(type: string, msg: unknown, tags: Record<string, unknown> = {}) {
        return this.api.addDocument(`${this.profile()}-Logs`, { msg: JSON.stringify(msg), type, ...this.metadata(7), ...tags });
    }
    logOrder(order: unknown, tags: Record<string, unknown> = {}) {
        return this.api.addDocument(`${this.profile()}-Orders`, { ...this.metadata(7), logOrder: JSON.stringify(order), ...tags });
    }
    logBreakoutTradeState(symbol: string, state: Record<string, unknown>) {
        return this.api.addDocument('BreakoutTradeState', { symbol, ...this.metadata(3), ...state });
    }
}
