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
export const getMomentumStartLevel = (symbol: string, isLong: boolean) => {
    let plan = getTradingPlans(symbol);
    let usePremarketLevel = plan.analysis.usePremarketKeyLevel;
    let symbolData = Models.getSymbolData(plan.symbol);
    if (symbolData.premktHigh > 0 && symbolData.premktLow > 0) {
        if (usePremarketLevel == 1) {
            return symbolData.premktHigh;
        } else if (usePremarketLevel == -1) {
            return symbolData.premktLow;
        }
    }
    return isLong ? plan.keyLevels.momentumStartForLong : plan.keyLevels.momentumStartForShort;
}

export const hasMomentumLevels = (plan: TradingPlansModels.TradingPlans) => {
    return hasSingleMomentumLevel(plan) || hasDualMomentumLevels(plan);
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
export const hasDualMomentumLevels = (plan: TradingPlansModels.TradingPlans) => {
    let analysis = plan.analysis;
    let levels = analysis.dualMomentumKeyLevels;
    return levels.length == 2;
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
}
export const getLastDefenseForLongInRetracement = (symbol: string) => {
    let p = getTradingPlansForSingleDirection(symbol, true);
    if (p.retracement) {
        return p.retracement.lastDefense;
    }
    return 0;
};
export const getLastDefenseForShortInRetracement = (symbol: string) => {
    let p = getTradingPlansForSingleDirection(symbol, false);
    let resistances: number[] = [];
    if (p.retracement) {
        return p.retracement.lastDefense;
    }
    return 0;
};
export const getMatchingRetracementArea = (symbol: string, isLong: boolean, entryPrice: number) => {
    let pullbackPlan = getTradingPlansForSingleDirection(symbol, isLong).retracement;
    if (!pullbackPlan) {
        return null;
    }
    let areas = pullbackPlan.entryAreas;
    for (let i = 0; i < areas.length; i++) {
        const area = areas[i];
        let pa = area.priceArea;
        if (isWithinRange(entryPrice, pa.priceLevel, pa.upperRoom, pa.lowerRoom)) {
            return area;
        }
    }
    if (pullbackPlan.vwapArea) {
        let currentVwap = Models.getCurrentVwap(symbol);
        let area = pullbackPlan.vwapArea;
        let pa = area.priceArea;
        if (isWithinRange(entryPrice, currentVwap, pa.upperRoom, pa.lowerRoom)) {
            return pullbackPlan.vwapArea;
        }
    }
    let openPrice = Models.getOpenPrice(symbol);
    if (pullbackPlan.openPriceArea && openPrice) {
        let area = pullbackPlan.openPriceArea;
        let pa = area.priceArea;
        if (isWithinRange(entryPrice, openPrice, pa.upperRoom, pa.lowerRoom)) {
            return pullbackPlan.openPriceArea;
        }
    }

    return null;
};

const isWithinRange = (entry: number, target: number, upperRoom: number, lowerRoom: number) => {
    let upperPrice = target + upperRoom;
    let lowerPrice = target - lowerRoom;
    return (lowerPrice <= entry) && (entry <= upperPrice);
};

export const fetchConfigData = async () => {
    let data = await Firestore.fetchConfigData();
    let stockSelections: string[] = [];
    let tradingPlans: TradingPlansModels.TradingPlans[] = [];
    let activeProfileName = '';
    let googleDocId = '';
    let tradingSettings: TradingPlansModels.TradingSettings = {
        useSingleOrderForEntry: false,
        snapMode: true,
    };
    if (data) {
        tradingPlans = data.plans as TradingPlansModels.TradingPlans[];
        tradingPlans.forEach(tp => {
            populateTradingPlan(tp);
        });
        stockSelections = data.stockSelections as string[];
        activeProfileName = data.activeProfileName;
        tradingSettings = data.tradingSettings;
        googleDocId = data.googleDocId;
    }
    return {
        tradingPlans: tradingPlans,
        stockSelections: stockSelections,
        activeProfileName: activeProfileName,
        tradingSettings: tradingSettings,
        googleDocId: googleDocId,
    };
}

const populateTradingPlan = (plan: TradingPlansModels.TradingPlans) => {

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
    let p = getTradingPlans(symbol);
    if (p.long.retracement) {
        let r = p.long.retracement;
        r.entryAreas.forEach(area => {
            let pa = area.priceArea;
            let item: Models.KeyAreaToDraw = {
                upperPrice: pa.priceLevel + pa.upperRoom,
                lowerPrice: pa.priceLevel - pa.lowerRoom,
                direction: 1,
            };
            results.push(item);
        });
    }
    if (p.short.retracement) {
        let r = p.short.retracement;
        r.entryAreas.forEach(area => {
            let pa = area.priceArea;
            let item: Models.KeyAreaToDraw = {
                upperPrice: pa.priceLevel + pa.upperRoom,
                lowerPrice: pa.priceLevel - pa.lowerRoom,
                direction: -1,
            };
            results.push(item);
        });
    }
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
    let keyLevels = tradingPlans.keyLevels;
    if (keyLevels.momentumStartForLong <= 0) {
        return "missing momentumStartForLong";
    }
    if (keyLevels.momentumStartForShort <= 0) {
        return "missing momentumStartForShort";
    }

    let longPlans = flattenPlans(tradingPlans.long);
    for (let i = 0; i < longPlans.length; i++) {
        let onePlan = longPlans[i];
        let checkResult = validateTargets(onePlan.targets);
        if (checkResult) {
            return checkResult;
        }
        if (onePlan.planConfigs.setupQuality == TradingPlansModels.SetupQuality.Unknown) {
            return `${symbol} has plan of Unknown setup quality`;
        }
    }

    let shortPlans = flattenPlans(tradingPlans.short);
    for (let i = 0; i < shortPlans.length; i++) {
        let onePlan = shortPlans[i];
        let checkResult = validateTargets(onePlan.targets);
        if (checkResult) {
            return checkResult;
        }
        if (onePlan.planConfigs.setupQuality == TradingPlansModels.SetupQuality.Unknown) {
            return `${symbol} has plan of Unknown setup quality`;
        }
    }

    let hasLevels = hasMomentumLevels(tradingPlans);
    if (!hasLevels) {
        return "no levels";
    }

    let longPlanInvalidReason = validateTradingPlansForOneDirection(tradingPlans.long, true);
    if (longPlanInvalidReason.length > 0) {
        return longPlanInvalidReason;
    }
    let shortPlanInvalidReason = validateTradingPlansForOneDirection(tradingPlans.short, false);
    if (shortPlanInvalidReason.length > 0) {
        return shortPlanInvalidReason;
    }
    let longTargetsInvalidReason = validateProfitTargets(tradingPlans.analysis.profitTargetsForLong);
    if (longTargetsInvalidReason.length > 0) {
        //return longTargetsInvalidReason;
    }
    let shortTargetsInvalidReason = validateProfitTargets(tradingPlans.analysis.profitTargetsForShort);
    if (shortTargetsInvalidReason.length > 0) {
        //return shortTargetsInvalidReason;
    }

    return "";
};

export const validateProfitTargets = (p: TradingPlansModels.ProfitTargets) => {
    return "";
    if (p.targets.length < 2) {
        return "need at least 2 target levels";
    }
    if (p.willBlowPastThoseLevels == -1) {
        return "missing score for willBlowPastThoseLevels";
    }
    if (p.summary.length == 0) {
        return "missing summary";
    }
    return "";
}

export const validateTradingPlansForOneDirection = (
    plan: TradingPlansModels.SingleDirectionPlans, isLong: boolean) => {
    let direction = isLong ? "long" : "short";
    if (plan.openDriveContinuation60Plan) {
        let openPlan = plan.openDriveContinuation60Plan;
        if (!openPlan.requireOpenBetterThanVwap && (
            !openPlan.disableIfOpenWorseThanPrice || openPlan.disableIfOpenWorseThanPrice == 0)) {
            return `no open price requirement for gap and go ${direction}`;
        }
    }
    return "";
}

export const flattenPlans = (plan: TradingPlansModels.SingleDirectionPlans) => {
    let results: TradingPlansModels.BasePlan[] = [];
    if (plan.openDriveContinuation60Plan) {
        results.push(plan.openDriveContinuation60Plan);
    }
    if (plan.profitTakingFade60Plan) {
        results.push(plan.profitTakingFade60Plan);
    }
    if (plan.firstBreakoutPlan) {
        results.push(plan.firstBreakoutPlan);
    }
    if (plan.redtoGreenPlan) {
        results.push(plan.redtoGreenPlan);
    }
    if (plan.firstNewHighPlan) {
        results.push(plan.firstNewHighPlan);
    }
    if (plan.levelBreakout) {
        results.push(plan.levelBreakout);
    }
    if (plan.premarketPlan) {
        results.push(plan.premarketPlan);
    }

    return results;
}
export const validateTargets = (targets: TradingPlansModels.ExitTargets) => {
    if (!noZero(targets.initialTargets.dailyRanges)) {
        return "zero in initial targets using ATR";
    }
    if (!targets.minimumTargets) {
        return "no minimum targets";
    }
    if (!noZero(targets.minimumTargets.dailyRanges)) {
        return "zero in minimum targets using ATR";
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
    return plan.profitTakingFade60Plan ||
        plan.openDriveContinuation60Plan;
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

export const generateScriptsForTradableAreas = () => {
    let symbols = window.HybridApp.SymbolsList;
    let scriptForSingleLevelHigh = `Def keyLevelHigh = `;
    let scriptForSingleLevelLow = `Def keyLevelLow = `;
    let scriptForAtr = `Def atr = `;
    let scriptForLongEndDistance = `Def longEndDistance = `;
    let scriptForShortEndDistance = `Def shortEndDistance = `;
    let scriptForVwapDistance = `Def vwapDistance = `;
    for (let i = 0; i < symbols.length; i++) {
        let s = symbols[i];
        let plan = getTradingPlans(s);
        scriptForAtr += `if GetSymbol() == "${s}" then ${plan.atr.average} else `;
        if (hasSingleMomentumLevel(plan)) {
            let keyLevel = getSingleMomentumLevel(plan);
            scriptForSingleLevelHigh += `if GetSymbol() == "${s}" then ${keyLevel.high} else `;
            scriptForSingleLevelLow += `if GetSymbol() == "${s}" then ${keyLevel.low} else `;
            let longArea = Models.getTradableArea(s, true);
            let shortArea = Models.getTradableArea(s, false);
            scriptForLongEndDistance += `if GetSymbol() == "${s}" then ${longArea.high} else `;
            scriptForShortEndDistance += `if GetSymbol() == "${s}" then ${shortArea.low} else `;
            scriptForVwapDistance += `if GetSymbol() == "${s}" then ${shortArea.distanceToVwap} else `;
        }
    }
    scriptForSingleLevelHigh += '0;';
    scriptForSingleLevelLow += '0;';
    scriptForAtr += '1;';
    scriptForLongEndDistance += '0;';
    scriptForShortEndDistance += '0;';
    scriptForVwapDistance += '0;';
    console.log(`${scriptForAtr}\n${scriptForSingleLevelHigh}\n${scriptForSingleLevelLow}\n${scriptForLongEndDistance}\n${scriptForShortEndDistance}\n${scriptForVwapDistance}`);
}
export const generateTosScripts = () => {
    let symbols = window.HybridApp.SymbolsList;
    let scriptForSingleLevelHigh = `Def keyLevelHigh = `;
    let scriptForSingleLevelLow = `Def keyLevelLow = `;
    let scriptForDualLevels = `Def keyLevel = `;
    let scriptForAtr = `Def atr = `;
    for (let i = 0; i < symbols.length; i++) {
        let s = symbols[i];
        let plan = getTradingPlans(s);
        scriptForAtr += `if GetSymbol() == "${s}" then ${plan.atr.average} else `;
        if (hasSingleMomentumLevel(plan)) {
            let keyLevel = getSingleMomentumLevel(plan);
            scriptForSingleLevelHigh += `if GetSymbol() == "${s}" then ${keyLevel.high} else `;
            scriptForSingleLevelLow += `if GetSymbol() == "${s}" then ${keyLevel.low} else `;
        } else if (hasDualMomentumLevels(plan)) {
            let { levelHigh, levelLow } = getDualMomentumLevels(plan);
            let keyLevelScript = `if GetSymbol() == "${s}" then ${levelHigh} else `;
            scriptForDualLevels += keyLevelScript;
        }
    }
    scriptForSingleLevelHigh += '0;';
    scriptForSingleLevelLow += '0;';
    scriptForAtr += '1;';
    console.log(`${scriptForAtr}\n${scriptForSingleLevelHigh}\n${scriptForSingleLevelLow}`);
}
export const getTradingTiming = (symbol: string, basePlan: TradingPlansModels.BasePlan) => {
    let tradingPlans = getTradingPlans(symbol);
    let analysis = tradingPlans.analysis;
    let deferTradingInSeconds = analysis.deferTradingInSeconds;
    let stopTradingAfterSeconds = analysis.stopTradingAfterSeconds;
    let planConfigs = basePlan.planConfigs;
    let overrideDeferTradingInSeconds = planConfigs.deferTradingInSeconds;
    let overrideStopTradingAfterSeconds = planConfigs.stopTradingAfterSeconds;
    if (overrideDeferTradingInSeconds > 0) {
        deferTradingInSeconds = overrideDeferTradingInSeconds;
    }
    if (overrideStopTradingAfterSeconds > 0) {
        stopTradingAfterSeconds = overrideStopTradingAfterSeconds;
    }
    return {
        deferTradingInSeconds,
        stopTradingAfterSeconds,
    }
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

    for (let i = targets.length-1; i >=0; i--) {
        let target = targets[i];
        let end = totalPartialCount-usedCount;
        let start = end - target.partialCount + 1;
        usedCount += target.partialCount;
        let label = `${target.text}:${target.partialCount}0%(${start}-${end})`;
        target.label = label;
    }
}