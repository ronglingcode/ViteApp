import type { HttpPort } from '../../../ports/http.ts';
import { addDays, marketTime } from '../../../core/marketdata/marketClock.ts';

/** Reads only. Orders use time subdivision when a response reaches the vendor cap. */
export class SchwabReadApi {
    private readonly http: HttpPort;
    private readonly base: () => string;
    constructor(http: HttpPort, base = () => 'https://api.schwabapi.com/trader/v1') { this.http = http; this.base = base; }
    private async read(path: string, token: string) {
        const response = await this.http.request(`${this.base().replace(/\/$/, '')}/${path}`, 'GET', { Authorization: `Bearer ${token}`, Accept: 'application/json' });
        if (response.status !== 200) throw new Error(`Schwab read HTTP ${response.status}`);
        try { return JSON.parse(response.body); } catch { throw new Error('Schwab read response is not JSON'); }
    }
    async getAccount(token: string): Promise<Record<string, any>> {
        const accounts = await this.read('accounts?fields=positions', token);
        if (!Array.isArray(accounts) || !accounts[0]?.securitiesAccount) throw new Error('Schwab account response missing securitiesAccount');
        return accounts[0].securitiesAccount;
    }
    async getStreamerInfo(token: string): Promise<Record<string, string>> {
        const data = await this.read('userPreference', token), info = data?.streamerInfo?.[0];
        const fields = ['streamerSocketUrl', 'schwabClientCustomerId', 'schwabClientCorrelId', 'schwabClientChannel', 'schwabClientFunctionId'];
        if (!info || fields.some(field => typeof info[field] !== 'string' || !info[field])) throw new Error('Schwab preferences missing streamer information');
        return Object.fromEntries(fields.map(field => [field, info[field]]));
    }
    async getOrders(account: string, token: string, date: string, useTimeWindows = false, lookbackDays = 0): Promise<Record<string, any>[]> {
        if (!Number.isInteger(lookbackDays) || lookbackDays < 0 || lookbackDays > 59) throw new Error('Order lookback must be 0-59 days');
        const start = Date.parse(`${addDays(date, -lookbackDays)}T00:00:00Z`), end = Date.parse(`${addDays(date, 1)}T00:00:00Z`);
        const orders = new Map<string, Record<string, any>>();
        const window = async (from: number, to: number): Promise<void> => {
            const query = `fromEnteredTime=${encodeURIComponent(new Date(from).toISOString())}&toEnteredTime=${encodeURIComponent(new Date(to).toISOString())}&maxResults=500`;
            const data = await this.read(`accounts/${encodeURIComponent(account)}/orders?${query}`, token);
            const list = Array.isArray(data) ? data : data?.orders;
            if (!Array.isArray(list)) throw new Error('Schwab order response is not an array');
            // Bracket responses can be truncated with far fewer than 500 roots.
            // Conservatively count every nested record (orders, legs, activities)
            // so a large order tree also triggers subdivision.
            if (this.recordCount(list, from, to) >= 500) {
                // Schwab has no page cursor. Split capped ranges, including bursts
                // within one minute. Overlap endpoints and deduplicate by order ID.
                if (to - from <= 1) throw new Error('Schwab orders reached 500 in a one-millisecond window; read may be incomplete');
                const middle = from + Math.floor((to - from) / 2);
                await window(from, middle);
                await window(middle, to);
                return;
            }
            for (const order of list) {
                const id = order.orderId ?? order.orderID;
                if (id === undefined || id === null) throw new Error('Schwab order missing orderId');
                orders.set(String(id), order);
            }
        };
        if (!useTimeWindows) await window(start, end);
        else {
            const today = Date.parse(`${date}T00:00:00Z`);
            // Only pre-split today; older history subdivides on demand.
            if (start < today) await window(start, today);
            for (let from = today; from < end; from += 3600000) {
                const to = from + 3600000;
                // Historical DST determines which UTC hour contains the open.
                if (marketTime(from + 1800000).minutesSinceMarketOpen !== 0) await window(from, to);
                else {
                    await window(from, from + 1800000);
                    for (let cursor = from + 1800000; cursor < to; cursor += 300000) await window(cursor, cursor + 300000);
                }
            }
        }
        return [...orders.values()];
    }
    private recordCount(value: unknown, from: number, to: number, inWindow = true): number {
        if (Array.isArray(value)) return value.reduce((sum, item) => sum + this.recordCount(item, from, to, inWindow), 0);
        if (value && typeof value === 'object') {
            const entered = Date.parse((value as Record<string, any>).enteredTime);
            // Schwab also returns older working trees outside the requested range.
            // Their size must not force endless subdivision of an empty window.
            if (Number.isFinite(entered)) inWindow = entered >= from && entered <= to;
            return (inWindow ? 1 : 0) + Object.values(value).reduce<number>((sum, item) => sum + this.recordCount(item, from, to, inWindow), 0);
        }
        return 0;
    }
}
