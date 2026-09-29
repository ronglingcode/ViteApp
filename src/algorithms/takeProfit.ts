import * as Helper from '../utils/helper';
import * as Models from '../models/models';
import * as GlobalSettings from '../config/globalSettings';
import * as Firestore from '../firestore';
import { calculateEntryTargets } from './entryTargets';

export const BatchCount = GlobalSettings.batchCount;

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
    const targets = calculateEntryTargets(totalShares, entryPrice, riskReferencePrice, isLong,
        bookmapOrderbook, partialsCount, price => Helper.roundPrice(symbol, price));
    Firestore.logInfo(`${symbol} initial exit targets: ${targets.map(target => `${target.quantity} @ ${target.target}`).join(', ')}`, logTags);
    return targets;
};
