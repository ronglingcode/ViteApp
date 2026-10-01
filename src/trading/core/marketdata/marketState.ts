import type { Candle, Trade } from '../../models/market.ts';
import { marketTime } from './marketClock.ts';
import { typicalPrice } from './premarketVolume.ts';
import { calculateLiquidityScale } from './liquidity.ts';

export interface VwapCorrection { volumeSum: number; tradingSum: number }
type Bucket = Candle & { firstTradeTime: number; lastTradeTime: number; dollars: number };

/** Pure market state: no chart, network, timers or Bookmap dependency. */
export class MarketState {
    private readonly symbol: string;
    private readonly date: string;
    private readonly marketCap: number;
    private readonly buckets = new Map<number, Bucket>();
    private readonly seen = new Set<string>();
    private readonly vwaps = new Map<number, number>();
    private liveFrom = 0;
    private totalVolume = 0;
    private totalDollars = 0;
    private premarketDollars = 0;
    private currentPrice = 0;
    private latestPriceTime = 0;
    private latestBucketTime = 0;
    private firstRegularBucketTime = 0;
    private highOfDay = 0;
    private lowOfDay = 0;
    private premarketHigh = 0;
    private premarketLow = 0;
    private lockedAtMax = false;
    private liquidityScale = 0;
    private correction: VwapCorrection = { volumeSum: 0, tradingSum: 0 };
    private corrected = false;
    constructor(symbol: string, date: string, marketCapInMillions: number) {
        this.symbol = symbol; this.date = date; this.marketCap = marketCapInMillions;
    }

    /** Only complete history buckets precede liveFrom. Backfill individual prints from liveFrom. */
    initialize(history: Candle[], liveFrom: number, correction: VwapCorrection = { volumeSum: 0, tradingSum: 0 }): void {
        this.buckets.clear(); this.seen.clear(); this.vwaps.clear(); this.liveFrom = liveFrom;
        this.totalVolume = this.totalDollars = this.premarketDollars = this.currentPrice = this.latestPriceTime = 0;
        this.latestBucketTime = 0;
        this.firstRegularBucketTime = 0;
        this.highOfDay = this.lowOfDay = this.premarketHigh = this.premarketLow = 0;
        this.lockedAtMax = false;
        this.correction = correction; this.corrected = false;
        const bars = new Map(history.map(candle => [candle.datetime, candle]));
        for (const candle of [...bars.values()].sort((a, b) => a.datetime - b.datetime)) {
            const time = marketTime(candle.datetime);
            if (time.date !== this.date || time.minutesSinceMarketOpen < -510 || candle.datetime + 60000 > liveFrom) continue;
            this.applyCorrection(time.minutesSinceMarketOpen);
            const dollars = candle.volume * typicalPrice(candle);
            this.buckets.set(candle.datetime, { ...candle, dollars, firstTradeTime: candle.datetime, lastTradeTime: candle.datetime + 59999 });
            this.latestBucketTime = candle.datetime;
            if (!time.isPremarket && !this.firstRegularBucketTime) this.firstRegularBucketTime = candle.datetime;
            this.totalVolume += candle.volume; this.totalDollars += dollars;
            if (time.isPremarket) this.premarketDollars += dollars;
            this.updateLevels(candle.high, candle.low, time.isPremarket);
            this.currentPrice = candle.close; this.latestPriceTime = candle.datetime + 59999;
            this.vwaps.set(candle.datetime, this.totalVolume > 0 ? this.totalDollars / this.totalVolume : 0);
        }
        this.updateLiquidity();
    }

    applyTrade(trade: Trade): boolean {
        const time = marketTime(trade.timestamp), bucketTime = Math.floor(trade.timestamp / 60000) * 60000;
        if (trade.symbol !== this.symbol || time.date !== this.date || time.minutesSinceMarketOpen < -510 || trade.timestamp < this.liveFrom || trade.price <= 0 || trade.size <= 0) return false;
        const latestBucket = this.latestBucketTime;
        if (bucketTime < latestBucket) return false; // a closed candle is immutable to live prints
        const key = trade.sequence !== undefined ? `q:${trade.sequence}` : trade.id === undefined ? '' : `i:${trade.exchange ?? ''}:${trade.id}`;
        if (bucketTime > latestBucket) this.seen.clear();
        if (key && this.seen.has(key)) return false;
        if (key) this.seen.add(key);
        let candle = this.buckets.get(bucketTime);
        this.applyCorrection(time.minutesSinceMarketOpen);
        if (!candle) {
            candle = { symbol: this.symbol, datetime: bucketTime, open: trade.price, high: trade.price, low: trade.price, close: trade.price,
                volume: 0, vwap: 0, dollars: 0, firstTradeTime: trade.timestamp, lastTradeTime: trade.timestamp };
            this.buckets.set(bucketTime, candle);
            this.latestBucketTime = bucketTime;
            if (!time.isPremarket && !this.firstRegularBucketTime) this.firstRegularBucketTime = bucketTime;
        }
        if (trade.timestamp < candle.firstTradeTime) { candle.open = trade.price; candle.firstTradeTime = trade.timestamp; }
        if (trade.timestamp >= candle.lastTradeTime) { candle.close = trade.price; candle.lastTradeTime = trade.timestamp; }
        candle.high = Math.max(candle.high, trade.price); candle.low = Math.min(candle.low, trade.price);
        candle.volume += trade.size; candle.dollars += trade.price * trade.size; candle.vwap = candle.dollars / candle.volume;
        this.totalVolume += trade.size; this.totalDollars += trade.price * trade.size;
        if (time.isPremarket) this.premarketDollars += trade.price * trade.size;
        this.updateLevels(trade.price, trade.price, time.isPremarket);
        if (trade.timestamp >= this.latestPriceTime) { this.currentPrice = trade.price; this.latestPriceTime = trade.timestamp; }
        this.vwaps.set(bucketTime, this.totalDollars / this.totalVolume); this.updateLiquidity(); return true;
    }
    private applyCorrection(minutesSinceMarketOpen: number) {
        if (!this.corrected && minutesSinceMarketOpen >= -30 && minutesSinceMarketOpen < 0 && this.correction.volumeSum > 0 && this.correction.tradingSum > 0) {
            this.totalVolume = this.correction.volumeSum; this.totalDollars = this.correction.tradingSum;
            this.premarketDollars = this.correction.tradingSum; this.corrected = true;
        }
    }
    private updateLevels(high: number, low: number, premarket: boolean) {
        high = Math.ceil(high * 100) / 100; low = Math.floor(low * 100) / 100;
        if (premarket) { this.premarketHigh = Math.max(this.premarketHigh, high); this.premarketLow = this.premarketLow ? Math.min(this.premarketLow, low) : low; }
        else { this.highOfDay = Math.max(this.highOfDay, high); this.lowOfDay = this.lowOfDay ? Math.min(this.lowOfDay, low) : low; }
    }
    private updateLiquidity() {
        if (this.lockedAtMax) { this.liquidityScale = 1; return; }
        const candles = [...this.buckets.values()];
        const regular = candles.filter(candle => !marketTime(candle.datetime).isPremarket);
        const premarket = candles.filter(candle => marketTime(candle.datetime).isPremarket);
        this.liquidityScale = calculateLiquidityScale(this.currentPrice, regular.map(candle => candle.volume), premarket.at(-1)?.volume ?? 0, this.marketCap, this.lockedAtMax);
        if (this.liquidityScale === 1) this.lockedAtMax = true;
    }
    metrics() {
        const latest = this.buckets.get(this.latestBucketTime);
        const candle: Candle | undefined = latest ? {
            symbol: latest.symbol, datetime: latest.datetime, open: latest.open, high: latest.high, low: latest.low,
            close: latest.close, volume: latest.volume, vwap: latest.vwap,
        } : undefined;
        const closedTime = [...this.vwaps.keys()].at(-2);
        return {
            ...(closedTime === undefined ? {} : { closedVwap: { datetime: closedTime, value: this.vwaps.get(closedTime)! } }),
            currentPrice: this.currentPrice, vwap: this.totalVolume ? this.totalDollars / this.totalVolume : 0,
            totalVolume: this.totalVolume, totalTradingAmount: this.totalDollars, premarketDollarTraded: this.premarketDollars,
            highOfDay: this.highOfDay, lowOfDay: this.lowOfDay, premarketHigh: this.premarketHigh, premarketLow: this.premarketLow,
            openPrice: this.buckets.get(this.firstRegularBucketTime)?.open ?? this.currentPrice,
            liquidityScale: this.liquidityScale, liquidityScaleLockedAtMax: this.lockedAtMax,
            candle, firstTradeTime: latest?.firstTradeTime ?? 0, latestPriceTime: this.latestPriceTime,
        };
    }
    snapshot() {
        const candles: Candle[] = [...this.buckets.values()].map(({ firstTradeTime: _first, lastTradeTime: _last, dollars: _dollars, ...candle }) => ({ ...candle }));
        return { symbol: this.symbol, date: this.date, candles,
            vwaps: [...this.vwaps].map(([datetime, value]) => ({ datetime, value })),
            currentPrice: this.currentPrice, vwap: this.totalVolume ? this.totalDollars / this.totalVolume : 0,
            totalVolume: this.totalVolume, totalTradingAmount: this.totalDollars, premarketDollarTraded: this.premarketDollars,
            highOfDay: this.highOfDay, lowOfDay: this.lowOfDay, premarketHigh: this.premarketHigh, premarketLow: this.premarketLow,
            openPrice: candles.find(candle => !marketTime(candle.datetime).isPremarket)?.open ?? this.currentPrice,
            liquidityScale: this.liquidityScale, liquidityScaleLockedAtMax: this.lockedAtMax };
    }
}
