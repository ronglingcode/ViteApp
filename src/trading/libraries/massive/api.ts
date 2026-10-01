import type { HttpPort } from '../../ports/http.ts';
import type { Candle } from '../../models/market.ts';
import { addDays } from '../../runtime/marketClock.ts';
import { mapAggregate } from './mapper.ts';
import { calculatePremarketVolume } from '../../core/marketdata/premarketVolume.ts';

/** Matching Java client: same ranges, pagination, empty results, and numeric mapping. */
export class MassiveApi {
    private readonly http: HttpPort;
    private readonly apiKey: () => string;
    private readonly base: string;
    constructor(http: HttpPort, apiKey: () => string, base = 'https://api.massive.com') {
        this.http = http; this.apiKey = apiKey; this.base = base;
    }

    private authenticatedUrl(path: string): string {
        const url = new URL(path, this.base);
        if (url.origin !== new URL(this.base).origin) throw new Error('Massive pagination returned another host');
        url.searchParams.set('apiKey', this.apiKey());
        return url.toString();
    }

    private async read(path: string): Promise<Record<string, any>> {
        const response = await this.http.request(this.authenticatedUrl(path), 'GET', {}, undefined);
        if (response.status !== 200) throw new Error(`Massive read HTTP ${response.status}`);
        let json: Record<string, any>;
        try { json = JSON.parse(response.body); } catch { throw new Error('Massive read returned invalid JSON'); }
        if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Massive read returned invalid JSON object');
        if (json.status === 'ERROR' || json.status === 'NOT_AUTHORIZED') throw new Error(`Massive read failed: ${json.status}`);
        return json;
    }

    async getBars(symbol: string, path: string): Promise<Candle[]> {
        const bars = new Map<number, Candle>();
        const seen = new Set<string>();
        let next = path;
        while (next) {
            const page = this.authenticatedUrl(next);
            if (seen.has(page)) throw new Error('Massive repeated pagination cursor');
            seen.add(page);
            const json = await this.read(page);
            // The API omits results when no eligible trades occurred.
            if (json.results !== undefined && !Array.isArray(json.results)) throw new Error('Massive read returned invalid results');
            for (const result of json.results ?? []) {
                const candle = mapAggregate(symbol, result);
                bars.set(candle.datetime, candle);
            }
            next = typeof json.next_url === 'string' ? json.next_url : '';
        }
        return [...bars.values()].sort((a, b) => a.datetime - b.datetime);
    }

    private aggregatePath(symbol: string, timeframe: number, timespan: string, start: string, end: string, limit: number): string {
        if (!Number.isInteger(timeframe) || timeframe <= 0) throw new Error('Invalid Massive timeframe');
        return `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${timeframe}/${timespan}/${start}/${end}?adjusted=true&sort=asc&limit=${limit}`;
    }

    getPriceHistory(symbol: string, timeframe: number, today: string): Promise<Candle[]> {
        return this.getBars(symbol, this.aggregatePath(symbol, timeframe, 'minute', today, addDays(today, 1), 50000));
    }

    getPriceHistoryFromOldDateForHigherTimeframe(symbol: string, timeframe: number, start: string, end: string): Promise<Candle[]> {
        return this.getBars(symbol, this.aggregatePath(symbol, timeframe, 'minute', start, end, 50000));
    }

    getDailyCandlesForLastNDays(symbol: string, nDays: number, endDateExcluded: string): Promise<Candle[]> {
        const end = addDays(endDateExcluded, -1);
        return this.getBars(symbol, this.aggregatePath(symbol, 1, 'day', addDays(end, -nDays - 1), end, 50000));
    }

    async getSharesOutstanding(symbol: string): Promise<number> {
        const json = await this.read(`/v3/reference/tickers/${encodeURIComponent(symbol)}`);
        const shares = json.results?.weighted_shares_outstanding || json.results?.share_class_shares_outstanding || 0;
        return typeof shares === 'number' && Number.isFinite(shares) ? shares : 0;
    }

    async getFullPriceHistory(symbol: string, today: string) {
        const today1MinuteBars = await this.getPriceHistory(symbol, 1, today);
        const dailyBars = await this.getDailyCandlesForLastNDays(symbol, 3 * 365, today);
        const premarketBars = await this.getPriceHistoryFromOldDateForHigherTimeframe(symbol, 30, addDays(today, -20), today);
        return { today1MinuteBars, dailyBars, premarketDollarCollection: calculatePremarketVolume(premarketBars) };
    }
}
