import * as Chart from "../ui/chart";
import * as Firestore from '../firestore';
import * as OrderFlow from './orderFlow';
import * as Helper from '../utils/helper';
import * as Config from '../config/config';
import * as RiskManager from '../algorithms/riskManager';
import * as TakeProfit from '../algorithms/takeProfit';
import * as TraderFocus from './traderFocus';
import * as AutoTrader from '../algorithms/autoTrader';
import * as Patterns from '../algorithms/patterns';
import * as EntryRulesChecker from './entryRulesChecker';
import * as EntryHandler from './entryHandler';
import * as ExitRulesChecker from './exitRulesChecker';
import * as ExitRulesCheckerNew from './exitRulesCheckerNew';
import * as Models from '../models/models';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as TradingState from '../models/tradingState';
import * as Broker from '../api/broker';
import * as AdjustExitsHandler from './adjustExitsHandler';
import { VwapContinuationFailed } from '../tradebooks/singleKeyLevel/vwapContinuationFailed';

export const cancelKeyPressed = async (symbol: string) => {
    let exitPairs = Models.getExitPairs(symbol);
    if (exitPairs.length < TakeProfit.BatchCount * 0.4) {
        Broker.cancelAllEntryOrders(symbol);
    } else {
        Broker.cancelBreakoutEntryOrders(symbol);
    }
    TradingState.clearPendingOrder(symbol);
    AutoTrader.clearExistingAlgos(symbol);
}

export const hasSplitPartials = (symbol: string, isLong: boolean) => {
    let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
    if (!breakoutTradeState.submitEntryResult.isSingleOrder) {
        return true;
    }
    let exits = Models.getExitOrdersPairs(symbol);
    let hasLargeExits = false;
    let regularSize = breakoutTradeState.submitEntryResult.totalQuantity;
    let threshold = regularSize * 2;
    for (let i = 0; i < exits.length; i++) {
        let exit = exits[i];
        if (exit.LIMIT) {
            if (exit.LIMIT.quantity > threshold) {
                hasLargeExits = true;
                break;
            }
        } else if (exit.STOP) {
            if (exit.STOP.quantity > threshold) {
                hasLargeExits = true;
                break;
            }
        }
    }
    return !hasLargeExits;
}
export const resetStop = async (symbol: string, isSingle: boolean) => {
    let netQ = Models.getPositionNetQuantity(symbol);
    let positionIsLong = netQ > 0;
    let symbolData = Models.getSymbolData(symbol);
    let newPrice = positionIsLong ? symbolData.lowOfDay : symbolData.highOfDay;
    let pairs = Models.getExitPairs(symbol);
    let logTags = Models.generateLogTags(symbol, `reset_stop`);
    for (let i = 0; i < pairs.length; i++) {
        let p = pairs[i];
        if (p.STOP && p.STOP.price && p.STOP.price != newPrice) {
            OrderFlow.adjustExitPairsWithNewPrice(symbol, [p], newPrice, true, positionIsLong, logTags);
            if (isSingle) {
                break;
            }
        }
    }
    onAdjustExits(symbol);
}

export const onAdjustExits = (symbol: string) => {
    let w = Models.getChartWidget(symbol);
    if (!w) {
        return;
    }
    let totalCount = w.exitOrderPairs.length;
    /*
    if (8 < totalCount) {
        Helper.speak("manage first pullback, raise stop instead of lower target");
    } else if (5 <= totalCount) {
        Helper.speak("partial at key levels and use trailing stop");
    } else if (totalCount > 0) {
        Helper.speak("higher timeframe and re-entry");
    }*/
}
export const trailStopAll = async (symbol: string, timeFrame: number) => {
    trailStopCore(symbol, timeFrame, false, false);
}
export const trailStop = async (symbol: string, timeFrame: number, shiftKey: boolean) => {
    trailStopCore(symbol, timeFrame, shiftKey, true);
}
export const trailStopCore = async (symbol: string, timeFrame: number, shiftKey: boolean, isSingle: boolean) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget || !widget.exitOrderPairs || widget.exitOrderPairs.length <= 0) {
        return;
    }
    let logPostfix = isSingle ? "single" : "all";
    let logTags = Models.generateLogTags(symbol, `${symbol}-trail_stop_${timeFrame}_${logPostfix}`);
    Firestore.logInfo(logTags.logSessionName, logTags);

    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    let bars = Models.aggregateCandles(candles, timeFrame);
    if (bars.length < 2) {
        Firestore.logError(`not enough bars ${bars.length}`, logTags);
        return;
    }

    let lastClosedBar = bars[bars.length - 2];
    let netQ = Models.getPositionNetQuantity(symbol);
    let positionIsLong = netQ > 0;
    if (shiftKey) {
        if (positionIsLong) {
            if (!Patterns.hasLowerLow(candles)) {
                Firestore.logError(`no lower low yet, disable market out trailing stop`, logTags);
                return;
            }
        } else {
            if (!Patterns.hasHigherHigh(candles)) {
                Firestore.logError(`no higher high yet, disable market out trailing stop`, logTags);
                return;
            }
        }
    }
    let newPrice = positionIsLong ? lastClosedBar.low : lastClosedBar.high;
    newPrice = Helper.roundPriceWithDirection(symbol, newPrice, !positionIsLong);
    newPrice = Helper.addMinimumPriceIncrement(symbol, !positionIsLong, newPrice);
    Firestore.logInfo(`last closed bar, open: ${lastClosedBar.open}, close: ${lastClosedBar.close}, high: ${lastClosedBar.high}, low: ${lastClosedBar.low}`);
    let pairs = Models.getExitPairs(symbol);
    for (let i = 0; i < pairs.length; i++) {
        let p = pairs[i];
        if (p.STOP && p.STOP.price && p.STOP.price != newPrice) {
            let keyIndex = i;
            let batchIndex = Helper.getBatchIndex(keyIndex, TakeProfit.BatchCount, pairs.length);
            if (ExitRulesChecker.checkTrailStopSingleRules(symbol, batchIndex, timeFrame, logTags)) {
                if (shiftKey) {
                    Broker.instantOutOneExitPair(symbol, positionIsLong, p, logTags);
                } else {
                    OrderFlow.adjustExitPairsWithNewPrice(symbol, [p], newPrice, true, positionIsLong, logTags);
                }
            }
            if (isSingle) {
                break;
            }
        }
    }
    onAdjustExits(symbol);
}

export const trailStopBatch = async (symbol: string, timeFrame: number) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget || !widget.exitOrderPairs || widget.exitOrderPairs.length <= 0) {
        return;
    }
    let logTags = Models.generateLogTags(symbol, `${symbol}-trail_stop_${timeFrame}`);
    Firestore.logInfo(logTags.logSessionName, logTags);


    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    let bars = Models.aggregateCandles(candles, timeFrame);
    if (bars.length < 2) {
        Firestore.logError(`not enough bars ${bars.length}`, logTags);
        return;
    }
    let allowedCount = ExitRulesChecker.checkTrailStopRules(symbol, timeFrame, logTags);

    let lastClosedBar = bars[bars.length - 2];
    let netQ = Models.getPositionNetQuantity(symbol);
    let positionIsLong = netQ > 0;
    let newPrice = positionIsLong ? lastClosedBar.low : lastClosedBar.high;
    Firestore.logInfo(`last closed bar, open: ${lastClosedBar.open}, close: ${lastClosedBar.close}, high: ${lastClosedBar.high}, low: ${lastClosedBar.low}`);
    let pairs = Models.getExitPairs(symbol);
    let i = pairs.length - 1;
    let pairsToTrail = [];

    while (i >= 0 && pairsToTrail.length < allowedCount) {
        pairsToTrail.push(pairs[i]);
        i--;
    }
    OrderFlow.adjustExitPairsWithNewPrice(symbol, pairsToTrail, newPrice, true, positionIsLong, logTags);
    Helper.speak("trail stop");
}

export const numberKeyPressed = async (symbol: string, keyCode: string, isFromBatch: boolean) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}-adjust_exit`);
    // "Digit1" -> 1, "Digit2" -> 2
    Firestore.logInfo(logTags.logSessionName, logTags);
    let { pair, keyIndex, totalPairsCount } = getExitPairFromKeyCode(symbol, keyCode, "Digit", logTags);
    if (!pair)
        return;

    let newPrice = Chart.getCrossHairPrice(symbol);
    if (!newPrice) {
        Firestore.logError(`no cross hair price for ${symbol}`, logTags);
        return;
    }
    let orders = OrderFlow.chooseOrderLeg(symbol, [pair], newPrice);
    let netQ = Models.getPositionNetQuantity(symbol);
    let positionIsLong = netQ > 0;
    let partialsSplitted = hasSplitPartials(symbol, positionIsLong);

    let isStopLeg = OrderFlow.isStopLeg(symbol, newPrice);
    if (isStopLeg) {
        let { newUpdatedPrice } = AdjustExitsHandler.prepareAdjustStopExits(symbol, newPrice, '');
        newPrice = newUpdatedPrice;
    }
    Firestore.logInfo(`partial splitted: ${partialsSplitted}, isStopLeg: ${isStopLeg}`);
    if (!partialsSplitted && !isStopLeg) {
        replaceWithProfitTakingExitOrders(symbol, false, newPrice);
        Firestore.logError(`retry after split to partials`, logTags);
        return;
    }
    let isLimitOrder = true;
    if (orders.length > 0) {
        if (orders[0].orderType == Models.OrderType.STOP) {
            isLimitOrder = false;
        }
    }

    if (isLimitOrder) {
        AdjustExitsHandler.tryAdjustSingleLimitExit(symbol, positionIsLong, keyIndex, orders[0], pair, newPrice, isFromBatch, totalPairsCount, logTags);
    } else {
        AdjustExitsHandler.tryAdjustSingleStopExit(symbol, positionIsLong, keyIndex, orders[0], pair, newPrice, isFromBatch, totalPairsCount, logTags);
    }
};

export const numberPadPressed = async (symbol: string, keyCode: string) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}-market_out_exit`);
    // "Numpad1" -> 1, "Numpad2" -> 2
    Firestore.logInfo(logTags.logSessionName, logTags);
    let { pair, keyIndex, totalPairsCount } = getExitPairFromKeyCode(symbol, keyCode, "Numpad", logTags);
    if (!pair || (!pair.LIMIT && !pair.STOP)) {
        Firestore.logError(`incomplete pair ${symbol}`, logTags);
        return;
    }
    let allowed = ExitRulesCheckerNew.isAllowedToMarketOutSingleOrder(symbol, keyIndex, logTags);
    if (!allowed) {
        return;
    }
    marketOutExitPair(symbol, pair, logTags);
    AdjustExitsHandler.afterAdjustSingleExit(symbol, totalPairsCount);
}
const marketOutExitPair = async (symbol: string, pair: Models.ExitPair, logTags: Models.LogTags) => {
    let netQ = Models.getPositionNetQuantity(symbol);
    let positionIsLong = netQ > 0;
    let partialsSplitted = hasSplitPartials(symbol, positionIsLong);
    if (!partialsSplitted) {
        replaceWithProfitTakingExitOrders(symbol, true, 0);
        Firestore.logInfo(`split to partials and market out one partial`, logTags);
        return;
    }

    Broker.instantOutOneExitPair(symbol, positionIsLong, pair, logTags);
    onAdjustExits(symbol);
};

const getExitPairFromKeyCode = (symbol: string, keyCode: string, prefix: string, logTags: Models.LogTags) => {
    let number = parseInt(keyCode[prefix.length]);
    if (number == 0) {
        number = 10;
    }
    let index = number - 1;
    let noneResult = {
        pair: undefined,
        keyIndex: -1,
        totalPairsCount: 0,
    };
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        Firestore.logError(`no exit pair for ${symbol} due to no chart widget`, logTags);
        return noneResult;
    }
    if (widget.exitOrderPairs.length <= index) {
        Firestore.logError(`no exit pair for ${symbol} due to out of range`, logTags);
        return noneResult;
    }
    return {
        pair: widget.exitOrderPairs[index],
        keyIndex: index,
        totalPairsCount: widget.exitOrderPairs.length,
    }
};

export const keyGPressed = async (symbol: string) => {
    let exitPairs = Models.getExitPairs(symbol);
    for (let i = 0; i < exitPairs.length / 2; i++) {
        numberKeyPressed(symbol, `Digit${i + 1}`, true);
    }
};

export const keyGPressedWithShift = async (symbol: string) => {
    let action = 'market_out_half_exits';
    let logTags = Models.generateLogTags(symbol, `${symbol}-${action}`)
    let usageKey = "marketOutHalf";
    Firestore.logInfo(logTags.logSessionName, logTags);
    let exitPairs = Models.getExitPairs(symbol);
    let allowedPairs: Models.ExitPair[] = [];
    for (let i = 0; i < exitPairs.length / 2; i++) {
        let keyIndex = i;
        //let allowed = ExitRulesCheckerNew.isAllowedToMarketOutSingleOrder(symbol, keyIndex, logTags);
        allowedPairs.push(exitPairs[i]);

    }
    for (let i = 0; i < allowedPairs.length; i++) {
        marketOutExitPair(symbol, allowedPairs[i], logTags);
    }
};
export const adjustBatchExits = async (symbol: string, code: string, shiftKey: boolean) => {
    let shortCode = code[code.length - 1];
    let logTags = Models.generateLogTags(symbol, `${symbol}-adjust_batch_exits_${shortCode}_${shiftKey}`);
    Firestore.logInfo(logTags.logSessionName, logTags);
    let newPrice = Chart.getCrossHairPrice(symbol);
    if (!shiftKey && !newPrice) {
        Firestore.logError(`no cross hair price for ${symbol}`, logTags);
        return;
    }
    if (code === 'KeyT' && newPrice) {
        adjustAllExits(symbol, newPrice, logTags);
        return;
    }
    if (code === 'KeyH' || code === 'KeyG') {
        if (shiftKey) {
            keyGPressedWithShift(symbol);
        } else {
            keyGPressed(symbol);
        }
        return;
    }
};
export const adjustAllExits = async (symbol: string, newPrice: number, logTags: Models.LogTags) => {
    let exitPairs = Models.getExitPairs(symbol);
    let currentPrice = Models.getCurrentPrice(symbol);
    let netQ = Models.getPositionNetQuantity(symbol);
    let isStopLeg = OrderFlow.isStopLeg(symbol, newPrice);
    Firestore.logInfo(`adjustAllExits: current ${currentPrice}, netQ ${netQ}, new ${newPrice}, isStopLeg ${isStopLeg}`);
    if (netQ == 0) {
        Firestore.logError(`adjustAllExits: netQ should not be 0, retry`);
        return;
    }
    let tradebook = TraderFocus.getTradebookFromPosition(symbol);
    if (tradebook) {
        let result = tradebook.getDisallowedReasonToAdjustAllExitPairs(symbol, logTags, newPrice);
        if (!result.allowed) {
            Firestore.logInfo(`adjust exit pairs disallowed: ${result.reason}`, logTags);
            return;
        }
    }
    if (isStopLeg) {
        let { newUpdatedPrice } = AdjustExitsHandler.prepareAdjustStopExits(symbol, newPrice, '');
        newPrice = newUpdatedPrice;
    }
    let positionIsLong = netQ > 0;
    OrderFlow.adjustExitPairsWithNewPrice(symbol, exitPairs, newPrice, isStopLeg, positionIsLong, logTags);
}
export const setRiskLevel = (symbol: string) => {
    let crosshairPrice = Chart.getCrossHairPrice(symbol);
    if (crosshairPrice)
        Chart.drawRiskLevel(symbol, crosshairPrice);
}
export const raiseTargetsIfWasLess = (symbol: string) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}-raise_all_exits_below`);
    Firestore.logInfo(logTags.logSessionName, logTags);
    let newPrice = Chart.getCrossHairPrice(symbol);
    if (!newPrice) {
        Firestore.logError(`no cross hair price for ${symbol}`, logTags);
        return;
    }
    let netQuantity = Models.getPositionNetQuantity(symbol);
    let isLong = netQuantity > 0;
    OrderFlow.raiseAllTargetsBelow(symbol, isLong, newPrice, logTags);
    onAdjustExits(symbol);
}

export const swapPositionKeyPressed = async (symbol: string) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}-swap_position`);
    Firestore.logInfo(logTags.logSessionName, logTags);
    let netQuantity = Models.getPositionNetQuantity(symbol);
    if (netQuantity == 0) {
        Firestore.logError(`no position for ${symbol}`, logTags);
        return;
    }
    let isLong = netQuantity > 0;
    let symbolData = Models.getSymbolData(symbol);
    let currentPrice = Models.getCurrentPrice(symbol);
    let range = symbolData.highOfDay - symbolData.lowOfDay;
    let newEntryPrice = isLong ? symbolData.highOfDay : symbolData.lowOfDay;
    let stopOutPrice = isLong ? symbolData.lowOfDay : symbolData.highOfDay;
    let distance = Math.abs(currentPrice - newEntryPrice);
    let distanceRatio = distance / range;
    if (distanceRatio > 0.35) {
        Firestore.logError(`loss greater than 35% as ${distanceRatio}, too wide for swap`, logTags);
        //return;
    }

    let symbolState = TradingState.getSymbolState(symbol);
    let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
    let initialQuantity = breakoutTradeState.initialQuantity;
    let initialMultiplier = RiskManager.quantityToRiskMultiples(range, initialQuantity);
    if (!symbolState.activeBasePlan) {
        Firestore.logError(`cannot swap due to missing active base plan`, logTags);
        return;
    }
    let oldPlan = symbolState.activeBasePlan;

    let hasEntry = Models.hasEntryOrdersInSameDirection(symbol, isLong);
    if (hasEntry) {
        Broker.marketOutExitPairsButOne(symbol, netQuantity, logTags);
    } else {
        flattenPositionWithoutCheckingRules(symbol, netQuantity, logTags);
        setTimeout(() => {
            EntryHandler.breakoutEntryWithoutRules(symbol, isLong, newEntryPrice, stopOutPrice, stopOutPrice, logTags, initialMultiplier, oldPlan, "", "")
        }, 500);
    }
};

const flattenPositionWithoutCheckingRules = async (symbol: string, netQuantity: number, logTags: Models.LogTags) => {
    TradingState.clearPendingOrder(symbol);
    let finished = Broker.flattenPosition(symbol, netQuantity, logTags);
    return finished;
};

export const flattenPostionKeyPressed = async (symbol: string) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}-flatten`);
    Firestore.logInfo(logTags.logSessionName, logTags);
    let quantityWithoutStopLoss = RiskManager.getQuanityWithoutStopLoss(symbol);
    if (quantityWithoutStopLoss > 0) {
        Firestore.logInfo(`exit for quantityWithoutStopLoss ${quantityWithoutStopLoss}`, logTags);
        return OrderFlow.marketOut(symbol, quantityWithoutStopLoss, logTags);
    }

    if (!ExitRulesChecker.checkFlattenRules(symbol, logTags)) {
        return;
    }
    TradingState.clearPendingOrder(symbol);
    let netQuantity = Models.getPositionNetQuantity(symbol);
    let finished = Broker.flattenPosition(symbol, netQuantity, logTags);
    return finished;
};
export const vwapBounceFail = async (symbol: string, shiftKey: boolean) => {
    let isLong = false;
    let tradebooks = Models.getEnabledTradebooksForSingleDirection(symbol, isLong);
    if (tradebooks.length == 0) {
        Firestore.logError(`no tradebooks for ${symbol}`);
        return;
    }
    for (let tradebook of tradebooks) {
        if (tradebook.getID() == VwapContinuationFailed.shortVwapBounceFailed) {
            tradebook.startEntry(shiftKey, false, Models.getDefaultEntryParameters());
            return;
        }
    }
}
export const twoWayBreakout = async (symbol: string) => {
    /*
    let isLong = true;
    let stopOutPrice = Chart.getStopLossPrice(symbol, isLong, null);
    let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong);
    let higherPrice = Math.max(stopOutPrice, entryPrice);
    let lowerPrice = Math.min(stopOutPrice, entryPrice);
    let multiplier = 0.5;
    let logTags = Models.generateLogTags(symbol, `${symbol}-2-way-breakout`);
    Firestore.logInfo(logTags.logSessionName, logTags);

    let emptyExitTargets = TradingPlans.buildEmptyExitTargets();
    OrderFlow.submitBreakoutOrders(symbol, higherPrice, lowerPrice, isLong, multiplier, emptyExitTargets, logTags);
    setTimeout(() => {
        OrderFlow.submitBreakoutOrders(symbol, lowerPrice, higherPrice, !isLong, multiplier, emptyExitTargets, logTags);
    }, 500);
    */
};

export const reloadPartialAtPrice = async (symbol: string) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}-reload_at_price`);
    Firestore.logInfo(logTags.logSessionName, logTags);

    let entryPrice = Chart.getCrossHairPrice(symbol);
    if (!entryPrice) {
        Firestore.logError(`no cross hair price for ${symbol}`, logTags);
        return;
    }
    let isLong = Models.isLongForReload(symbol);
    let currentPrice = Models.getCurrentPrice(symbol);
    let orderType = Models.OrderType.LIMIT;
    if (isLong) {
        if (entryPrice > currentPrice) { // add on breakout
            orderType = Models.OrderType.STOP;
        }
    } else {
        if (entryPrice < currentPrice) {
            orderType = Models.OrderType.STOP;
        }
    }

    reloadPartial(symbol, isLong, entryPrice, orderType, logTags);
};
export const reloadPartialPressed = async (symbol: string, shiftKey: boolean) => {
    let isLong = Models.isLongForReload(symbol);
    let exitCount = Models.getExitOrdersPairs(symbol).length;
    TradingState.setLowestExitBatchCount(symbol, isLong, exitCount);
    if (shiftKey) {
        reloadPartialAtMarket(symbol);
    } else {
        reloadPartialAtPrice(symbol);
    }
};
export const reloadPartialAtMarket = async (symbol: string) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}-reload_at_market`);
    Firestore.logInfo(logTags.logSessionName, logTags);
    let isLong = Models.isLongForReload(symbol);
    let entryPrice = Models.getCurrentPrice(symbol);
    reloadPartial(symbol, isLong, entryPrice, Models.OrderType.MARKET, logTags)
};

const reloadPartial = async (
    symbol: string, isLong: boolean, entryPrice: number, orderType: Models.OrderType, logTags: Models.LogTags) => {
    let stopOutPrice = Chart.getStopLossPrice(symbol, isLong, true, null);
    let quantity = getPartialQuantity(symbol, isLong);
    if (quantity == 0) {
        Firestore.logError(`getPartialQuantity() returns 0`, logTags)
        return;
    }
    if (!EntryRulesChecker.checkPartialEntry(symbol, isLong, quantity, entryPrice, stopOutPrice, logTags)) {
        return;
    }

    // cancel an existing reload before adding a new one
    let entries = Models.getEntryOrders(symbol);
    if (entries.length > 3) {
        Broker.cancelOrders([entries[0].orderID]);
    }
    Firestore.logInfo(`add back partial for ${symbol}`, logTags);
    OrderFlow.submitAddPartial(
        symbol, entryPrice, stopOutPrice, isLong, quantity, orderType, logTags
    );
};
export const moveToInitialEntry = async (symbol: string, isLong: boolean) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}-move-to-initial-entry`);
    Firestore.logInfo(logTags.logSessionName, logTags);
    let pairs = OrderFlow.getHalfExitOrdersPairs(symbol);
    let bts = TradingState.getBreakoutTradeState(symbol, isLong);
    let newPrice = bts.entryPrice;
    let currentPrice = Models.getCurrentPrice(symbol);
    if ((isLong && currentPrice < newPrice) ||
        (!isLong && currentPrice > newPrice)) {
        Firestore.logError(`only move stop to initial entry, not target`, logTags);
        return;
    }
    let allExits = Models.getExitOrdersPairs(symbol)
    if (allExits.length > 4) {
        Firestore.logError(`only move stop to initial entry when there's <= 4 partials, having ${allExits.length} now`, logTags);
        return;
    }
    Firestore.logInfo(`move half stop to breakeven for ${symbol}`);
    OrderFlow.adjustHalfExitOrdersWithNewPrice(symbol, newPrice, pairs, logTags);
};

const getPartialQuantity = (symbol: string, isLong: boolean) => {
    let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
    let initialQuantity = breakoutTradeState.initialQuantity;
    if (initialQuantity > 0) {
        let partialQuantity = initialQuantity / TakeProfit.BatchCount;
        return Math.round(partialQuantity);
    }
    let lastExitSize = Models.getLastExitSize(symbol);
    if (lastExitSize > 0) {
        return lastExitSize;
    }
    let fullSize = Math.abs(Models.getPositionNetQuantity(symbol));
    let partialSize = fullSize / TakeProfit.BatchCount;
    return Math.round(partialSize);
};

export const setCustomStopLoss = (symbol: string) => {
    if (Config.getProfileSettingsForSymbol(symbol).allowTighterStop) {
        let crosshairPrice = Chart.getCrossHairPrice(symbol);
        if (crosshairPrice)
            Chart.drawStopLoss(symbol, crosshairPrice);
    }
};

export const replaceWithProfitTakingExitOrders = (symbol: string, marketOutOnePartial: boolean,
    limitOutPrice: number) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}-set_exit_pairs`);
    let netQuantity = Models.getPositionNetQuantity(symbol);
    let isLong = netQuantity > 0;
    let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
    let profitTargets = breakoutTradeState.submitEntryResult.profitTargets;
    if (profitTargets.length <= 1) {
        Firestore.logError(`profitTargets length is only ${profitTargets.length}`);
        return;
    }
    Firestore.logInfo(`replace profit targets, length is ${profitTargets.length}`);
    let stopLoss = breakoutTradeState.stopLossPrice;
    // cancel current exit orders
    Broker.cancelExitOrders(symbol);

    if (marketOutOnePartial) {
        // remove first target for market out
        let firstTarget = profitTargets[0];
        profitTargets = profitTargets.slice(1);
        setTimeout(() => {
            OrderFlow.marketOut(symbol, firstTarget.quantity, logTags);
        }, 800);
    } else if (limitOutPrice != 0) {
        profitTargets[0].target = limitOutPrice;
    }
    setTimeout(() => {
        // submit new exit orders
        OrderFlow.submitExitPairs(symbol, profitTargets, stopLoss, logTags);
    }, 800);

    Helper.speak("check follow through. manage first pullback with raised stop.")
    /*
    setTimeout(() => {
        addPullbackPartials(symbol, isLong, breakoutTradeState.entryPrice, stopLoss, logTags);
    }, 2000);
    */
}

export const addPullbackPrice = (entries: number[], entryPrice: number, exits: number[], exitPrice: number) => {
    entries.push(entryPrice);
    exits.push(exitPrice);
}
export const addPullbackPartials = (symbol: string, isLong: boolean,
    entryPrice: number, stopLoss: number,
    logTags: Models.LogTags) => {
    let quantity = getPartialQuantity(symbol, isLong);
    let entries: number[] = [];
    let exits: number[] = [];
    let p10 = Helper.getPullbackPrice(symbol, entryPrice, stopLoss, isLong, 0.1);
    let p25 = Helper.getPullbackPrice(symbol, entryPrice, stopLoss, isLong, 0.25);
    let p50 = Helper.getPullbackPrice(symbol, entryPrice, stopLoss, isLong, 0.50);
    let p75 = Helper.getPullbackPrice(symbol, entryPrice, stopLoss, isLong, 0.75);
    let p80 = Helper.getPullbackPrice(symbol, entryPrice, stopLoss, isLong, 0.8);
    let p85 = Helper.getPullbackPrice(symbol, entryPrice, stopLoss, isLong, 0.85);
    addPullbackPrice(entries, p50, exits, p10);
    addPullbackPrice(entries, p75, exits, p10);
    addPullbackPrice(entries, p75, exits, p25);
    addPullbackPrice(entries, p80, exits, p25);
    addPullbackPrice(entries, p85, exits, p25);

    for (let i = 0; i < entries.length; i++) {
        let pullbackEntry = entries[i];
        let pullbackExit = exits[i];
        Broker.submitEntryOrderWithBracket(
            symbol, quantity, isLong, Models.OrderType.LIMIT, pullbackEntry, pullbackExit, stopLoss, logTags
        )
    }
}