import type { Candle } from '../../models/market.ts';
import { marketTime } from './marketClock.ts';

// These symbols may trade without meeting the premarket volume thresholds.
export const premarketVolumeWhitelist: readonly string[] = ['AMD', 'MU'];
export function isPremarketVolumeWhitelisted(symbol: string): boolean {
    return premarketVolumeWhitelist.includes(symbol);
}

export function premarketEligibility(lastDayShares: number, previousDaysSharesAverage: number,
    hardFloor: number, absoluteThresholdInMillions: number, relativeThreshold: number) {
    return {
        hardFloorPassed: lastDayShares >= hardFloor,
        absolutePassed: lastDayShares / 1000000 >= absoluteThresholdInMillions,
        relativePassed: Number.isFinite(previousDaysSharesAverage) && previousDaysSharesAverage > 0 && Number.isFinite(lastDayShares)
            && lastDayShares >= previousDaysSharesAverage * relativeThreshold,
    };
}
export function impliedMarketCapInBillions(shares: number, price: number): number {
    return price > 0 && shares > 0 ? Math.round(shares * price / 10000000) / 100 : 0;
}
export function validatePreviousConsolidationArea(area: { low: number; high: number } | undefined, candles: Candle[]): string {
    if (!candles.length) return '';
    const low = area ? Math.min(area.low, area.high) : 0, high = area ? Math.max(area.low, area.high) : 0;
    if (!area || !Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || low >= high)
        return 'missing previous consolidation area for range bound reversal';
    for (const candle of candles.slice(-3)) {
        if (candle.open < low || candle.open > high) continue;
        if (candle.close > high || candle.close < low) {
            const direction = candle.close > high ? 'breakout' : 'breakdown';
            return `previous consolidation ${direction} on ${marketTime(candle.datetime).date}: open ${candle.open} inside [${low}, ${high}], close ${candle.close}`;
        }
    }
    return '';
}
