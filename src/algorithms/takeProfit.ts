import * as Helper from '../utils/helper';
import * as Models from '../models/models';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as TradingState from '../models/tradingState';
import * as GlobalSettings from '../config/globalSettings';
import * as Firestore from '../firestore';
import {
    getBookmapSizeThreshold,
    meetsBookmapSizeThreshold,
} from '../bookmap/wallThreshold';

export const BatchCount = GlobalSettings.batchCount;
const BookmapWallTargetCount = 3;
const DefaultRiskReward = 3;

/**
 * Exit pairs scale with the entry's effective risk multiple, so downgraded
 * entries use proportionally fewer pairs: 1R -> full batch count,
 * 0.5R -> 5, 0.1R -> a single pair.
 * @param riskMultiplier the entry's effective risk multiple (1 = full size)
 */
export const getPartialsCountForRiskMultiplier = (riskMultiplier: number) => {
    if (!Number.isFinite(riskMultiplier)) {
        return BatchCount;
    }
    let count = Math.round(riskMultiplier * BatchCount);
    return Math.max(1, Math.min(BatchCount, count));
};

export const getTargetPriceByRiskReward = (symbol: string, isLong: boolean,
    basePrice: number, stopOut: number, ratio: number) => {
    let risk = Math.abs(basePrice - stopOut);
    let target = isLong ? basePrice + ratio * risk : basePrice - ratio * risk;
    return Helper.roundPrice(symbol, target);
}

export const getEntryProfitTargets = (
    symbol: string,
    totalShares: number,
    entryPrice: number,
    riskReferencePrice: number,
    isLong: boolean,
    bookmapOrderbook: Models.BookmapOrderbookSnapshot | undefined,
    logTags: Models.LogTags,
    partialsCount: number = BatchCount) => {
    const targetPrices = getEntryTargetPrices(symbol, entryPrice, riskReferencePrice, isLong, bookmapOrderbook, logTags, partialsCount);
    return splitTargetsEvenly(symbol, totalShares, targetPrices, logTags, partialsCount);
};

const getEntryTargetPrices = (
    symbol: string,
    entryPrice: number,
    riskReferencePrice: number,
    isLong: boolean,
    bookmapOrderbook: Models.BookmapOrderbookSnapshot | undefined,
    logTags: Models.LogTags,
    partialsCount: number) => {
    const target3R = getTargetPriceByRiskReward(symbol, isLong, entryPrice, riskReferencePrice, DefaultRiskReward);
    const wallThreshold = getBookmapSizeThreshold(bookmapOrderbook);
    const wallTargets = getBookmapWallTargets(symbol, entryPrice, isLong, bookmapOrderbook, wallThreshold);
    const targets = wallTargets.slice(0, BookmapWallTargetCount);

    while (targets.length < partialsCount) {
        targets.push(target3R);
    }

    if (wallThreshold === undefined) {
        Firestore.logInfo(`${symbol} Bookmap wall threshold unavailable; initial targets use 3R only @ ${target3R}`, logTags);
    } else if (wallTargets.length > 0) {
        Firestore.logInfo(`${symbol} initial targets use ${Math.min(wallTargets.length, BookmapWallTargetCount)} Bookmap wall(s) >= ${wallThreshold}, rest 3R @ ${target3R}`, logTags);
    } else {
        Firestore.logInfo(`${symbol} initial targets use 3R only @ ${target3R}`, logTags);
    }
    return targets.slice(0, partialsCount);
};

const getBookmapWallTargets = (
    symbol: string,
    entryPrice: number,
    isLong: boolean,
    bookmapOrderbook: Models.BookmapOrderbookSnapshot | undefined,
    wallThreshold: number | undefined) => {
    if (!bookmapOrderbook || wallThreshold === undefined) {
        return [];
    }

    const rawLevels = isLong ? bookmapOrderbook.largeAsks : bookmapOrderbook.largeBids;
    if (!rawLevels || rawLevels.length === 0) {
        return [];
    }

    const seenPrices = new Set<number>();
    const targets: number[] = [];
    rawLevels.forEach(([price, size]) => {
        if (!Number.isFinite(price) || !meetsBookmapSizeThreshold(size, wallThreshold)) {
            return;
        }
        if ((isLong && price <= entryPrice) || (!isLong && price >= entryPrice)) {
            return;
        }
        const roundedPrice = Helper.roundPrice(symbol, price);
        if (seenPrices.has(roundedPrice)) {
            return;
        }
        seenPrices.add(roundedPrice);
        targets.push(roundedPrice);
    });

    targets.sort((a, b) => isLong ? a - b : b - a);
    return targets;
};

const splitTargetsEvenly = (
    symbol: string,
    totalShares: number,
    targetPrices: number[],
    logTags: Models.LogTags,
    partialsCount: number) => {
    const normalizedShares = Math.floor(totalShares);
    const baseQuantity = Math.floor(normalizedShares / partialsCount);
    const remainder = normalizedShares % partialsCount;
    let results: Models.ProfitTarget[] = [];

    for (let i = 0; i < targetPrices.length && i < partialsCount; i++) {
        const shares = baseQuantity + (i < remainder ? 1 : 0);
        if (shares <= 0) {
            continue;
        }
        results.push({
            target: targetPrices[i],
            quantity: shares
        });
    }

    return results;
};
