import { getFirstSmallestQuantityExitPairIndex } from '../utils/exitPairSelection.ts';

export const WALL_OUT_MINIMUM_SIZE = 5_000;
const WALL_OUT_OFFSET = 0.02;

export interface WallOutSnapshot {
    priceUnit: 'real';
    tickSize: number;
    largeBids?: number[][];
    largeAsks?: number[][];
}

/** Fixed 5k floor, independent of the adaptive wall threshold used for entries. */
export function wallOutTarget(isLong: boolean, snapshot: WallOutSnapshot) {
    if (snapshot?.priceUnit !== 'real' || !Number.isFinite(snapshot.tickSize) || snapshot.tickSize <= 0) {
        throw new Error('Bookmap order book is not ready');
    }
    const walls = ((isLong ? snapshot.largeAsks : snapshot.largeBids) ?? [])
        .filter(([price, size]) => Number.isFinite(price) && price > 0
            && Number.isFinite(size) && size >= WALL_OUT_MINIMUM_SIZE)
        .sort(([a], [b]) => isLong ? a - b : b - a);
    const wall = walls[0];
    if (!wall) throw new Error(`No ${isLong ? 'offer' : 'bid'} wall of at least 5,000 lots`);
    const offsetTicks = Math.max(1, Math.ceil(WALL_OUT_OFFSET / snapshot.tickSize - 1e-9));
    const targetPrice = Math.round((wall[0] + (isLong ? -1 : 1) * offsetTicks * snapshot.tickSize) * 100) / 100;
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) throw new Error('Invalid wall-out target price');
    return { targetPrice, wallPrice: wall[0], wallSize: wall[1] };
}

interface WallOutPair {
    LIMIT?: { quantity: number; isBuy: boolean };
    STOP?: { quantity: number; isBuy: boolean };
}

/** Match Market Out's smallest-quantity selection, preserving display order for ties. */
export function wallOutPairs<T extends WallOutPair>(pairs: T[], count: number, isLong: boolean): T[] {
    if (count !== 1 && count !== 2) throw new Error('Invalid wall-out partial count');
    if (pairs.length === 0) throw new Error('No active exit pairs');
    const remaining = [...pairs], selected: T[] = [];
    while (selected.length < count && remaining.length > 0) {
        const index = getFirstSmallestQuantityExitPairIndex(remaining);
        if (index < 0) throw new Error('Missing exit quantity');
        const pair = remaining.splice(index, 1)[0];
        if (!pair.LIMIT || !pair.STOP) throw new Error('Both exit legs required for wall out');
        if (pair.LIMIT.isBuy !== !isLong || pair.STOP.isBuy !== !isLong
            || pair.LIMIT.quantity !== pair.STOP.quantity) throw new Error('Exit legs disagree with position');
        selected.push(pair);
    }
    return selected;
}
