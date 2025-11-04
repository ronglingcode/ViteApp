import * as Helper from '../utils/helper';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Models from '../models/models';
import * as Firestore from '../firestore';

export const defaultMinimumTargets: TradingPlansModels.ExitTargetsSet = {
    rrr: [0.85, 0.85, 0.9, 1.5, 1.8, 1.8, 1.8, 1.8, 2.4, 2.8],
    dailyRanges: [0.4, 0.4, 0.45, 0.7, 0.75, 0.9, 0.9, 0.9, 0.9, 0.9],
    priceLevels: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

export const getProfitTargetsListFromConfig = (
    symbol: string, isLong: boolean, entryPrice: number, stopLossPrice: number, batchCount: number,
    atr: TradingPlansModels.AverageTrueRange, applyMinAtr: boolean, config: TradingPlansModels.ExitTargetsSet,
    useCase: string, logTags: Models.LogTags) => {
    let risk = Math.abs(entryPrice - stopLossPrice);
    let todayRange = Models.getTodayRange(atr);
    let minAtr = atr.average * atr.minimumMultipler;
    let profitFromMinAtr = Helper.roundToCents(minAtr - risk);

    let minTargets: number[] = [];
    let profitsUsingRiskRatios = getUsingRiskRatios(batchCount, config.rrr, risk);
    //Firestore.logDebug(`${useCase} using RRR`, logTags);
    //Firestore.logDebug(config.rrr, logTags);
    //Firestore.logDebug(Helper.roundListToCents(profitsUsingRiskRatios), logTags);

    let profitsUsingDailyRanges = profitsUsingRiskRatios;
    if (todayRange != 0) {
        profitsUsingDailyRanges = getUsingDailyRanges(batchCount, config.dailyRanges, risk, atr.average);
        //Firestore.logDebug(`${useCase} using ATR`, logTags);
        //Firestore.logDebug(config.dailyRanges, logTags);
        //Firestore.logDebug(Helper.roundListToCents(profitsUsingDailyRanges), logTags);
    }

    for (let i = 0; i < batchCount; i++) {
        let toCompare = [profitsUsingRiskRatios[i], profitsUsingDailyRanges[i]];
        let hasPriceLevel = (i < config.priceLevels.length && config.priceLevels[i] != 0);
        if (hasPriceLevel) {
            let profitFromFixedPrice = Math.abs(config.priceLevels[i] - entryPrice);
            toCompare.push(profitFromFixedPrice);
        }
        let minProfit = Math.min(...toCompare);
        if (applyMinAtr) {
            if (minProfit < profitFromMinAtr) {
                minProfit = profitFromMinAtr;
            }
        }
        let minTarget = profitToTarget(symbol, isLong, entryPrice, minProfit);
        minTargets.push(minTarget);
    }
    return minTargets;
};

export const getMinimumProfitForBatch = (risk: number, dailyRange: number) => {
    let p1 = risk * 3;
    if (dailyRange == 0)
        return p1;
    let p2 = 0.9 * dailyRange - risk;
    return Math.min(p1, p2);
}
export const getMinimumProfitForHalf = (risk: number, dailyRange: number) => {
    let p1 = risk * 2;
    if (dailyRange == 0)
        return p1;
    let p2 = 0.9 * dailyRange - risk;
    return Math.min(p1, p2);
}

const getUsingRiskRatios = (
    batchCount: number, ratios: number[], risk: number) => {
    let defaultRatio = 2;
    let profits: number[] = [];
    for (let i = 0; i < batchCount; i++) {
        let ratio = defaultRatio;
        if (i < ratios.length) {
            ratio = ratios[i];
        }
        profits.push(ratio * risk)
    }
    return profits;
}
const getUsingDailyRanges = (
    batchCount: number, ranges: number[], risk: number, atrAverage: number) => {
    let defaultRatio = 1;
    let profits: number[] = [];
    for (let i = 0; i < batchCount; i++) {
        let ratio = defaultRatio;
        if (i < ranges.length) {
            ratio = ranges[i];
        }
        let profit = atrAverage * ratio - risk;
        profits.push(profit);
    }
    return profits;
}

export const profitToTarget = (symbol: string, isLong: boolean, entryPrice: number, profit: number) => {
    if (isLong) {
        return Helper.roundPrice(symbol, entryPrice + profit);
    } else {
        return Helper.roundPrice(symbol, entryPrice - profit);
    }
}

/**
 * @returns index from 0 to BatchCount - 1
 */
export const getIndex = (initialBatchCount: number, exitPairsCount: number, inputIndex: number) => {
    if (exitPairsCount > initialBatchCount) {
        // over size
        return inputIndex;
    } else {
        let used = initialBatchCount - exitPairsCount;
        return inputIndex + used;
    }
}