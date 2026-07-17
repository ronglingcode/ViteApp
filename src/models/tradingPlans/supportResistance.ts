import type * as TradingPlansModels from './tradingPlansModels';

export interface NormalizedSupportResistanceBounds {
    low: number,
    high: number,
}

export const getNormalizedBounds = (
    area: TradingPlansModels.SupportResistanceArea,
): NormalizedSupportResistanceBounds => {
    return {
        low: Math.min(area.low, area.high),
        high: Math.max(area.low, area.high),
    };
};

export const hasValidEntryRangeFlag = (
    area: TradingPlansModels.SupportResistanceArea,
): boolean => {
    return area.requireEntryWithinRange === undefined ||
        typeof area.requireEntryWithinRange === 'boolean';
};

export const isEntryPriceAllowed = (
    entryPrice: number,
    isLong: boolean,
    area: TradingPlansModels.SupportResistanceArea,
): boolean => {
    if (!Number.isFinite(entryPrice) ||
        !Number.isFinite(area.low) ||
        !Number.isFinite(area.high) ||
        !hasValidEntryRangeFlag(area)) {
        return false;
    }

    let { low, high } = getNormalizedBounds(area);
    if (area.requireEntryWithinRange === true) {
        return entryPrice >= low && entryPrice <= high;
    }

    // False or omitted preserves the existing one-sided support/resistance behavior.
    return isLong ? entryPrice >= low : entryPrice <= high;
};
