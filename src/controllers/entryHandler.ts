import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Helper from '../utils/helper';
import * as Firestore from '../firestore';
import * as OrderFlow from './orderFlow';
import * as TradingState from '../models/tradingState';
import * as EntryRulesChecker from './entryRulesChecker';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Strategies from '../algorithms/strategies';

import * as Patterns from '../algorithms/patterns';
import * as AdjustExitsHandler from './adjustExitsHandler';
import * as Broker from '../api/broker';
import * as Calculator from '../utils/calculator';
import { OpenFlush } from '../tradebooks/singleKeyLevel/openFlush';


export const getLogTagsForEntryAction = (symbol: string, isLong: boolean, entryType: string) => {
    let action = isLong ? "buy" : "sell";
    let logTags = Models.generateLogTags(symbol, `${symbol}-${entryType}_${action}`);
    return logTags;
};


const getOrderType = (symbol: string, isLong: boolean, shiftKey: boolean, entryPrice: number) => {
    if (shiftKey) {
        return Models.OrderType.MARKET;
    }
    let currentPrice = Models.getCurrentPrice(symbol);
    if ((isLong && entryPrice > currentPrice) ||
        (!isLong && entryPrice < currentPrice)) {
        return Models.OrderType.STOP;
    } else {
        return Models.OrderType.LIMIT;
    }
}

export const entryAfterOpen = (symbol: string, isLong: boolean, shiftKey: boolean,
    secondsSinceMarketOpen: number,
    plan: TradingPlansModels.SingleDirectionPlans) => {
    Firestore.logInfo(`entryAfterOpen for ${symbol}`);
    let tradebooks = Models.getEnabledTradebooksForSingleDirection(symbol, isLong);

    if (tradebooks.length == 1) {
        tradebooks[0].startEntry(shiftKey, false, Models.getDefaultEntryParameters());
    } else {
        Firestore.logError(`multiple tradebooks for ${symbol}, ${tradebooks.length} tradebooks`);
        Firestore.logError(`use button instead`);
        Helper.speak(`use button instead`);
    }
};

export const createEntryLogMessage = (orderType: string, isLong: boolean,
    entryPrice: number, stopOutPrice: number, riskLevel: number,
    allowedSizeMutiplier: number) => {
    let action = isLong ? "buy" : "sell";
    let logMessage = `${action} ${orderType} ${entryPrice},`;
    if ((isLong && riskLevel < stopOutPrice) || (!isLong && riskLevel > stopOutPrice)) {
        logMessage += ` stop: ${stopOutPrice}, risk: ${riskLevel}`;
    } else {
        logMessage += ` stop&risk: ${stopOutPrice},`;
    }
    logMessage += `size: ${allowedSizeMutiplier}`;
    return logMessage;
}

export const breakoutEntryWithoutRules = (symbol: string, isLong: boolean,
    entryPrice: number, stopOutPrice: number, riskLevel: number, logTags: Models.LogTags,
    allowedSizeMutiplier: number, plan: TradingPlansModels.BasePlan,
    tradebookID: string,
    orderIdToReplace: string
) => {
    let logMessage = createEntryLogMessage('stop', isLong, entryPrice, stopOutPrice, riskLevel, allowedSizeMutiplier);
    Firestore.logInfo(logMessage, logTags);
    entryPrice = Calculator.updateStopPriceFromCurrentQuote(symbol, entryPrice, isLong);

    // move stop if having opposite position
    let exitPairs = Models.getExitPairs(symbol);
    if (exitPairs.length > 0 && exitPairs[0].LIMIT?.isBuy == isLong) {
        exitPairs.forEach(pte => {
            Broker.replaceExitPairWithNewPrice(pte, entryPrice, true, !isLong, logTags);
        })
    }

    let oldEntries = Models.getEntryOrdersInSameDirection(symbol, isLong);
    let submitEntryResult = OrderFlow.submitBreakoutOrders(symbol, entryPrice, stopOutPrice, riskLevel, isLong, allowedSizeMutiplier, plan, tradebookID, logTags, orderIdToReplace);
    if (oldEntries.length > 0) {
        Broker.cancelOrders(oldEntries);
    }
    TradingState.onPlaceBreakoutTrade(symbol, isLong, entryPrice, stopOutPrice, submitEntryResult, allowedSizeMutiplier, plan);
};

export const marketEntryWithoutRules = (symbol: string, isLong: boolean,
    stopOutPrice: number, riskLevel: number, logTags: Models.LogTags,
    allowedSizeMutiplier: number,
    plan: TradingPlansModels.BasePlan,
    tradebookID: string
) => {
    let estimatedEntryPrice = Models.getCurrentPrice(symbol);
    let logMessage = createEntryLogMessage('market', isLong, estimatedEntryPrice, stopOutPrice, riskLevel, allowedSizeMutiplier);

    Firestore.logInfo(logMessage, logTags);

    // flatten if having opposite position
    let exitPairs = Models.getExitPairs(symbol);
    if (exitPairs.length > 0 && exitPairs[0].LIMIT?.isBuy == isLong) {
        exitPairs.forEach(pte => {
            Broker.instantOutOneExitPair(symbol, !isLong, pte, logTags);
        })
    }

    let oldEntries = Models.getEntryOrdersInSameDirection(symbol, isLong);
    let submitEntryResult = OrderFlow.submitMarketEntryOrders(
        symbol, estimatedEntryPrice, stopOutPrice, riskLevel, isLong, allowedSizeMutiplier, plan, tradebookID, logTags
    );
    if (oldEntries.length > 0) {
        Broker.cancelOrders(oldEntries);
    }
    TradingState.onPlaceMarketTrade(symbol, isLong, estimatedEntryPrice, stopOutPrice, submitEntryResult, allowedSizeMutiplier, plan);
};

export const runRedToGreen60Plan = (symbol: string, isLong: boolean,
    plan: TradingPlansModels.BasePlan, planType: TradingPlansModels.PlanType,
    logTags: Models.LogTags) => {
    let { entryPrice, stopOutPrice, riskLevelPrice } = Models.getHighLowBreakoutEntryStopPrice(symbol, isLong);
    let widget = Models.getChartWidget(symbol);
    if (widget) {
        if (widget.entryPriceLine) {
            let newEntryPrice = widget.entryPriceLine.options().price;
            if ((isLong && newEntryPrice > entryPrice) ||
                (!isLong && newEntryPrice < entryPrice)) {
                entryPrice = newEntryPrice;
            } else if (planType == TradingPlansModels.PlanType.OpenDriveContinuation60) {
                entryPrice = newEntryPrice;
            } else {
                Firestore.logError(`do not allow earlier custom entry price before opponent stops out`, logTags);
            }
        }
        if (widget.stopLossPriceLine) {
            Firestore.logError(`do not allow custom stop loss for red to green`, logTags);
        }
    }

    Strategies.overrideTradingPlans(plan, planType);
    let multipler = EntryRulesChecker.checkGlobalEntryRules(symbol, isLong, plan, logTags, entryPrice, stopOutPrice);
    if (multipler <= 0) {
        return 0;
    }
    breakoutEntryWithoutRules(symbol, isLong, entryPrice, stopOutPrice, riskLevelPrice, logTags, multipler, plan, "", "");
    return multipler;
};
export const clickOpenChasePlan = (symbol: string, shiftKey: boolean) => {
    let tradebooksMap = Models.getTradebooks(symbol);
    let openFlushTradebook = tradebooksMap.get(OpenFlush.openFlushShort);
    if (openFlushTradebook) {
        openFlushTradebook.startEntry(shiftKey, false, Models.getDefaultEntryParameters());
    } else {
        Firestore.logError(`no open flush tradebook for ${symbol}`);
    }
}
export const runRedToGreenPlan = (symbol: string, isLong: boolean, plan: TradingPlansModels.RedToGreenPlan) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}_red2green-plan`);
    let { entryPrice, stopOutPrice, riskLevelPrice } = Models.getHighLowBreakoutEntryStopPrice(symbol, isLong);
    let widget = Models.getChartWidget(symbol);
    if (widget) {
        if (widget.entryPriceLine) {
            let newEntryPrice = widget.entryPriceLine.options().price;
            if ((isLong && newEntryPrice > entryPrice) ||
                (!isLong && newEntryPrice < entryPrice)) {
                entryPrice = newEntryPrice;
            } else {
                Firestore.logError(`do not allow custom price before opponent stops out`, logTags);
            }
        }
        if (widget.stopLossPriceLine) {
            Firestore.logError(`do not allow custom stop loss for red to green`, logTags);
        }
    }

    Strategies.overrideTradingPlans(plan, TradingPlansModels.PlanType.RedToGreen);
    let multipler = EntryRulesChecker.checkRedToGreenPlanEntryRules(symbol, isLong, entryPrice, stopOutPrice, plan, logTags);
    if (multipler <= 0) {
        return 0;
    }
    breakoutEntryWithoutRules(symbol, isLong, entryPrice, stopOutPrice, riskLevelPrice, logTags, multipler, plan, "", "");
    return multipler;
};
export const runFirstNewHighPlanHigherTimeFrame = (symbol: string, isLong: boolean,
    timeframe: number,
    plan: TradingPlansModels.FirstNewHighPlan) => {
    let result = Patterns.checkFirstNewHighPattern(symbol, isLong, timeframe);
    let logTags = Models.generateLogTags(symbol, `1st_new_high_${timeframe}`);
    if (result.status != 'ok') {
        Firestore.logError(result.status);
        return;
    }
    let entryPrice = result.entryPrice;
    let symbolData = Models.getSymbolData(symbol);
    let stopOutPrice = isLong ? symbolData.lowOfDay : symbolData.highOfDay;
    let riskLevelPrice = Models.getRiskLevelPrice(symbol, stopOutPrice);
    let multipler = EntryRulesChecker.checkFirstNewHighPlanEntryRules(symbol, isLong, entryPrice, stopOutPrice, plan, logTags);
    if (multipler <= 0) {
        Firestore.logError(`multipler is zero during rules checking`, logTags);
        return;
    }
    let newPlan = {
        ...plan,
        timeframe: timeframe
    }
    breakoutEntryWithoutRules(symbol, isLong, entryPrice, stopOutPrice, riskLevelPrice, logTags, multipler, newPlan, "", "");
}
export const runFirstNewHighPlan = (symbol: string, isLong: boolean,
    plan: TradingPlansModels.FirstNewHighPlan,
    hasPreviousEntry: boolean, logTags: Models.LogTags) => {
    let result = Patterns.checkFirstNewHighPattern(symbol, isLong, 1);
    if (result.status == 'first 2 candles not closed') {
        Firestore.logError(result.status + ", continue in next cycle", logTags);
        return {
            orderSubmitted: false,
            needContinueNextCycle: true,
        };
    } else if (result.status == 'no closed reversal bar') {
        Firestore.logError(result.status, logTags);
        return {
            orderSubmitted: false,
            needContinueNextCycle: true,
        }
    } else if (result.status == 'already triggered in previous candle') {
        Firestore.logError(result.status, logTags);
        return {
            orderSubmitted: false,
            needContinueNextCycle: false,
        };
    }
    let useMarketOrder = result.status == 'already triggered in current candle';
    let symbolData = Models.getSymbolData(symbol);
    let stopOutPrice = symbolData.lowOfDay;
    if (!isLong) {
        stopOutPrice = symbolData.highOfDay;
    }
    let riskLevelPrice = Models.getRiskLevelPrice(symbol, stopOutPrice);
    Strategies.overrideTradingPlans(plan, TradingPlansModels.PlanType.FirstNewHigh);

    if (useMarketOrder) {
        Firestore.logError(result.status, logTags);
        Firestore.logInfo('submit market order');
        return enterMarketOrderForFirstNewHigh(symbol, isLong, hasPreviousEntry, stopOutPrice, plan, logTags);
    }

    let entryPrice = result.entryPrice;
    // check opposite position
    let currentQuantity = Models.getPositionNetQuantity(symbol);
    let hasOppositionPosition = (isLong && currentQuantity < 0) || (!isLong && currentQuantity > 0);
    if (hasOppositionPosition) {
        // adjust exit stops
        AdjustExitsHandler.adjustAllStopExitsWithoutRule(symbol, entryPrice);
    }
    let entryOrders = Models.getBreakoutEntryOrders(symbol, isLong);
    let cancelPreviousEntry = false;
    if (entryOrders.length > 0 && entryOrders[0].price) {
        // has existing entry
        let oldEntryPrice = entryOrders[0].price;
        if ((isLong && oldEntryPrice > (entryPrice + 0.02)) ||
            (!isLong && oldEntryPrice < (entryPrice - 0.02))) {
            // cancel it if new entry price
            Broker.cancelBreakoutEntryOrders(symbol);
            cancelPreviousEntry = true;
        }
    }
    if (hasPreviousEntry) {
        if (cancelPreviousEntry) {
            let multipler = plan.planConfigs.size;
            breakoutEntryWithoutRules(symbol, isLong, entryPrice, stopOutPrice, riskLevelPrice, logTags, multipler, plan, "", "");
            return {
                orderSubmitted: true,
                needContinueNextCycle: true,
            };
        } else {
            return {
                orderSubmitted: true,
                needContinueNextCycle: true,
            };
        }
    } else {
        let multipler = EntryRulesChecker.checkFirstNewHighPlanEntryRules(symbol, isLong, entryPrice, stopOutPrice, plan, logTags);
        if (multipler <= 0) {
            Firestore.logError(`multipler is zero during rules checking`, logTags);
            return {
                orderSubmitted: false,
                needContinueNextCycle: false,
            };
        }
        breakoutEntryWithoutRules(symbol, isLong, entryPrice, stopOutPrice, stopOutPrice, logTags, multipler, plan, "", "");
        return {
            orderSubmitted: true,
            needContinueNextCycle: true,
        };
    }
};

export const enterMarketOrderForFirstNewHigh = (
    symbol: string, isLong: boolean, hasPreviousEntries: boolean,
    stopOutPrice: number, plan: TradingPlansModels.FirstNewHighPlan,
    logTags: Models.LogTags
) => {
    if (hasPreviousEntries) {
        let entryOrders = Models.getBreakoutEntryOrders(symbol, isLong);
        let ids: string[] = [];
        entryOrders.forEach((eo: Models.EntryOrderModel) => {
            ids.push(eo.orderID);
        });
        Broker.cancelOrders(ids);
    }
    let entryPrice = Models.getCurrentPrice(symbol);
    let multipler = plan.planConfigs.size;
    if (!hasPreviousEntries) {
        multipler = EntryRulesChecker.checkFirstNewHighPlanEntryRules(symbol, isLong, entryPrice, stopOutPrice, plan, logTags);
        if (multipler <= 0) {
            Firestore.logError(`multipler is zero during rules checking`, logTags);
            return {
                orderSubmitted: false,
                needContinueNextCycle: false,
            };
        }
    }
    marketEntryWithoutRules(symbol, isLong, stopOutPrice, stopOutPrice, logTags, multipler, plan, "");
    return {
        orderSubmitted: true,
        needContinueNextCycle: true,
    };
}


export const runReversalPlan = (symbol: string, isLong: boolean, plan: TradingPlansModels.ReversalPlan,
    useMarketOrder: boolean) => {
    let logTags = Models.generateLogTags(symbol, "reversal");
    let keyLevel = plan.keyLevel;
    let symbolData = Models.getSymbolData(symbol);
    let stopOutPrice = symbolData.lowOfDay;
    if (isLong) {
        if (symbolData.lowOfDay > keyLevel) {
            Firestore.logError(`not touch key level yet: ${keyLevel}`, logTags);
            return;
        }
    } else {
        if (symbolData.highOfDay < keyLevel) {
            Firestore.logError(`not touch key level yet: ${keyLevel}`, logTags);
            return;
        }
        stopOutPrice = symbolData.highOfDay;
    }
    let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
    if ((isLong && entryPrice < keyLevel) ||
        (!isLong && entryPrice > keyLevel)) {
        Firestore.logError(`entry price against key level ${entryPrice} ${keyLevel}`, logTags);
        return;
    }
    plan.planConfigs.setupQuality = TradingPlansModels.SetupQuality.Scalp;
    let size = EntryRulesChecker.checkGlobalEntryRules(symbol, isLong, plan, logTags, entryPrice, stopOutPrice);
    if (size <= 0) {
        return;
    }
    if (useMarketOrder) {
        marketEntryWithoutRules(symbol, isLong, stopOutPrice, stopOutPrice, logTags, size, plan, "");
    } else {
        breakoutEntryWithoutRules(symbol, isLong, entryPrice, stopOutPrice, stopOutPrice, logTags, size, plan, "", "");
    }
}

export const runBreakoutPlan = (symbol: string, isLong: boolean, marketOrder: boolean, plan: TradingPlansModels.LevelBreakoutPlan) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}_breakout-plan`);
    Firestore.logInfo(logTags.logSessionName, logTags);
    let hasClosedBeyond = Patterns.hasClosedBeyondPrice(symbol, isLong, plan.entryPrice);
    if (!hasClosedBeyond) {
        Firestore.logError(`not closed outside yet`, logTags);
        return;
    }
    let openPrice = Models.getOpenPrice(symbol);
    if (!openPrice) {
        return;
    }
    if ((isLong && openPrice > plan.entryPrice) ||
        (!isLong && openPrice < plan.entryPrice)) {
        Firestore.logError(`already opened outside, use gap and go instead`, logTags);
        return;
    }
    let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, marketOrder, Models.getDefaultEntryParameters());
    if ((isLong && entryPrice < plan.entryPrice) ||
        (!isLong && entryPrice > plan.entryPrice)) {
        Firestore.logError(`entry price not outside`, logTags);
        return;
    }

    let symbolData = Models.getSymbolData(symbol);
    let stopOutPrice = isLong ? symbolData.lowOfDay : symbolData.highOfDay;


    Strategies.overrideTradingPlans(plan, TradingPlansModels.PlanType.LevelBreakout);
    let multipler = EntryRulesChecker.checkLevelBreakoutPlanEntryRules(symbol, isLong, entryPrice, stopOutPrice, plan, logTags);
    if (multipler <= 0) {
        return;
    }
    if (marketOrder) {
        marketEntryWithoutRules(symbol, isLong, stopOutPrice, stopOutPrice, logTags, multipler, plan, "");
    } else {
        breakoutEntryWithoutRules(symbol, isLong, entryPrice, stopOutPrice, stopOutPrice, logTags, multipler, plan, "", "");
    }
}