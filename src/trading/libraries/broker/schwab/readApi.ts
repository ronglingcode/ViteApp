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
    async getOrders(account: string, token: string, date: string, useTimeWindows = false): Promise<Record<string, any>[]> {
        const start = Date.parse(`${date}T00:00:00Z`), end = Date.parse(`${addDays(date, 1)}T00:00:00Z`);
        const orders = new Map<string, Record<string, any>>();
        const window = async (from: number, to: number, subdivision: number): Promise<void> => {
            const query = `fromEnteredTime=${encodeURIComponent(new Date(from).toISOString())}&toEnteredTime=${encodeURIComponent(new Date(to).toISOString())}&maxResults=500`;
            const data = await this.read(`accounts/${encodeURIComponent(account)}/orders?${query}`, token);
            const list = Array.isArray(data) ? data : data?.orders;
            if (!Array.isArray(list)) throw new Error('Schwab order response is not an array');
            if (list.length >= 500) {
                if (to - from <= 60000) throw new Error('Schwab orders reached 500 in a one-minute window; read may be incomplete');
                for (let cursor = from; cursor < to; cursor += subdivision)
                    await window(cursor, Math.min(to, cursor + subdivision), subdivision >= 3600000 ? 600000 : 60000);
                return;
            }
            for (const order of list) {
                const id = order.orderId ?? order.orderID;
                if (id === undefined || id === null) throw new Error('Schwab order missing orderId');
                orders.set(String(id), order);
            }
        };
        if (!useTimeWindows) await window(start, end, 3600000);
        else {
            // Historical DST determines which UTC hour contains 9:30 Eastern.
            const openHour = Array.from({ length: 24 }, (_, hour) => hour)
                .find(hour => marketTime(start + hour * 3600000 + 1800000).minutesSinceMarketOpen === 0)!;
            for (let hour = 0; hour < 24; hour++) {
                const from = start + hour * 3600000, to = from + 3600000;
                if (hour !== openHour) await window(from, to, 600000);
                else {
                    await window(from, from + 1800000, 60000);
                    for (let cursor = from + 1800000; cursor < to; cursor += 300000) await window(cursor, cursor + 300000, 60000);
                }
            }
        }
        return [...orders.values()];
    }
}
