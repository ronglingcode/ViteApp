import * as RiskManager from '../algorithms/riskManager';
import * as TakeProfit from '../algorithms/takeProfit';
import * as Models from '../models/models';
import * as TradingState from '../models/tradingState';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Broker from '../api/broker';
import * as Config from '../config/config';
import * as Firestore from '../firestore';
import * as Helper from '../utils/helper';
import * as EntryHandler from './entryHandler';
import * as AdjustExitsHandler from './adjustExitsHandler';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
declare let window: Models.MyWindow;

export const submitAddPartial = async (
    symbol: string, entryPrice: number, stopOutPrice: number, isLong: boolean, quantity: number,
    orderType: Models.OrderType, logTags: Models.LogTags,
) => {
    // use 5R for target because sometimes reload at very close to stop price
    let targetPrice = getTargetPriceForReload(symbol, isLong, entryPrice, stopOutPrice);
    Broker.submitEntryOrderWithBracket(
        symbol, quantity, isLong, orderType,
        entryPrice, targetPrice, stopOutPrice, logTags,
    )
};

export const submitBreakoutOrders = (
    symbol: string, entryPrice: number, stopOut: number, riskLevel: number, isLong: boolean, multiplier: number,
    plan: TradingPlansModels.BasePlan, tradebookID: string,
    logTags: Models.LogTags,
    orderIdToReplace: string
) => {
    Firestore.logInfo("Submitting breakout orders!!! submitBreakoutOrders()", logTags);
    let sizingCount = TakeProfit.BatchCount;
    if (plan.planConfigs.sizingCount) {
        sizingCount = plan.planConfigs.sizingCount;
    }
    let exitTargets = plan.targets;
    let orderType = Models.OrderType.STOP;
    let currentPrice = Models.getCurrentPrice(symbol);
    if ((isLong && currentPrice > entryPrice) || (!isLong && currentPrice < entryPrice)) {
        orderType = Models.OrderType.LIMIT;
    }
    let fixedQuantity = Models.getFixedQuantityFromInput(symbol);
    if (fixedQuantity > 0) {
        Firestore.logInfo(`fix quantity ${fixedQuantity}`, logTags);
        let submitEntryResult = submitEntryOrdersWithFixedQuantity(
            symbol, orderType, isLong,
            entryPrice, stopOut,
            fixedQuantity, exitTargets, tradebookID, logTags, orderIdToReplace
        );
        return submitEntryResult;
    } else {
        //Firestore.logInfo(`fixed risk ${multiplier}`, logTags);
        let submitEntryResult = submitEntryOrdersWithFixedRisk(
            symbol, orderType, isLong, entryPrice, stopOut, riskLevel, "default quality",
            multiplier, sizingCount, exitTargets, tradebookID, logTags, orderIdToReplace
        );
        Firestore.logDebug(`entry with quantity ${submitEntryResult.totalQuantity}`, logTags);
        return submitEntryResult;
    }
};

export const submitMarketEntryOrders = (
    symbol: string, estimatedEntryPrice: number, stopOutPrice: number, riskLevel: number, isLong: boolean, multiplier: number,
    plan: TradingPlansModels.BasePlan,
    tradebookID: string, logTags: Models.LogTags) => {
    Firestore.logInfo("Submitting market orders!!! submitMarketEntryOrders()", logTags);
    let orderIdToReplace = '';
    let sizingCount = TakeProfit.BatchCount;
    if (plan.planConfigs.sizingCount) {
        sizingCount = plan.planConfigs.sizingCount;
    }
    let exitTargets = plan.targets;
    let fixedQuantity = Models.getFixedQuantityFromInput(symbol);
    if (fixedQuantity > 0) {
        let submitEntryResult = submitEntryOrdersWithFixedQuantity(
            symbol, Models.OrderType.MARKET, isLong, estimatedEntryPrice, stopOutPrice,
            fixedQuantity, exitTargets, tradebookID, logTags, orderIdToReplace
        );
        return submitEntryResult;
    } else {
        let submitEntryResult = submitEntryOrdersWithFixedRisk(
            symbol, Models.OrderType.MARKET, isLong, estimatedEntryPrice,
            stopOutPrice, riskLevel,
            "A", multiplier, sizingCount, exitTargets, tradebookID, logTags, orderIdToReplace
        );
        return submitEntryResult;
    }
}

export const submitEntryOrdersWithFixedRisk = (
    symbol: string, orderType: Models.OrderType, isLong: boolean,
    entryPrice: number, stopOutPrice: number, riskLevel: number, setupQuality: string, multiplier: number,
    sizingCount: number,
    exitTargets: TradingPlansModels.ExitTargets, tradebookID: string, logTags: Models.LogTags,
    orderIdToReplace: string
) => {
    let isEquity = Config.getProfileSettingsForSymbol(symbol).isEquity;
    let afterSplippage = addSlippage(symbol, isLong, entryPrice, stopOutPrice, isEquity);
    entryPrice = afterSplippage.entryPrice;
    stopOutPrice = afterSplippage.stopOutPrice;

    let totalShares = RiskManager.calculateTotalShares(symbol, entryPrice, riskLevel, setupQuality, multiplier);
    let topPlan = TradingPlans.getTradingPlans(symbol);
    let atr = topPlan.atr;
    if (atr.maxQuantity > 0) {
        if (totalShares > atr.maxQuantity) {
            Firestore.logError(`totalShares ${totalShares} > atr.maxQuantity ${atr.maxQuantity}`, logTags);
            totalShares = atr.maxQuantity;
        }
    }
    let profitTargets = TakeProfit.getInitialProfitTargets(symbol, totalShares, entryPrice, riskLevel, exitTargets.initialTargets, logTags);
    let sizedProfitTargets: Models.ProfitTarget[] = [];
    for (let i = 0; i < profitTargets.length && i < sizingCount; i++) {
        sizedProfitTargets.push(profitTargets[i]);
    }

    let submitResult = submitEntryOrders(symbol, isLong, orderType, entryPrice, stopOutPrice, sizedProfitTargets, tradebookID, logTags, orderIdToReplace);
    return submitResult;
};

export const submitEntryOrdersWithFixedQuantity = (
    symbol: string, orderType: Models.OrderType, isLong: boolean,
    entryPrice: number, stopOutPrice: number, quantity: number,
    exitTargets: TradingPlansModels.ExitTargets,
    tradebookID: string, logTags: Models.LogTags,
    orderIdToReplace: string
) => {
    let isEquity = Config.getProfileSettingsForSymbol(symbol).isEquity;
    let afterSplippage = addSlippage(symbol, isLong, entryPrice, stopOutPrice, isEquity);
    entryPrice = afterSplippage.entryPrice;
    stopOutPrice = afterSplippage.stopOutPrice;

    let totalShares = quantity;

    let profitTargets = TakeProfit.getProfitTargetsForFixedQuantity(symbol, totalShares, entryPrice, stopOutPrice, exitTargets);
    let submitResult = submitEntryOrders(symbol, isLong, orderType, entryPrice, stopOutPrice, profitTargets, tradebookID, logTags, orderIdToReplace);
    return submitResult;
};

const addSlippage = (symbol: string, isLong: boolean, entryPrice: number, stopOutPrice: number, isEquity: boolean) => {
    if (isEquity) {
        // add 1 cent for slippage
        if (isLong) {
            entryPrice = RiskManager.addCents(entryPrice, 1);
            stopOutPrice = RiskManager.minusCents(stopOutPrice, 1);
        } else {
            entryPrice = RiskManager.minusCents(entryPrice, 1);
            stopOutPrice = RiskManager.addCents(stopOutPrice, 1);
        }
    }
    return {
        "entryPrice": entryPrice,
        "stopOutPrice": stopOutPrice,
    }
}

export const submitEntryOrders = (symbol: string, isLong: boolean,
    orderType: Models.OrderType, entryPrice: number, stopOutPrice: number, profitTargets: Models.ProfitTarget[],
    tradebookID: string,
    logTags: Models.LogTags,
    orderIdToReplace: string) => {

    let totalQuantity = 0;
    profitTargets.forEach((profitTarget: any) => {
        let quantity = profitTarget.quantity;
        totalQuantity += quantity;
    });
    let hasEnoughBuyingPower = RiskManager.hasEnoughBuyingPower(entryPrice, totalQuantity);
    // reduce to half size when not having enough buying power, it's probably a trade with too tight stops
    if (!hasEnoughBuyingPower) {
        hasEnoughBuyingPower = RiskManager.hasEnoughBuyingPower(entryPrice, totalQuantity / 2);
        if (hasEnoughBuyingPower) {
            totalQuantity = 0;
            for (let i = 0; i < profitTargets.length; i++) {
                profitTargets[i].quantity = profitTargets[i].quantity / 2;
                totalQuantity += profitTargets[i].quantity;
            }
        } else {
            Firestore.logError(`Not enough buying power after reducing to half size for ${totalQuantity} shares at ${entryPrice}`, logTags);
            let result: Models.SubmitEntryResult = {
                totalQuantity: totalQuantity,
                profitTargets: profitTargets,
                isSingleOrder: false,
                tradeBookID: tradebookID,
            };
            return result;
        }
    }
    Broker.submitEntryOrderWithMultipleBrackets(
        symbol, totalQuantity, isLong, orderType, entryPrice, profitTargets, stopOutPrice, logTags,
        orderIdToReplace
    );
    let result: Models.SubmitEntryResult = {
        totalQuantity: totalQuantity,
        profitTargets: profitTargets,
        isSingleOrder: false,
        tradeBookID: tradebookID,
    };
    return result;
}

export const marketOut = async (symbol: string, quantity: number, logTags: Models.LogTags) => {
    let netQuantity = Models.getPositionNetQuantity(symbol);
    let isLong = netQuantity > 0;
    return Broker.submitSingleOrder(symbol, Models.OrderType.MARKET, quantity, 0, !isLong, false, logTags);
}

export const adjustSimpleOrdersWithNewPrice = async (orders: Models.OrderModel[], newPrice: number, logTags: Models.LogTags) => {
    orders.forEach(order => {
        Broker.replaceSimpleOrderWithNewPrice(order, newPrice, logTags);
    });
};
export const adjustExitPairsWithNewPrice = async (symbol: string,
    pairs: Models.ExitPair[], newPrice: number,
    isStopLeg: boolean, positionIsLong: boolean, logTags: Models.LogTags
) => {
    if (isStopLeg) {
        let { newUpdatedPrice } = AdjustExitsHandler.prepareAdjustStopExits(symbol, newPrice, '');
        newPrice = newUpdatedPrice;
    }
    pairs.forEach(pair => {
        Broker.replaceExitPairWithNewPrice(pair, newPrice, isStopLeg, positionIsLong, logTags);
    })
}

export const adjustHalfExitOrdersWithNewPrice = async (symbol: string, newPrice: number,
    pairs: Models.ExitPair[], logTags: Models.LogTags) => {
    let useStopLeg = isStopLeg(symbol, newPrice);
    let positionIsLong = Models.getPositionNetQuantity(symbol) > 0;
    adjustExitPairsWithNewPrice(symbol, pairs, newPrice, useStopLeg, positionIsLong, logTags);

};
export const moveAllStopExitsToNewPrice = async (symbol: string, newPrice: number, logTags: Models.LogTags) => {
    let exitPairs = Models.getExitPairs(symbol);
    let netQuantity = Models.getPositionNetQuantity(symbol);
    let positionIsLong = netQuantity > 0;
    adjustExitPairsWithNewPrice(symbol, exitPairs, newPrice, true, positionIsLong, logTags);
};

export const raiseAllTargetsBelow = async (symbol: string, isLong: boolean, newPrice: number, logTags: Models.LogTags) => {
    let exitPairs = Models.getExitPairs(symbol);
    let allowedPairs: Models.ExitPair[] = [];
    exitPairs.forEach(pair => {
        if (pair.LIMIT && pair.LIMIT.price) {
            let oldPrice = pair.LIMIT.price;
            if ((isLong && newPrice > oldPrice) ||
                (!isLong && newPrice < oldPrice)) {
                allowedPairs.push(pair);
            }
        }
    });

    let netQuantity = Models.getPositionNetQuantity(symbol);
    let positionIsLong = netQuantity > 0;

    adjustExitPairsWithNewPrice(symbol, exitPairs, newPrice, false, positionIsLong, logTags);
};

export const getHalfExitOrdersPairs = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget)
        return [];
    let pairs = widget.exitOrderPairs;
    let halfOfPairs = [];
    for (let i = 0; i < pairs.length / 2; i++) {
        halfOfPairs.push(pairs[i]);
    }
    return halfOfPairs;
};
export const isStopLeg = (symbol: string, newPrice: number) => {
    let currentPrice = Models.getCurrentPrice(symbol);
    let netQuantity = Models.getPositionNetQuantity(symbol);
    if (netQuantity == 0) {
        Firestore.logError(`isStopLeg: netQuantity should not be 0`);
        // could be timing issue, try to guess the position by looking at exit pairs
        let exitPairs = Models.getExitPairs(symbol);
        if (exitPairs.length > 0) {
            let firstPair = exitPairs[0];
            if (firstPair.STOP) {
                netQuantity = guessNetQuantityFromExitOrder(firstPair.STOP.isBuy);
            } else if (firstPair.LIMIT) {
                netQuantity = guessNetQuantityFromExitOrder(firstPair.LIMIT.isBuy);
            }
        }
    }
    return (netQuantity > 0 && newPrice < currentPrice) ||
        (netQuantity < 0 && newPrice > currentPrice);
}
export const guessNetQuantityFromExitOrder = (exitIsBuy: boolean) => {
    if (exitIsBuy) {
        return -1;
    } else {
        return 1;
    }
}
export const chooseOrderLeg = (symbol: string, pairs: Models.ExitPair[], newPrice: number) => {
    let chooseStopLeg = isStopLeg(symbol, newPrice);
    let orders: Models.OrderModel[] = [];
    pairs.forEach(pair => {
        if (chooseStopLeg) {
            if (pair.STOP)
                orders.push(pair['STOP']);
        }
        else {
            if (pair.LIMIT)
                orders.push(pair['LIMIT']);
        }
    });
    return orders;
};

export const getTargetPriceForReload = (symbol: string, isLong: boolean,
    entryPrice: number, stopOutPrice: number) => {
    let exitPairs = Models.getExitOrdersPairs(symbol);
    if (exitPairs.length > 0) {
        let targetPrices: number[] = [];
        exitPairs.forEach(pair => {
            if (pair.LIMIT && pair.LIMIT.price) {
                targetPrices.push(pair.LIMIT.price);
            }
        });
        if (isLong) {
            return Math.min(...targetPrices);
        } else {
            return Math.max(...targetPrices);
        }
    } else {
        let risk = Math.abs(entryPrice - stopOutPrice);
        let exitPrice = isLong ? entryPrice + risk : entryPrice - risk;
        return Helper.roundPrice(symbol, exitPrice);
    }
}

export const replaceEntryWithNewStopByCancelAndResubmit = (symbol: string, isLong: boolean,
    entryPrice: number, newStopLoss: number,
    initialSizeMultiplier: number, plan: TradingPlansModels.BasePlan,
    tradebookID: string, logTags: Models.LogTags) => {
    Firestore.logDebug('update entry orders by cancel and resubmit', logTags);
    Broker.cancelBreakoutEntryOrders(symbol);
    EntryHandler.breakoutEntryWithoutRules(
        symbol, isLong, entryPrice, newStopLoss, newStopLoss, logTags, initialSizeMultiplier, plan, tradebookID, "");
}


export const replaceEntryWithNewStopByReplacement = (symbol: string, isLong: boolean,
    entryPrice: number, newStopLoss: number,
    initialSizeMultiplier: number, plan: TradingPlansModels.BasePlan,
    tradebookID: string, logTags: Models.LogTags) => {
    Firestore.logDebug('update entry orders by replacement', logTags);
    let entryOrders = Models.getEntryOrders(symbol);
    if (entryOrders.length != 1) {
        Firestore.logError(`replaceEntryWithNewStopByReplacement: expected 1 entry order, got ${entryOrders.length}`, logTags);
        return;
    }
    let entryOrder = entryOrders[0];
    EntryHandler.breakoutEntryWithoutRules(
        symbol, isLong, entryPrice, newStopLoss, newStopLoss, logTags, initialSizeMultiplier, plan, tradebookID, entryOrder.orderID);
}

export const submitExitPairs = (symbol: string, profitTargets: Models.ProfitTarget[], stopLoss: number,
    logTags: Models.LogTags) => {
    let netQuantity = Models.getPositionNetQuantity(symbol);
    let positionIsLong = true;
    if (netQuantity > 0) {
        positionIsLong = true;
    } else if (netQuantity < 0) {
        positionIsLong = false;
    } else {
        return;
    }
    let remainingQuantity = Math.abs(netQuantity);
    let i = profitTargets.length - 1;

    while (i >= 0 && remainingQuantity > 0) {
        let pt = profitTargets[i];
        Broker.submitExitOrderWithBroker(
            symbol, pt.quantity, positionIsLong, pt.target, stopLoss, logTags
        )
        remainingQuantity -= pt.quantity;
        i--;
    }
}
export const mytest = () => {
    let symbol = 'VKTX';
    let profitToTargets: Models.ProfitTarget[] = [
        {
            quantity: 1,
            target: 90,
        }
    ];
    let logTags: Models.LogTags = {
        symbol: symbol,
        logSessionName: 'mytest',
    };
    submitExitPairs(symbol, profitToTargets, 400, logTags);
}

export const mytest2 = () => {
    Broker.submitExitOrderWithBroker(
        'TSLA', 1, true, 182, 178, {}
    )
}

export const updateTargets = (symbol: string, description: string, targets: number[]) => {
    let logTags = Models.generateLogTags(symbol, "update_target")
    if (description.length < 200) {
        Firestore.logError(`not enough description ${description.length} < 200`, logTags);
        return;
    }
    let positionIsLong = Models.getPositionNetQuantity(symbol) > 0;
    let ts = TradingState.getBreakoutTradeState(symbol, positionIsLong);
    if (ts.exitDescription && ts.exitDescription.length > 0) {
        Firestore.logError(`already updated: ${ts.exitDescription}`, logTags);
        return;
    }
    let pairs = Models.getExitPairs(symbol);
    let i = 0;
    let updated = false;
    while (i < pairs.length && i < targets.length) {
        let p = pairs[i];
        let t = targets[i];
        Broker.replaceExitPairWithNewPrice(p, t, false, positionIsLong, logTags);
        updated = true;
    }
    if (updated) {
        TradingState.setExitDescription(symbol, positionIsLong, description);
    }
}

export const tightenStop = (entryPrice: number, orignalStop: number, tightStop: number, originalSize: number) => {
    let originalRisk = Math.abs(entryPrice - orignalStop);
    let tightRisk = Math.abs(entryPrice - tightStop);
    let newSize = originalSize * tightRisk / originalRisk;
    return {
        newSize: newSize,
        newStop: tightStop,
    }
}