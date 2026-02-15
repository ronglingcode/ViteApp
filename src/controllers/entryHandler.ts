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
    TradingState.onPlaceBreakoutTrade(symbol, isLong, entryPrice, stopOutPrice, riskLevel, submitEntryResult, allowedSizeMutiplier, plan);
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
    TradingState.onPlaceMarketTrade(symbol, isLong, estimatedEntryPrice, stopOutPrice, riskLevel, submitEntryResult, allowedSizeMutiplier, plan);
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
    let riskLevelPrice = Models.getRiskLevelPrice(symbol, isLong, stopOutPrice, entryPrice);
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