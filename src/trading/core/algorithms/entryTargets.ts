import { getBookmapSizeThreshold, meetsBookmapSizeThreshold } from './wallThreshold.ts';

export interface EntryWallSnapshot { effectiveWallThreshold?: number; largeBids?: number[][]; largeAsks?: number[][] }
export const calculateEntryTargets = (totalShares: number, entryPrice: number, riskPrice: number,
    isLong: boolean, walls: EntryWallSnapshot | undefined, partialsCount: number,
    round = (value: number) => Math.round(value * 100) / 100) => {
    const target3R = round(entryPrice + (isLong ? 1 : -1) * 3 * Math.abs(entryPrice - riskPrice));
    const threshold = getBookmapSizeThreshold(walls);
    const prices = new Set<number>();
    for (const [price, size] of (isLong ? walls?.largeAsks : walls?.largeBids) ?? []) {
        if (Number.isFinite(price) && meetsBookmapSizeThreshold(size, threshold)
            && (isLong ? price > entryPrice : price < entryPrice)) prices.add(round(price));
    }
    const targets = [...prices].sort((a, b) => isLong ? a - b : b - a).slice(0, 3);
    while (targets.length < partialsCount) targets.push(target3R);
    const normalizedShares = Math.floor(totalShares);
    const base = Math.floor(normalizedShares / partialsCount);
    const remainder = normalizedShares % partialsCount;
    return targets.slice(0, partialsCount).map((target, index) => ({ target, quantity: base + (index < remainder ? 1 : 0) }))
        .filter(target => target.quantity > 0);
};
