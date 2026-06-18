import * as Helper from '../utils/helper';
import * as Models from '../models/models';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as TradingState from '../models/tradingState';
import * as GlobalSettings from '../config/globalSettings';
import * as Firestore from '../firestore';

export const BatchCount = GlobalSettings.batchCount;
const BookmapWallTargetCount = 5;
const BookmapWallMinSize = 5_000;
const DefaultRiskReward = 3;

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
    logTags: Models.LogTags) => {
    const targetPrices = getEntryTargetPrices(symbol, entryPrice, riskReferencePrice, isLong, bookmapOrderbook, logTags);
    return splitTargetsEvenly(symbol, totalShares, targetPrices, logTags);
};

const getEntryTargetPrices = (
    symbol: string,
    entryPrice: number,
    riskReferencePrice: number,
    isLong: boolean,
    bookmapOrderbook: Models.BookmapOrderbookSnapshot | undefined,
    logTags: Models.LogTags) => {
    const target3R = getTargetPriceByRiskReward(symbol, isLong, entryPrice, riskReferencePrice, DefaultRiskReward);
    const wallTargets = getBookmapWallTargets(symbol, entryPrice, isLong, bookmapOrderbook);
    const targets = wallTargets.slice(0, BookmapWallTargetCount);

    while (targets.length < BatchCount) {
        targets.push(target3R);
    }

    if (wallTargets.length > 0) {
        Firestore.logInfo(`${symbol} initial targets use ${Math.min(wallTargets.length, BookmapWallTargetCount)} Bookmap wall(s), rest 3R @ ${target3R}`, logTags);
    } else {
        Firestore.logInfo(`${symbol} initial targets use 3R only @ ${target3R}`, logTags);
    }
    return targets.slice(0, BatchCount);
};

const getBookmapWallTargets = (
    symbol: string,
    entryPrice: number,
    isLong: boolean,
    bookmapOrderbook: Models.BookmapOrderbookSnapshot | undefined) => {
    if (!bookmapOrderbook) {
        return [];
    }

    const rawLevels = isLong ? bookmapOrderbook.largeAsks : bookmapOrderbook.largeBids;
    if (!rawLevels || rawLevels.length === 0) {
        return [];
    }

    const seenPrices = new Set<number>();
    const targets: number[] = [];
    rawLevels.forEach(([price, size]) => {
        if (!Number.isFinite(price) || !Number.isFinite(size) || size <= BookmapWallMinSize) {
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
    logTags: Models.LogTags) => {
    const normalizedShares = Math.floor(totalShares);
    const baseQuantity = Math.floor(normalizedShares / BatchCount);
    const remainder = normalizedShares % BatchCount;
    let results: Models.ProfitTarget[] = [];

    for (let i = 0; i < targetPrices.length && i < BatchCount; i++) {
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

export const isCurrentTradeFirstSignal = (symbol: string, isLong: boolean) => {
    let currentTrade = Models.getCurrentOpenTrade(symbol);
    if (!currentTrade || currentTrade.entries.length == 0) {
        return false;
    }
    let entryTime = currentTrade.entries[0].time;
    let firstEntry = currentTrade.entries[0];
    for (let i = 1; i < currentTrade.entries.length; i++) {
        let newTime = currentTrade.entries[i].time;
        if (newTime < entryTime) {
            entryTime = newTime;
            firstEntry = currentTrade.entries[i];
        }
    }
    let secondsSinceOpen = Helper.getSecondsSinceMarketOpen(entryTime);
    if (secondsSinceOpen < 60) {
        return true;
    }

    let state = TradingState.getSymbolState(symbol);
    if (state.activeBasePlan?.planType == TradingPlansModels.PlanType.FirstNewHigh) {
        return true;
    }
    return false;
}
