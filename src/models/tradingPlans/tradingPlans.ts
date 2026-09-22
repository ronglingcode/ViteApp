import * as Models from '../models';
import * as Helper from '../../utils/helper';
import * as TimeHelper from '../../utils/timeHelper';
import * as Firestore from '../../firestore';
import * as TradingPlansModels from './tradingPlansModels';
import * as TradingState from '../tradingState';
import * as GlobalSettings from '../../config/globalSettings';
declare let window: Models.MyWindow;


export const getTradingPlansForSingleDirection = (symbol: string, isLong: boolean) => {
    let plans = getTradingPlans(symbol);
    if (isLong)
        return plans.long;
    else
        return plans.short;
}

export const getSingleMomentumLevel = (plan: TradingPlansModels.TradingPlans) => {
    let usePremarketLevel = plan.analysis.usePremarketKeyLevel;
    let symbolData = Models.getSymbolData(plan.symbol);
    if (symbolData.premktHigh > 0 && symbolData.premktLow > 0) {
        if (usePremarketLevel == 1) {
            let leveArea: TradingPlansModels.LevelArea = {
                high: symbolData.premktHigh,
                low: symbolData.premktHigh,
            }
            return leveArea;
        } else if (usePremarketLevel == -1) {
            let leveArea: TradingPlansModels.LevelArea = {
                high: symbolData.premktLow,
                low: symbolData.premktLow,
            }
            return leveArea;
        }
    }
    let level = plan.analysis.singleMomentumKeyLevel;
    return level[0];
}
export const hasSingleMomentumLevel = (plan: TradingPlansModels.TradingPlans) => {
    let level = getSingleMomentumLevel(plan);
    return level && level.high > 0 && level.low > 0;
}

export const getDualMomentumLevels = (plan: TradingPlansModels.TradingPlans) => {
    let analysis = plan.analysis;
    let levels = analysis.dualMomentumKeyLevels;
    return {
        levelHigh: Math.max(...levels),
        levelLow: Math.min(...levels)
    };
}

export const getTradingPlansWithoutDefault = (symbol: string) => {
    let stocksTradingPlans = window.HybridApp.TradingPlans;
    let isFutures = Helper.isFutures(symbol);
    for (let i = 0; i < stocksTradingPlans.length; i++) {
        const element = stocksTradingPlans[i];
        if (isFutures) {
            if (symbol.startsWith(element.symbol) &&
                element.isFutures == true) {
                return {
                    ...element
                };
            }
        } else {
            if (element.symbol == symbol) {
                return {
                    ...element
                };
            }
        }
    }
    return undefined;
};
export const getTradingPlans = (symbol: string) => {
    let result = getTradingPlansWithoutDefault(symbol);
    if (result) {
        return result;
    }

    return window.HybridApp.TradingPlans[0];
};

/** Risk level labels for chooseRiskLevel; lives on plan.analysis (not on each BasePlan). */
export const getAnalysisDefaultRiskLevels = (symbol: string): string[] => {
    return getTradingPlans(symbol).analysis.defaultRiskLevels;
};
export const fetchConfigData = async () => {
    let data = await Firestore.fetchConfigData();
    let stockSelections: string[] = [];
    let tradingPlans: TradingPlansModels.TradingPlans[] = [];
    let activeProfileName = '';
    let tradingSettings: TradingPlansModels.TradingSettings = {
        useSingleOrderForEntry: false,
        snapMode: true,
    };
    if (data) {
        tradingPlans = data.plans as TradingPlansModels.TradingPlans[];
        stockSelections = data.stockSelections as string[];
        activeProfileName = data.activeProfileName;
        tradingSettings = data.tradingSettings;
    }
    return {
        tradingPlans: tradingPlans,
        stockSelections: stockSelections,
        activeProfileName: activeProfileName,
        tradingSettings: tradingSettings,
    };
}

export const getTradingSettings = () => {
    return window.HybridApp.TradingData.tradingSettings;
}

export const getVwapCorrection = (symbol: string) => {
    let plans = getTradingPlans(symbol);
    return plans.vwapCorrection;
};

export const getKeyAreasToDraw = (symbol: string) => {
    let results: Models.KeyAreaToDraw[] = [];
    return results;
}

/**
 * @returns reason if trading plan is not valid. Empty string if valid.
 */
export const validateTradingPlans = (symbol: string, tradingPlans: TradingPlansModels.TradingPlans) => {
    let atr = tradingPlans.atr;
    if (atr.average <= 0 || atr.mutiplier <= 0 || atr.minimumMultipler <= 0) {
        return "missing atr";
    }
    let longPlanInvalidReason = validateTradingPlansForOneDirection(tradingPlans.long, true);
    if (longPlanInvalidReason.length > 0) {
        return longPlanInvalidReason;
    }
    let shortPlanInvalidReason = validateTradingPlansForOneDirection(tradingPlans.short, false);
    if (shortPlanInvalidReason.length > 0) {
        return shortPlanInvalidReason;
    }


    return "";
};

export const validateTradingPlansForOneDirection = (
    plan: TradingPlansModels.SingleDirectionPlans, isLong: boolean) => {
    return "";
}

/** Number of previous daily candles that must not have broken the previous consolidation area. */
const previousConsolidationLookbackDays = 3;

/**
 * Range bound reversal plans only work while the previous consolidation area is intact. A previous
 * day broke the area when it opened inside the area but closed outside of it; the breakout then
 * already happened and today is at least a 2nd day play, which cannot be traded.
 * Call this after the daily candles are loaded.
 * @returns reason if one of the last previousConsolidationLookbackDays daily candles broke the
 * area, or if the plan has no valid previousConsolidationArea. Empty string if it did not.
 */
export const validatePreviousConsolidationArea = (
    tradingPlans: TradingPlansModels.TradingPlans | undefined,
    previousDailyCandles: Models.Candle[],
) => {
    let rangeBoundReversalPlan = tradingPlans?.rangeBoundReversalPlan;
    if (!rangeBoundReversalPlan || !previousDailyCandles || previousDailyCandles.length == 0) {
        return "";
    }
    let area = rangeBoundReversalPlan.previousConsolidationArea;
    let areaLow = area ? Math.min(area.low, area.high) : 0;
    let areaHigh = area ? Math.max(area.low, area.high) : 0;
    if (!area || !Number.isFinite(areaLow) || !Number.isFinite(areaHigh) ||
        areaLow <= 0 || areaLow >= areaHigh) {
        return "missing previous consolidation area for range bound reversal";
    }
    let firstIndex = Math.max(0, previousDailyCandles.length - previousConsolidationLookbackDays);
    for (let i = firstIndex; i < previousDailyCandles.length; i++) {
        let candle = previousDailyCandles[i];
        let openedInsideArea = candle.open >= areaLow && candle.open <= areaHigh;
        if (!openedInsideArea) {
            continue;
        }
        let isBreakout = candle.close > areaHigh;
        let isBreakdown = candle.close < areaLow;
        if (isBreakout || isBreakdown) {
            let direction = isBreakout ? "breakout" : "breakdown";
            let candleDate = TimeHelper.localTimeToNewYorkTime(new Date(candle.datetime));
            let day = TimeHelper.getDateString(candleDate);
            return `previous consolidation ${direction} on ${day}: open ${candle.open} inside [${areaLow}, ${areaHigh}], close ${candle.close}`;
        }
    }
    return "";
}


export const noZero = (numbers: number[]) => {
    for (let i = 0; i < numbers.length; i++) {
        if (numbers[i] == 0) {
            return false;
        }
    }
    return true;
}

export const hasFirst60PlanForOneSide = (plan: TradingPlansModels.SingleDirectionPlans) => {
    return false;
}

export const isInRange = (price: number, vwap: number, high: string, low: string) => {
    if (high != '') {
        let upperBound = high == 'vwap' ? vwap : Number(high);
        if (price > upperBound) {
            return false;
        }
    }
    if (low != '') {
        let lowerBound = low == 'vwap' ? vwap : Number(low);
        if (price < lowerBound) {
            return false;
        }
    }
    return true;
}

export const getMinTarget = (symbol: string, isLong: boolean, partialIndex: number) => {
    let targets = calculateTargets(symbol, isLong);
    let minTargets = populateTargets(targets, isLong);
    let threshold = minTargets[partialIndex];
    Firestore.logInfo(`min targets for partial ${partialIndex}`);
    Firestore.logInfo(minTargets)
    return threshold;
}

export const calculateTargets = (symbol: string, isLong: boolean) => {
    let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
    let topPlan = getTradingPlans(symbol);
    let directionalPlan = isLong ? topPlan.long : topPlan.short;
    let finalTargets = directionalPlan.finalTargets;
    let atr = Models.getAtr(symbol).average;
    let symbolData = Models.getSymbolData(symbol);
    let result: TradingPlansModels.SingleExitTarget[] = [];
    finalTargets.forEach(target => {
        let targetPrice = Models.getLevelFromSingleExitTarget(symbolData, isLong, target, atr, breakoutTradeState.entryPrice, breakoutTradeState.stopLossPrice);
        result.push({
            level: targetPrice,
            text: target.text,
            rrr: 0,
            atr: 0,
            partialCount: target.partialCount,
        });
    });
    result.sort((a, b) => {
        if (isLong) {
            return a.level - b.level;
        } else {
            return b.level - a.level;
        }
    });
    return result;
}

/**
 * @returns an array of minumum targets of 10 slots. -1 means no target.
 */
export const populateTargets = (targets: TradingPlansModels.SingleExitTarget[], isLong: boolean) => {
    let results: number[] = [];
    let batchCount = GlobalSettings.batchCount;
    for (let i = 0; i < batchCount; i++) {
        results.push(-1);
    }
    let index = batchCount - 1;
    for (let i = targets.length - 1; i >= 0; i--) {
        let target = targets[i];
        let count = target.partialCount;
        let price = target.level;
        while (count > 0) {
            results[index] = price;
            index--;
            count--;
        }
    }
    return results;
}
export const populateTargetsLabels = (symbol: string, targets: TradingPlansModels.SingleExitTarget[]) => {
    let batchCount = GlobalSettings.batchCount;
    let totalPartialCount = Models.getExitPairs(symbol).length;
    if (totalPartialCount > batchCount) {
        totalPartialCount = batchCount;
    }
    let usedCount = 0;

    for (let i = targets.length - 1; i >= 0; i--) {
        let target = targets[i];
        let end = totalPartialCount - usedCount;
        let start = end - target.partialCount + 1;
        usedCount += target.partialCount;
        let label = `${target.text}:${target.partialCount}0%(${start}-${end})`;
        target.label = label;
    }
}
