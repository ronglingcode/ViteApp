import type { Candle, PremarketDollarCollection } from '../../models/market.ts';
import { marketTime } from './marketClock.ts';

export function typicalPrice(candle: Pick<Candle, 'vwap' | 'low' | 'high' | 'close'>): number {
    return candle.vwap > 0 && candle.vwap >= candle.low && candle.vwap <= candle.high
        ? candle.vwap : (candle.high + candle.low + candle.close) / 3;
}

export function calculatePremarketVolume(candles: Candle[]): PremarketDollarCollection {
    const days = new Map<string, { dollar: number; shares: number }>();
    for (const candle of candles) {
        const time = marketTime(candle.datetime);
        if (!time.isPremarket) continue;
        const day = days.get(time.date) ?? { dollar: 0, shares: 0 };
        day.dollar += Math.round(typicalPrice(candle) * candle.volume);
        day.shares += candle.volume;
        days.set(time.date, day);
    }
    const entries = [...days].sort(([a], [b]) => a.localeCompare(b));
    const latest = entries.pop()?.[1];
    const previousDaysDollar = entries.map(([day, value]) => ({ day, data: value.dollar }));
    const previousDaysShares = entries.map(([day, value]) => ({ day, data: value.shares }));
    const dollars = previousDaysDollar.map(value => value.data).sort((a, b) => a - b);
    const middle = Math.floor(dollars.length / 2);
    const median = dollars.length === 0 ? 0 : dollars.length % 2 ? dollars[middle] : (dollars[middle - 1] + dollars[middle]) / 2;
    const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return {
        previousDaysDollar, previousDaysShares,
        previousDaysDollarAverage: average(previousDaysDollar.map(value => value.data)),
        previousDaysSharesAverage: average(previousDaysShares.map(value => value.data)),
        previousDaysDollarMedian: median,
        lastDayDollar: latest?.dollar ?? 0, lastDayShares: latest?.shares ?? 0,
        rvol: median > 0 ? (latest?.dollar ?? 0) / median : 0,
    };
}
