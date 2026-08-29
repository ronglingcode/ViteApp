import * as GlobalSettings from '../config/globalSettings';
import * as Models from '../models/models';
import * as TradingState from '../models/tradingState';
import * as Helper from '../utils/helper';
import {
    ALWAYS_UNRESTRICTED_PARTIALS,
    evaluateCoreTargetRule,
} from './coreTargetRule';

export {
    ALWAYS_UNRESTRICTED_PARTIALS,
    calculateBufferedCoreTarget,
    CORE_TARGET_PROGRESS_RATIO,
    evaluateCoreTargetRule,
    normalizeRestrictedPartialCount,
} from './coreTargetRule';

const getPairIndex = (symbol: string, pair: Models.ExitPair) => {
    let allPairs = Models.getExitPairs(symbol);
    let directIndex = allPairs.indexOf(pair);
    if (directIndex >= 0) {
        return directIndex;
    }
    return allPairs.findIndex(candidate => {
        if (candidate.parentOrderID && pair.parentOrderID) {
            return candidate.parentOrderID === pair.parentOrderID;
        }
        return candidate.LIMIT?.orderID === pair.LIMIT?.orderID
            || candidate.STOP?.orderID === pair.STOP?.orderID;
    });
};

export const getOriginalPartialNumber = (symbol: string, pair: Models.ExitPair) => {
    let allPairs = Models.getExitPairs(symbol);
    let keyIndex = getPairIndex(symbol, pair);
    if (keyIndex < 0) {
        return GlobalSettings.batchCount + 1;
    }
    return Helper.getBatchIndex(keyIndex, GlobalSettings.batchCount, allPairs.length) + 1;
};

const getActiveRulePlan = (symbol: string, isLong: boolean) => {
    let state = TradingState.getBreakoutTradeState(symbol, isLong);
    if (!state?.hasValue) {
        return undefined;
    }
    return {
        entryPrice: state.entryPrice,
        coreTarget: state.plan.coreTarget,
        coreCount: state.plan.coreCount,
    };
};

const checkEarlierExit = (
    symbol: string,
    pair: Models.ExitPair,
    proposedExitPrice: number,
    makesExitEarlier: boolean,
): Models.CheckRulesResult => {
    let isLong = Models.getPositionNetQuantity(symbol) > 0;
    let partialNumber = getOriginalPartialNumber(symbol, pair);
    let plan = getActiveRulePlan(symbol, isLong);
    if (!plan) {
        if (!makesExitEarlier || partialNumber <= ALWAYS_UNRESTRICTED_PARTIALS) {
            return {
                allowed: true,
                reason: !makesExitEarlier
                    ? 'the adjustment does not make the exit happen earlier'
                    : `partial ${partialNumber} is within the first ${ALWAYS_UNRESTRICTED_PARTIALS} unrestricted partials`,
            };
        }
        return {
            allowed: false,
            reason: `missing active trade plan for protected partial ${partialNumber}`,
        };
    }
    return evaluateCoreTargetRule({
        isLong,
        entryPrice: plan.entryPrice,
        coreTarget: plan.coreTarget,
        coreCount: plan.coreCount,
        partialNumber,
        proposedExitPrice,
        makesExitEarlier,
    });
};

export const checkPriceAdjustment = (
    symbol: string,
    pairs: Models.ExitPair[],
    newPrice: number,
    isStopLeg: boolean,
): Models.CheckRulesResult => {
    if (!GlobalSettings.enableCoreTargetExitFeature) {
        return {
            allowed: true,
            reason: 'core-target exit feature is disabled',
        };
    }
    let isLong = Models.getPositionNetQuantity(symbol) > 0;
    for (let pair of pairs) {
        let leg = isStopLeg ? pair.STOP : pair.LIMIT;
        if (!leg?.price) {
            continue;
        }
        let makesExitEarlier = isStopLeg
            ? (isLong ? newPrice > leg.price : newPrice < leg.price)
            : (isLong ? newPrice < leg.price : newPrice > leg.price);
        let result = checkEarlierExit(symbol, pair, newPrice, makesExitEarlier);
        if (!result.allowed) {
            return result;
        }
    }
    return {
        allowed: true,
        reason: 'all selected exit adjustments pass the core-target rule',
    };
};

export const checkMarketExit = (
    symbol: string,
    pairs: Models.ExitPair[],
    currentPrice = Models.getCurrentPrice(symbol),
): Models.CheckRulesResult => {
    if (!GlobalSettings.enableCoreTargetExitFeature) {
        return {
            allowed: true,
            reason: 'core-target exit feature is disabled',
        };
    }
    for (let pair of pairs) {
        let result = checkEarlierExit(symbol, pair, currentPrice, true);
        if (!result.allowed) {
            return result;
        }
    }
    return {
        allowed: true,
        reason: 'all selected market exits pass the core-target rule',
    };
};
