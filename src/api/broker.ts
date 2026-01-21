import * as tradeStationApi from "./tradeStation/api";
import * as alpacaApi from './alpaca/api';
import * as schwabApi from './schwab/api';
import * as config from '../config/config'
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as UI from '../ui/ui';
import * as Chart from '../ui/chart';
import * as RiskManager from '../algorithms/riskManager';
import * as Helper from '../utils/helper';

declare let window: Models.MyWindow;

export const getBrokerApi = () => {
    return schwabApi;
}
export const refreshAccessToken = async () => {
    let brokerName = config.getProfileSettings().brokerName;
    console.log(`brokerName ${brokerName}`);
    if (brokerName == "TradeStation") {
        let accessToken = await tradeStationApi.refreshAccessToken();
        window.HybridApp.Secrets.tradeStation.accessToken = accessToken;
    } else if (brokerName == 'Schwab') {
        let accessToken = await schwabApi.refreshAccessToken();
        window.HybridApp.Secrets.schwab.accessToken = accessToken;
    }
    return true;
};
/**
 * submit an entry order with a bracket order to the broker
 */
export const test1 = () => {
    let symbol = 'AAPL';
    let entryPrice = 0;
    let stopPrice = 0;
    let limitPrice = 0;
    schwabApi.entryWithBracket(symbol, 1, true, Models.OrderType.MARKET, entryPrice, limitPrice, stopPrice, {});
}
/**
 * instant out the pair and keep checking its status
 */
export const test2 = () => {

}

let lastAccountSyncTime: Date = new Date();

export const UpdateAccountUIWithDelay = (source: string) => {
    let now = new Date();
    if (now > lastAccountSyncTime) {
        lastAccountSyncTime = new Date(now.getTime() + 900);
        console.log(`sync account with delay`);
        setTimeout(() => {
            Chart.updateAccountUIStatus([], `update account ui with delay ${source}`);
        }, 500);
        setTimeout(() => {
            Chart.updateAccountUIStatus([], `update account ui with delay ${source}`);
        }, 1000);
    } else {
        console.log(`sync account saved`);
    }
}
export const onOrderEvent = () => {
    // Helper.playOrderSubmissionSound();
    UpdateAccountUIWithDelay('onOrderEvent');
}

/* #region Submit Orders */
const submitEntryOrderWithBracketCore = (
    symbol: string, quantity: number, isLong: boolean, orderType: Models.OrderType,
    entryPrice: number, limitPrice: number, stopPrice: number, logTags: Models.LogTags) => {
    let brokerName = config.getProfileSettings().brokerName;
    let isEquity = config.getProfileSettings().isEquity;
    if (brokerName == 'Schwab') {
        schwabApi.entryWithBracket(
            symbol, quantity, isLong, orderType, entryPrice, limitPrice, stopPrice, logTags
        );
    } else if (brokerName == "Alpaca") {
        alpacaApi.entryWithBracket(
            symbol, quantity, isLong, orderType, entryPrice, limitPrice, stopPrice, logTags
        );
    } else if (brokerName == "TradeStation") {
        tradeStationApi.entryWithBracket(
            symbol, quantity, isLong, isEquity, orderType, entryPrice, limitPrice, stopPrice, logTags
        );
    }
};
export const submitEntryOrderWithBracket = (
    symbol: string, quantity: number, isLong: boolean, orderType: Models.OrderType,
    entryPrice: number, limitPrice: number, stopPrice: number, logTags: Models.LogTags) => {
    submitEntryOrderWithBracketCore(
        symbol, quantity, isLong, orderType, entryPrice, limitPrice, stopPrice, logTags
    );
    onOrderEvent();
};
export const submitEntryOrderWithMultipleBrackets = (
    symbol: string, quantity: number, isLong: boolean, orderType: Models.OrderType,
    entryPrice: number, profitTargets: Models.ProfitTarget[], stopPrice: number, logTags: Models.LogTags,
    orderIdToReplace: string) => {
    let brokerName = config.getProfileSettings().brokerName;
    if (brokerName == 'Schwab') {
        schwabApi.entryWithMultipleBrackets(
            symbol, quantity, isLong, orderType, entryPrice, profitTargets, stopPrice, logTags,
            orderIdToReplace
        );
    } else {
        profitTargets.forEach((profitTarget: any) => {
            let partialQuantity = profitTarget.quantity;
            let limitPrice = profitTarget.target;
            submitEntryOrderWithBracketCore(
                symbol, partialQuantity, isLong, orderType, entryPrice, limitPrice, stopPrice, logTags
            );
        });
    }
    onOrderEvent();
}
export const submitExitOrderWithBroker = (
    symbol: string, quantity: number, positionIsLong: boolean,
    targetPrice: number, stopLossPrice: number, logTags: Models.LogTags) => {
    let brokerName = config.getProfileSettings().brokerName;
    if (brokerName == 'Schwab') {
        schwabApi.exitWithBracket(
            symbol, quantity, positionIsLong, targetPrice, stopLossPrice, logTags
        );
    } else if (brokerName == "TradeStation") {
        Firestore.logError(`not implemented submitExitOrderWithBroker()`);
    } else {
        alpacaApi.exitWithBracket(
            symbol, quantity, positionIsLong, targetPrice, stopLossPrice, logTags
        );
    }
    onOrderEvent();
};

export const submitSingleOrder = async (symbol: string, orderType: Models.OrderType, quantity: number, price: number,
    isLong: boolean, positionEffectIsOpen: boolean, logTags: Models.LogTags) => {
    let brokerName = config.getProfileSettings().brokerName;
    let isEquity = config.getProfileSettings().isEquity;
    if (brokerName == 'Schwab') {
        schwabApi.submitSingleOrder(
            symbol, orderType, quantity, price, isLong, positionEffectIsOpen, logTags,
        );
    } else if (brokerName == "TradeStation") {
        tradeStationApi.submitSingleOrder(
            symbol, isEquity, orderType, quantity, price, isLong, positionEffectIsOpen, logTags
        );
    } else {
        alpacaApi.submitSingleOrder(symbol, orderType, quantity, price, isLong, logTags);
    }
    onOrderEvent();
}
export const submitPremarketOrder = async (symbol: string, quantity: number, price: number,
    isLong: boolean, positionEffectIsOpen: boolean, logTags: Models.LogTags) => {
    let brokerName = config.getProfileSettings().brokerName;
    let isEquity = config.getProfileSettings().isEquity;
    if (brokerName == 'Schwab') {
        schwabApi.submitPremarketOrder(
            symbol, quantity, price, isLong, positionEffectIsOpen, logTags,
        );
    } else {
        Firestore.logError(`premarket trading not supported for other brokers`, logTags);
    }
    onOrderEvent();
}
/* #endregion */
/* #region Cancel Orders */
export const cancelExitOrders = async (symbol: string) => {
    let cache = window.HybridApp.AccountCache;
    let exits = Models.getExitOrderIds(symbol, cache);
    cancelOrders(exits);
};

export const cancelAllEntryOrders = async (symbol: string) => {
    let orders = Models.getEntryOrders(symbol);
    let orderIds: string[] = [];
    orders.forEach(order => {
        orderIds.push(order.orderID);
    });
    cancelOrders(orderIds);
};
export const cancelBreakoutEntryOrders = async (symbol: string) => {
    let orderIds = Models.getBreakoutEntryOrderIds(symbol, window.HybridApp.AccountCache);
    cancelOrders(orderIds);
};
export const cancelOneSideEntryOrders = async (symbol: string, isLong: boolean) => {
    let entries = Models.getEntryOrders(symbol);
    let orderIds: string[] = [];
    for (let i = 0; i < entries.length; i++) {
        if (entries[i].isBuy == isLong) {
            orderIds.push(entries[i].orderID);
        }
    }
    cancelOrders(orderIds);
}
export const cancelOrders = async (orderIds: string[]) => {
    let brokerName = config.getProfileSettings().brokerName;
    if (!orderIds || orderIds.length == 0) {
        return;
    }
    if (brokerName == 'Schwab') {
        schwabApi.cancelOrders(orderIds);
    } else if (brokerName == "TradeStation") {
        tradeStationApi.cancelOrders(orderIds);
    } else {
        alpacaApi.cancelOrders(orderIds);
    }
    onOrderEvent();
};
/* #endregion */
/* #region Replace Orders */
export const replaceWithMarketOrder = async (order: Models.OrderModel, logTags: Models.LogTags) => {
    let brokerName = config.getProfileSettings().brokerName;
    if (brokerName == 'Schwab') {
        schwabApi.replaceSingleOrderWithMarketOrder(order, logTags);
    } else if (brokerName == "TradeStation") {
        tradeStationApi.replaceWithMarketOrder(order, logTags);
    } else {
        Firestore.logError(`replaceWithMarketOrder not implemented`);
    }
    onOrderEvent();
};
export const replaceSimpleOrderWithNewPrice = async (order: Models.OrderModel, newPrice: number, logTags: Models.LogTags) => {
    let brokerName = config.getProfileSettings().brokerName;
    if (brokerName == 'Schwab') {
        schwabApi.replaceSingleOrderWithNewPrice(order, newPrice, logTags);
    }
    if (brokerName == "TradeStation") {
        tradeStationApi.replaceSingleOrderWithNewPrice(order, newPrice, logTags);
    } else {
        if (order.orderType == Models.OrderType.LIMIT) {
            alpacaApi.replaceOrderWithNewTarget(order.orderID, newPrice, logTags);
        } else {
            alpacaApi.replaceOrderWithNewStopLoss(order.orderID, newPrice, logTags);
        }
    }
    onOrderEvent();
};
export const replaceExitPairWithNewPrice = async (
    pair: Models.ExitPair, newPrice: number,
    isStopLeg: boolean, positionIsLong: boolean, logTags: Models.LogTags) => {
    let brokerName = config.getProfileSettings().brokerName;
    if (brokerName == 'Schwab') {
        //schwabApi.cancelAndReplaceExitPairWithNewPrice(pair, newPrice, isStopLeg, positionIsLong, logTags);
        schwabApi.replaceExitPairDirectlyWithNewPrice(pair, newPrice, isStopLeg, positionIsLong, logTags);
    } else if (brokerName == "TradeStation") {
        let orderToReplace = isStopLeg ? pair.STOP : pair.LIMIT;
        if (orderToReplace) {
            tradeStationApi.replaceSingleOrderWithNewPrice(orderToReplace, newPrice, logTags);
        }
    } else {
        if (isStopLeg) {
            if (pair.STOP) {
                alpacaApi.replaceOrderWithNewStopLoss(pair.STOP.orderID, newPrice, logTags);
            }
        } else {
            if (pair.LIMIT) {
                alpacaApi.replaceOrderWithNewTarget(pair.LIMIT.orderID, newPrice, logTags);
            }
        }
    }
    onOrderEvent();
}
/**
 * @returns the number of quantity in either leg of exit pairs
 */
export const instantOutOneExitPair = (
    symbol: string, positionIsLong: boolean,
    pair: Models.ExitPair, logTags: Models.LogTags) => {
    let quantity = 0;
    if (pair.LIMIT) {
        quantity = pair.LIMIT.quantity;
    } else if (pair.STOP) {
        quantity = pair.STOP.quantity;
    } else {
        Firestore.logError(`missing both legs in exit pair`, logTags);
        return 0;
    }
    let brokerName = config.getProfileSettings().brokerName;
    if (brokerName == 'Schwab') {
        schwabApi.replaceExitPairWithOneMarketOrderLeg(symbol, positionIsLong, pair, logTags);
        //schwabApi.cancelAndReplaceWithMarketOrder(symbol, positionIsLong, pair, logTags);
    } else if (brokerName == 'Alpaca') {
        let toCancel: string[] = [];
        let quantity = 0;
        let isLong = false;
        if (pair.LIMIT) {
            toCancel.push(pair.LIMIT.orderID);
            quantity = pair.LIMIT.quantity;
            isLong = pair.LIMIT.isBuy;
        } else if (pair.STOP) {
            toCancel.push(pair.STOP.orderID);
            quantity = pair.STOP.quantity;
            isLong = pair.STOP.isBuy;
        }
        cancelOrders(toCancel);
        setTimeout(() => {
            alpacaApi.submitSingleOrder(pair.symbol, Models.OrderType.MARKET, quantity, 0, isLong, {});
        }, 200);

    } else {
        instantOutOneExitPairByReplace(pair, logTags);
    }
    return quantity;
};
export const instantOutOneExitPairByReplace = async (pair: Models.ExitPair, logTags: Models.LogTags) => {
    if (pair.LIMIT) {
        tradeStationApi.replaceWithMarketOrder(pair.LIMIT, logTags);

    } else if (pair.STOP) {
        tradeStationApi.replaceWithMarketOrder(pair.STOP, logTags);
    }
    onOrderEvent();
}
/* #endregion */

export const syncAccount = async (source: string) => {
    console.log(`sync account from ${source}`);
    let brokerName = config.getProfileSettings().brokerName;
    //console.log(brokerName);
    if (brokerName == "TradeStation") {
        let result = await tradeStationApi.getAccount();
        if (!result) {
            console.error('cannot sync ts account');
        }
    } else if (brokerName == 'Alpaca') {
        let result = await alpacaApi.getAccountInfo();
        if (!result) {
            console.error('cannot sync alpaca account')
        }
    } else if (brokerName == 'Schwab') {
        let result = await schwabApi.getAccountInfo();
        if (!result) {
            Firestore.logError('cannot sync schwab account');
        }
    }
    return rebuildBrokerAccount();
};

const rebuildBrokerAccount = () => {
    if (!window.HybridApp.AccountCache)
        return;
    let tradesCount = 0;
    let nonBreakevenTradesCount = 0;
    let realizedPnL = 0;
    //console.log('rebuild account')
    //console.log(window.HybridApp.AccountCache.orderExecutions)
    window.HybridApp.AccountCache.orderExecutions.forEach((executions, symbol) => {
        let trades = getTradeExecutions(symbol, executions);
        tradesCount += trades.length;
        trades.forEach(trade => {
            realizedPnL += trade.realizedPnL;
            if (!RiskManager.isBreakeven(trade.realizedPnL)) {
                nonBreakevenTradesCount++;
            }
        });
        window.HybridApp.AccountCache?.trades.set(symbol, trades);
    });
    window.HybridApp.AccountCache.tradesCount = tradesCount;
    window.HybridApp.AccountCache.nonBreakevenTradesCount = nonBreakevenTradesCount;
    window.HybridApp.AccountCache.realizedPnL = realizedPnL;
    UI.updateTotalTrades();
    return window.HybridApp.AccountCache;
};


/*
Sample output:
AddChartBubble(GetSymbol() == "NVD" and time == 60, 903.33, "+85", GlobalColor("BubbleGreen"), 0);
*/
export const generateExecutionScript = (showDetails: boolean) => {
    let text = '';
    let oes = Models.getAllOrderExecutions(undefined);
    let agg: Models.OrderExecution[] = [];
    if (showDetails) {
        agg = aggregateExecutionsPerMinutePerSidePerPrice(oes);
    } else {
        agg = aggregateExecutionsPerMinutePerSide(oes);
    }
    text += generateExecutionScriptForOrderExecutions(agg);
    console.log(text);
};

export const generateExecutionScriptForOrderExecutions = (oes: Models.OrderExecution[]) => {
    let text = '';
    oes.forEach((oe) => {
        //console.log(oe);
        let price = oe.roundedPrice;
        let symbol = oe.symbol;
        let secondsSinceOpen = oe.minutesSinceOpen * 60;
        let condition = `GetSymbol() == "${symbol}" and time == ${secondsSinceOpen}`;
        if (oe.isBuy) {
            text += `AddChartBubble(${condition}, ${price}, "+${oe.quantity}", GlobalColor("BubbleGreen"), 0);\n`;
        } else {
            text += `AddChartBubble(${condition}, ${price}, "-${oe.quantity}", GlobalColor("BubbleRed"), 1);\n`;
        }
    });
    return text;
}

const positionEffectIsOpen = (isBuy: boolean, currentNetQuantity: number) => {
    if (currentNetQuantity == 0)
        return true;
    else if (currentNetQuantity > 0)
        return isBuy;
    else
        return !isBuy;
}

export const getTradeExecutions = (symbol: string, executions: Models.OrderExecution[]) => {
    let trades: Models.TradeExecution[] = [];
    let currentNetQuantity = 0;
    for (let i = 0; i < executions.length; i++) {
        let execution = executions[i];
        let netQuantityChange = execution.isBuy ? execution.quantity : -execution.quantity;
        if (positionEffectIsOpen(execution.isBuy, currentNetQuantity)) {
            if (currentNetQuantity == 0) {
                // open a new position
                trades.push({
                    symbol: symbol,
                    entries: [execution],
                    exits: [],
                    realizedPnL: 0,
                    isLong: execution.isBuy,
                    isClosed: false,
                });
            } else {
                // add to existing position
                if (trades[trades.length - 1]) {
                    trades[trades.length - 1].entries.push(execution);
                }
                else {
                    Firestore.logError(`should have at least one trade in getTradeExecutions() for ${symbol}`);
                }
            }
        } else {
            if (trades[trades.length - 1]) {
                trades[trades.length - 1].exits.push(execution);
            } else {
                Firestore.logError(`should not see exits before entries in getTradeExecutions() for ${symbol}`);
            }
        }
        currentNetQuantity += netQuantityChange;
    }
    trades.forEach(trade => {
        trade.realizedPnL = getRealizedPnL(trade);
        trade.isClosed = isTradeClosed(trade);
        trade.entries = aggregateEntriesExecutions(trade.entries);
    });
    trades.sort((a, b) => {
        let timeA = a.entries[0].time;
        let timeB = b.entries[0].time;
        return timeA.getTime() - timeB.getTime();
    });
    return trades;
};

const aggregateEntriesExecutions = (executions: Models.OrderExecution[]) => {
    let entriesMap = new Map<number, Models.OrderExecution[]>();
    let results: Models.OrderExecution[] = [];
    executions.forEach(execution => {
        let mapKey = execution.tradingViewTime; // execution.tradingViewTime;
        let mapValue = entriesMap.get(mapKey);
        if (!mapValue) {
            entriesMap.set(mapKey, [execution]);
        } else {
            mapValue.push(execution);
            entriesMap.set(mapKey, mapValue);
        }
    });

    entriesMap.forEach((value, key) => {
        results.push(aggregateExecutions(value));
    });
    results.sort((a, b) => (a.time > b.time ? 1 : -1));
    return results;
};
const getClusteredPrice = (price: number): number => {
    if (price > 200) {
        // Cluster by 5 cents
        return Math.floor(price * 100 / 5) * 5 / 100;
    } else if (price > 100) {
        // Cluster by 4 cents
        return Math.floor(price * 100 / 4) * 4 / 100;
    } else if (price > 50) {
        // Cluster by 3 cents
        return Math.floor(price * 100 / 3) * 3 / 100;
    } else if (price > 25) {
        // Cluster by 2 cents
        return Math.floor(price * 100 / 2) * 2 / 100;
    }
    return price;
}
export const aggregateExecutionsPerMinutePerSidePerPrice = (executions: Models.OrderExecution[]) => {
    let map = new Map<string, Models.OrderExecution[]>();
    executions.forEach(element => {
        let clusteredPrice = getClusteredPrice(element.roundedPrice);
        let key = `${element.symbol}-${element.minutesSinceOpen}-${element.isBuy}-${clusteredPrice}`;
        let v = map.get(key);
        if (v) {
            v.push(element);
        } else {
            map.set(key, [element]);
        }
    });
    let result: Models.OrderExecution[] = [];
    map.forEach((value, key) => {
        if (value.length > 1) {
            let agg = aggregateExecutions(value);
            result.push(agg);
        } else {
            result.push(value[0]);
        }
    });
    return result;
}
export const aggregateExecutionsPerMinutePerSide = (executions: Models.OrderExecution[]) => {
    let map = new Map<string, Models.OrderExecution[]>();
    executions.forEach(element => {
        let key = `${element.symbol}-${element.minutesSinceOpen}-${element.isBuy}`;
        let v = map.get(key);
        if (v) {
            v.push(element);
        } else {
            map.set(key, [element]);
        }
    });
    let result: Models.OrderExecution[] = [];
    map.forEach((value, key) => {
        if (value.length > 1) {
            let agg = aggregateExecutions(value);
            result.push(agg);
        } else {
            result.push(value[0]);
        }
    });
    return result;
}
export const aggregateExecutions = (executions: Models.OrderExecution[]) => {
    let totalAmount = 0;
    let totalQuantity = 0;
    for (let i = 0; i < executions.length; i++) {
        let element = executions[i];
        totalQuantity += element.quantity;
        totalAmount += (element.quantity * element.price);
    }
    let newPrice = totalAmount / totalQuantity;
    let newExecution = {
        ...executions[0]
    };
    newExecution.price = newPrice;
    newExecution.roundedPrice = Helper.roundPrice(newExecution.symbol, newPrice);
    newExecution.quantity = totalQuantity;
    return newExecution;
};
const getRealizedPnL = (trade: Models.TradeExecution) => {
    let totalQuantity = 0;
    let totalAmount = 0;
    trade.entries.forEach(entry => {
        totalQuantity += entry.quantity;
        totalAmount += (entry.quantity * entry.price);
    });
    let pnl = 0;
    let averagePrice = totalAmount / totalQuantity;
    trade.exits.forEach(exit => {
        let gain = exit.price - averagePrice;
        if (exit.isBuy) {
            gain = averagePrice - exit.price;
        }
        pnl += (gain * exit.quantity);
    });
    return pnl;
}

const isTradeClosed = (trade: Models.TradeExecution) => {
    let entryQuantity = 0;
    let exitQuantity = 0;
    trade.entries.forEach(entry => {
        entryQuantity += entry.quantity;
    });
    trade.exits.forEach(exit => {
        exitQuantity += exit.quantity;
    });
    return entryQuantity == exitQuantity;
}
export const marketOutExitPairsButOne = async (symbol: string, netQuantity: number, logTags: Models.LogTags) => {
    let exitPairs = Models.getExitPairs(symbol);
    if (exitPairs.length < 2) {
        Firestore.logError(`need at 2 partials, having ${exitPairs.length}`, logTags);
        return;
    }
    let exitIsBuyOrder = netQuantity > 0 ? false : true;
    let pairs = [];
    for (let i = 0; i < exitPairs.length - 1; i++) {
        pairs.push(exitPairs[i]);
    }
    if (config.getProfileSettings().brokerName == "TradeStation") {
        pairs.forEach(pte => {
            if (pte.LIMIT) {
                replaceWithMarketOrder(pte['LIMIT'], logTags);
            } else if (pte.STOP) {
                replaceWithMarketOrder(pte['STOP'], logTags);
            }
        });
    } else {
        let toCancel: string[] = [];
        let quantity = 0;
        pairs.forEach(pte => {
            if (pte.LIMIT) {
                toCancel.push(pte.LIMIT.orderID);
                quantity += pte.LIMIT.quantity;
            } else if (pte.STOP) {
                toCancel.push(pte.STOP.orderID);
                quantity += pte.STOP.quantity;
            }
        });
        cancelOrders(toCancel);
        setTimeout(() => {
            submitSingleOrder(symbol, Models.OrderType.MARKET, quantity, 0, exitIsBuyOrder, false, logTags);
        }, 750);
    }
    return true;
}
export const flattenPosition = async (symbol: string, netQuantity: number, logTags: Models.LogTags) => {
    let remainingQuantity = Math.abs(netQuantity);
    // market out exit orders
    let exitPairs = Models.getExitPairs(symbol);
    let exitIsBuyOrder = netQuantity > 0 ? false : true;
    let brokerName = config.getProfileSettings().brokerName;
    if (brokerName == "TradeStation" || brokerName == "Schwab") {
        if (brokerName == "TradeStation") {
            exitPairs.forEach(pte => {
                if (pte.LIMIT) {
                    remainingQuantity -= pte['LIMIT'].quantity;
                    replaceWithMarketOrder(pte['LIMIT'], logTags);
                } else if (pte.STOP) {
                    remainingQuantity -= pte['STOP'].quantity;
                    replaceWithMarketOrder(pte['STOP'], logTags);
                }
            });
        } else if (brokerName == "Schwab") {
            exitPairs.forEach(pte => {
                let q = instantOutOneExitPair(symbol, netQuantity > 0, pte, logTags);
                remainingQuantity -= q;
            })
        }
        // market out leftover shares
        if (remainingQuantity > 0) {
            console.log(`remaining q: ${remainingQuantity}`);
            submitSingleOrder(symbol, Models.OrderType.MARKET, remainingQuantity, 0, exitIsBuyOrder, false, logTags);
        }
    } else {
        let toCancel: string[] = [];
        exitPairs.forEach(pte => {
            if (pte.LIMIT) {
                toCancel.push(pte.LIMIT.orderID);
            } else if (pte.STOP) {
                toCancel.push(pte.STOP.orderID);
            }
        });
        cancelOrders(toCancel);
        setTimeout(() => {
            submitSingleOrder(symbol, Models.OrderType.MARKET, remainingQuantity, 0, exitIsBuyOrder, false, logTags);
        }, 750);
    }
    return true;
};
