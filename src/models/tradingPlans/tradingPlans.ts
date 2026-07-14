import * as Models from '../models';
import * as Helper from '../../utils/helper';
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
    /*
    if (atr.maxRisk <= 0) {
        return "miss max risk in ATR";
    }*/

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
