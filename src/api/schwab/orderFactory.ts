import * as Helper from '../../utils/helper';
import * as Firestore from '../../firestore';
import * as Models from '../../models/models';

export const OrderType = {
    STOP: "STOP",
    LIMIT: "LIMIT",
    MARKET: "MARKET"
};
export const OrderStrategyType = {
    SINGLE: "SINGLE",
    TRIGGER: "TRIGGER",
    OCO: "OCO"
};
export const OrderLegInstruction = {
    BUY: "BUY",
    SELL: "SELL",
    BUY_TO_COVER: "BUY_TO_COVER",
    SELL_SHORT: "SELL_SHORT",
    BUY_TO_OPEN: "BUY_TO_OPEN",
    BUY_TO_CLOSE: "BUY_TO_CLOSE",
    SELL_TO_OPEN: "SELL_TO_OPEN",
    SELL_TO_CLOSE: "SELL_TO_CLOSE",
    EXCHANGE: "EXCHANGE"
};
export interface Order {
    orderId?: string,
    cancelable?: boolean,
    session?: string,
    status?: string,
    duration?: string,
    orderLegCollection?: any[],
    orderType?: string,
    orderStrategyType?: string,
    stopPrice?: number,
    price?: number,
    childOrderStrategies?: Order[],
    quantity?: number,
    parentOrderId?: string,
    siblingOrder?: Order,
    filledQuantity?: number,
    closeTime?: string,
    enteredTime?: string,
};
export const WorkingOrdersStatus = [
    "PENDING_ACTIVATION", "QUEUED", "WORKING",
    "AWAITING_PARENT_ORDER"];
export const createEquityInstrument = (symbol: string) => {
    return {
        assetType: "EQUITY",
        symbol: symbol
    };
};

const getEntryInstruction = (isLong: boolean) => {
    if (isLong) {
        return OrderLegInstruction.BUY;
    } else {
        return OrderLegInstruction.SELL_SHORT;
    }
};

export const getClosingOrderLegInstruction = (entryInstruction: string) => {
    if (entryInstruction == OrderLegInstruction.BUY) {
        return OrderLegInstruction.SELL;
    }
    else {
        return OrderLegInstruction.BUY_TO_COVER;
    }
};

/* #region Read Order Fields */
export const getOrderSymbol = (order: any): any => {
    if (order.orderLegCollection && order.orderLegCollection.length > 0) {
        let orderLeg = order.orderLegCollection[0];
        return orderLeg.instrument.symbol;
    }
    else if (order.childOrderStrategies && order.childOrderStrategies.length > 0) {
        let childOrder = order.childOrderStrategies[0];
        return getOrderSymbol(childOrder);
    }
    return "";
};
export const getPositionEffectIsOpen = (order: any): boolean => {
    let orderLeg = order.orderLegCollection[0];
    let positionEffect = orderLeg.positionEffect;
    return positionEffect == 'OPENING';
};
/* #endregion */

/* #region Basic Orders */
export const createDayOrder = function (symbol: string, quantity: number, orderLegInstruction: string) {
    let orderLeg: any = {
        orderLegType: "EQUITY",
        instrument: createEquityInstrument(symbol),
        instruction: orderLegInstruction,
        quantity: quantity
    };
    let order: Order = {
        session: "NORMAL",
        duration: "DAY",
        orderLegCollection: [orderLeg],
        orderType: "",
        orderStrategyType: ""
    };

    return order;
};
export const createPremarketOrder = (symbol: string, quantity: number, price: number,
    isBuy: boolean, positionEffectIsOpen: boolean) => {
    let orderLegInstruction = "";
    if (positionEffectIsOpen) {
        orderLegInstruction = getEntryInstruction(isBuy);
    } else {
        orderLegInstruction = isBuy ? "BUY_TO_COVER" : "SELL";
    }
    let orderLeg: any = {
        orderLegType: "EQUITY",
        instrument: createEquityInstrument(symbol),
        instruction: orderLegInstruction,
        quantity: quantity
    };
    let order: Order = {
        session: "SEAMLESS",
        duration: "GOOD_TILL_CANCEL",
        orderLegCollection: [orderLeg],
        orderType: "LIMIT",
        orderStrategyType: "SINGLE",
        price: price
    };
    return order;
};
export const createMarketOrder = (symbol: string, quantity: number, orderLegInstruction: string) => {
    let order = createDayOrder(symbol, quantity, orderLegInstruction)
    order.orderType = "MARKET";
    order.orderStrategyType = "SINGLE";
    return order;
};
export const createStopOrder = (symbol: string, quantity: number, stopPrice: number, orderLegInstruction: string) => {
    let order = createDayOrder(symbol, quantity, orderLegInstruction);
    order.orderType = OrderType.STOP;
    order.orderStrategyType = OrderStrategyType.SINGLE;
    order.stopPrice = stopPrice;
    return order;
};

export const createLimitOrder = (symbol: string, quantity: number, limitPrice: number, orderLegInstruction: string) => {
    let order = createDayOrder(symbol, quantity, orderLegInstruction);
    order.orderType = OrderType.LIMIT;
    order.orderStrategyType = OrderStrategyType.SINGLE;
    order.price = limitPrice;
    return order;
};

export const copyOrder = (order: any) => {
    if (order.orderType == OrderStrategyType.SINGLE) {
        return copySingleOrder(order);
    }
};
const copySingleOrder = (order: any) => {
    let orderLegInstruction = order.orderLegCollection[0].instruction;
    let symbol = order.orderLegCollection[0].instrument.symbol;
    let quantity = order.orderLegCollection[0].quantity;
    if (order.orderType == OrderType.LIMIT) {
        return createLimitOrder(symbol, quantity, order.price, orderLegInstruction);
    } else if (order.orderType == OrderType.STOP) {
        return createStopOrder(symbol, quantity, order.stopPrice, orderLegInstruction);
    } else if (order.orderType == OrderType.MARKET) {
        return createMarketOrder(symbol, quantity, orderLegInstruction);
    }
};
export const createSingleOrder = (symbol: string, orderType: Models.OrderType, quantity: number, price: number,
    isBuy: boolean, positionEffectIsOpen: boolean) => {
    let orderLegInstruction = "";
    if (positionEffectIsOpen) {
        orderLegInstruction = getEntryInstruction(isBuy);
    } else {
        orderLegInstruction = isBuy ? "BUY_TO_COVER" : "SELL";
    }
    if (orderType == Models.OrderType.MARKET) {
        return createMarketOrder(symbol, quantity, orderLegInstruction);
    } else if (orderType == Models.OrderType.LIMIT) {
        return createLimitOrder(symbol, quantity, price, orderLegInstruction);
    } else if (orderType == Models.OrderType.STOP) {
        return createStopOrder(symbol, quantity, price, orderLegInstruction);
    } else {
        return createDayOrder(symbol, quantity, orderLegInstruction);
    }
};
/* #endregion */

/* #region Advanced Orders */
const createOcoOrder = (symbol: string, stopOutQuantity: number, stopPrice: number, limitPrice: number, takeProfitQuantity: number, orderLegInstruction: string) => {
    let stopOrder = createStopOrder(symbol, stopOutQuantity, stopPrice, orderLegInstruction);
    let limitOrder = createLimitOrder(symbol, takeProfitQuantity, limitPrice, orderLegInstruction);
    return createOcoOrderFromTwoLegs(stopOrder, limitOrder);
};
const createOcoOrderFromTwoLegs = (leg1: Order, leg2: Order) => {
    let mainOrder: Order = { orderStrategyType: OrderStrategyType.OCO };
    mainOrder.childOrderStrategies = [leg1, leg2];
    return mainOrder;
};
export const createOneEntryWithMultipleExits = (
    symbol: string, isLong: boolean, entryOrderType: Models.OrderType,
    entryQuantity: number, entryPrice: number, profitTargets: Models.ProfitTarget[], stopPrice: number) => {
    let entryInstruction = getEntryInstruction(isLong);
    let exitInstruction = getClosingOrderLegInstruction(entryInstruction);
    let entryOrder: Order = {};
    if (entryOrderType == Models.OrderType.STOP)
        entryOrder = createStopOrder(symbol, entryQuantity, entryPrice, entryInstruction);
    else if (entryOrderType == Models.OrderType.LIMIT)
        entryOrder = createLimitOrder(symbol, entryQuantity, entryPrice, entryInstruction);
    else if (entryOrderType == Models.OrderType.MARKET)
        entryOrder = createMarketOrder(symbol, entryQuantity, entryInstruction);

    entryOrder.orderStrategyType = OrderStrategyType.TRIGGER;
    entryOrder.childOrderStrategies = [];
    for (let i = 0; i < profitTargets.length; i++) {
        let pt = profitTargets[i];
        let q = pt.quantity;
        let oco = createOcoOrder(symbol, q, stopPrice, pt.target, q, exitInstruction);
        entryOrder.childOrderStrategies.push(oco);
    }
    return entryOrder;
};

export const createOneEntryWithTwoExits = (
    symbol: string, isLong: boolean, entryOrderType: Models.OrderType,
    entryQuantity: number, entryPrice: number, limitQuantity: number,
    limitPrice: number, stopQuantity: number, stopPrice: number) => {
    let entryInstruction = getEntryInstruction(isLong);
    let exitInstruction = getClosingOrderLegInstruction(entryInstruction);
    let entryOrder: Order = {};
    if (entryOrderType == Models.OrderType.STOP)
        entryOrder = createStopOrder(symbol, entryQuantity, entryPrice, entryInstruction);
    else if (entryOrderType == Models.OrderType.LIMIT)
        entryOrder = createLimitOrder(symbol, entryQuantity, entryPrice, entryInstruction);
    else if (entryOrderType == Models.OrderType.MARKET)
        entryOrder = createMarketOrder(symbol, entryQuantity, entryInstruction);

    entryOrder.orderStrategyType = OrderStrategyType.TRIGGER;

    let oco = createOcoOrder(symbol, stopQuantity, stopPrice, limitPrice, limitQuantity, exitInstruction);
    entryOrder.childOrderStrategies = [oco];
    return entryOrder;
};
export const createOcoExitOrder = (
    symbol: string, positionIsLong: boolean,
    quantity: number, targetPrice: number, stopLossPrice: number) => {
    let entryInstruction = getEntryInstruction(positionIsLong);
    let exitInstruction = getClosingOrderLegInstruction(entryInstruction);

    let oco = createOcoOrder(symbol, quantity, stopLossPrice, targetPrice, quantity, exitInstruction);
    return oco;
};

/* #endregion */

/* #region Read Orders */
export const extractTopLevelCancelableOrdersIds = (orders: Order[]) => {
    let ids: string[] = [];
    orders.forEach(order => {
        if (order.cancelable) {
            if (order.orderId)
                ids.push(order.orderId);
        } else if (order.childOrderStrategies && order.childOrderStrategies.length > 0) {
            let childOrderIds = extractTopLevelCancelableOrdersIds(order.childOrderStrategies);
            ids.push(...childOrderIds);
        }
    });
    return ids;
};
export const buildEntryOrderModelBySymbol = (orders: Order[]) => {
    let orderMap = buildOrderModelBySymbol(orders);
    let newOrderMap = new Map<string, Models.EntryOrderModel[]>();
    orderMap.forEach((orders, symbol) => {
        orders.forEach(order => {
            let entryOrder: Models.EntryOrderModel = order;
            if (entryOrder.rawOrder) {
                let exitPrices = extractExitPrices(entryOrder.rawOrder);
                if (exitPrices) {
                    entryOrder.exitLimitPrice = exitPrices.limit;
                    entryOrder.exitStopPrice = exitPrices.stop;
                }
            }
            let mapValue = newOrderMap.get(symbol);
            if (mapValue) {
                mapValue.push(entryOrder);
                newOrderMap.set(symbol, mapValue);
            } else {
                newOrderMap.set(symbol, [entryOrder]);
            }
        });
    });
    return newOrderMap;
}
export const extractExitPrices = (order: Order) => {
    if (order.orderStrategyType != OrderStrategyType.TRIGGER) {
        return null;
    }
    if (!order.childOrderStrategies || order.childOrderStrategies.length == 0) {
        return null;
    }
    let firstChild = order.childOrderStrategies[0];
    if (firstChild.orderStrategyType != OrderStrategyType.OCO) {
        return null;
    }
    let children = extractWorkingChildOrdersFromOCO(firstChild);
    if (children.length == 0) {
        return null; // all child legs are filled.
    }
    if (children.length != 2) {
        return null;
    }
    let result = {
        stop: 0,
        limit: 0,
    }

    children.forEach(childOrder => {
        let m = buildOrderModel(childOrder);
        let orderType = childOrder.orderType;
        if (orderType == 'STOP')
            result.stop = m.price || 0;
        else if (orderType == 'LIMIT')
            result.limit = m.price || 0;
    });
    return result;
}
export const buildOrderModelBySymbol = (orders: Order[]) => {
    let orderMap = new Map<string, Models.OrderModel[]>();
    orders.forEach(order => {
        let m = buildOrderModel(order);
        let symbol = m.symbol;
        let mapValue = orderMap.get(symbol);
        if (mapValue) {
            mapValue.push(m);
            orderMap.set(symbol, mapValue);
        } else {
            orderMap.set(symbol, [m]);
        }
    });

    return orderMap;
}
// TODO: handle OCO orders
export const filterToEquityOrders = (orders: Order[]) => {
    let equityOrders: any[] = [];
    orders.forEach((order: Order) => {
        if (order.orderType != OrderType.LIMIT &&
            order.orderType != OrderType.MARKET &&
            order.orderType != OrderType.STOP) {
            return;
        }
        if (order.orderLegCollection && order.orderLegCollection.length > 0) {
            let orderLeg = order.orderLegCollection[0];
            if (orderLeg.orderLegType != "EQUITY") {
                return;
            }
        }
        equityOrders.push(order);
    });
    return equityOrders;
}
export const isSingleOrderOpenStatus = (status: any) => {
    return !['FILLED', 'CANCELED', 'REPLACED', 'REJECTED', 'EXPIRED'].includes(status);
}
export const extractEntryOrders = (orders: Order[]) => {
    // assume entry orders are all OTO orders
    let entryOrders: Order[] = [];
    orders.forEach(order => {
        if (order.orderStrategyType == 'SINGLE') {
            let isOpenOrder = isSingleOrderOpenStatus(order.status);
            let isOpenPosition = getPositionEffectIsOpen(order);
            if (isOpenOrder && isOpenPosition) {
                entryOrders.push(order);
            }
        } else if (order.cancelable && order.orderStrategyType == OrderStrategyType.TRIGGER) {
            entryOrders.push(order);
        }
    });
    return entryOrders;
};

export const extractEntryOrdersIds = (orders: Order[]) => {
    let entryOrders = extractEntryOrders(orders);
    let ids: string[] = [];
    entryOrders.forEach(order => {
        if (order.orderId)
            ids.push(order.orderId);
    });
    return ids;
};

export const extractFilledOrders = (orders: Order[]) => {
    let filledOrders: Order[] = [];
    orders.forEach(order => {
        if (order.status == "FILLED") {
            if (order.orderStrategyType == "OCO") {
                if (order.childOrderStrategies && order.childOrderStrategies.length > 0) {
                    let childFilledOrders = extractFilledOrders(order.childOrderStrategies);
                    filledOrders.push(...childFilledOrders);
                }
            } else if (order.orderStrategyType == "TRIGGER") {
                filledOrders.push(order);
                if (order.childOrderStrategies && order.childOrderStrategies.length > 0) {
                    let childFilledOrders = extractFilledOrders(order.childOrderStrategies);
                    filledOrders.push(...childFilledOrders);
                }
            } else {
                filledOrders.push(order);
            }
        }
    });
    return filledOrders;
};

/*
    extract exit orders and put them into pairs
    return a list of pairs
    each pair has a stop order and a limit order
    it only expects triggered OTO orders
    output: [
        {
            'stop':{}, 
            'limit':{}
        },
    ]
*/
export const extractWorkingExitPairs = (orders: Order[]) => {
    let pairs: Models.ExitPair[] = [];
    orders.forEach(order => {
        if (order.orderStrategyType == 'OCO') {
            //console.log('oco order');
            //console.log(order);
            let ocoChildren = extractWorkingChildOrdersFromOCO(order);
            if (ocoChildren.length == 2) {
                let exitPair: Models.ExitPair = {
                    symbol: getOrderSymbol(order),
                    //'STOP': {},
                    //'LIMIT': {},
                    source: 'OCO', // the top level order is OCO
                    parentOrderID: order.orderId ?? "",
                };
                ocoChildren.forEach(childOrder => {
                    let m = buildOrderModel(childOrder);
                    let orderType = childOrder.orderType;
                    if (orderType == 'STOP')
                        exitPair.STOP = m;
                    else if (orderType == 'LIMIT')
                        exitPair.LIMIT = m;
                });
                pairs.push(exitPair);
            } else {
                if (ocoChildren.length != 0) {
                    console.error(`didn't extract 2 or 0 legs from OCO`);
                    console.log(order);
                }
            }
            return pairs;
        }
        if (!isFilledOTO(order)) {
            return;
        }

        if (!order.childOrderStrategies) {
            return;
        }
        for (let i = 0; i < order.childOrderStrategies.length; i++) {
            let firstChild = order.childOrderStrategies[i];
            let exitPair = extractWorkingExitPairsFromOTOChild(firstChild, order);
            if (exitPair) {
                pairs.push(exitPair);
            }
        }
    });

    let result = new Map<string, Models.ExitPair[]>();
    pairs.forEach(p => {
        let symbol = p.symbol;
        let v = result.get(symbol);
        if (v) {
            v.push(p);
        } else {
            result.set(symbol, [p]);
        }
    });
    return result;
};
export const extractWorkingExitPairsFromOTOChild = (otoChildOrder: Order, topLevelOrder: Order) => {
    if (otoChildOrder.orderStrategyType != OrderStrategyType.OCO) {
        Firestore.logError(`OTO child is not OCO, but ${otoChildOrder.orderStrategyType} instead`);
        return;
    }
    let children = extractWorkingChildOrdersFromOCO(otoChildOrder);
    if (children.length == 0) {
        return; // all child legs are filled.
    }
    if (children.length != 2) {
        Firestore.logError(`OCO should have 2 legs, but got ${children.length} instead`);
        console.log(topLevelOrder);
    }
    let exitPair: Models.ExitPair = {
        symbol: getOrderSymbol(topLevelOrder),
        //'STOP': {},
        //'LIMIT': {},
        source: 'OTO', // the top level order is OTO,
        parentOrderID: otoChildOrder.orderId ?? "",
    };

    children.forEach(childOrder => {
        let m = buildOrderModel(childOrder);
        let orderType = childOrder.orderType;
        if (orderType == 'STOP')
            exitPair.STOP = m;
        else if (orderType == 'LIMIT')
            exitPair.LIMIT = m;
    });
    return exitPair;
}
const isFilledOTO = (order: Order) => {
    return order.orderStrategyType === OrderStrategyType.TRIGGER && order.status === "FILLED";
};
const extractWorkingChildOrdersFromOCO = (oco: Order) => {
    let workingChildOrders: Order[] = [];
    if (!oco.childOrderStrategies) {
        return [];
    }
    oco.childOrderStrategies.forEach(order => {
        if (order.orderStrategyType == 'SINGLE' && order.status && WorkingOrdersStatus.includes(order.status)) {
            workingChildOrders.push(order);
        } else if (order.orderStrategyType == 'OCO') {
            let more = extractWorkingChildOrdersFromOCO(order);
            if (more.length > 0) {
                workingChildOrders.push(...more);
            }
        }
    });
    return workingChildOrders;
};

export const extractOrderPrice = (order: Order, symbol: string) => {
    if (order.orderType === OrderType.STOP) {
        return order.stopPrice;
    } else if (order.orderType === OrderType.LIMIT) {
        return order.price;
    } else if (order.orderType === OrderType.MARKET) {
        return Models.getCurrentPrice(symbol);
    } else {
        Firestore.logError(`unknown order type: ${order.orderType}`);
    }
};

export const isBuyOrder = (orderInstruction: string) => {
    return [OrderLegInstruction.BUY, OrderLegInstruction.BUY_TO_COVER].includes(orderInstruction);
};
export const isSellOrder = (orderInstruction: string) => {
    return orderInstruction.startsWith('SELL');
};
export const buildOrderModel = (order: any) => {
    let orderLeg = order.orderLegCollection[0];
    let orderInstruction = orderLeg.instruction;
    let orderType = Models.OrderType.MARKET;
    let symbol = getOrderSymbol(order);
    if (order.orderType == 'LIMIT') {
        orderType = Models.OrderType.LIMIT;
    }
    else if (order.orderType == 'STOP') {
        orderType = Models.OrderType.STOP;
    }
    let model: Models.OrderModel = {
        symbol: symbol,
        orderID: order.orderId,
        rawOrder: order,
        orderType: orderType,
        quantity: order.quantity,
        isBuy: isBuyOrder(orderInstruction),
        positionEffectIsOpen: getPositionEffectIsOpen(order),
        price: extractOrderPrice(order, symbol),
    };

    return model;
};
const splitOrdersBySymbol = (orders: any[]) => {
    let orderGroups = new Map<string, any[]>();
    orders.forEach((order: any) => {
        let symbol = getOrderSymbol(order);
        let group = orderGroups.get(symbol);
        if (!group) {
            orderGroups.set(symbol, [order]);
        } else {
            group.push(order);
            orderGroups.set(symbol, group);
        }
    });
    return orderGroups;
};
export const extractOrderExecutionsFromAllSymbols = (orders: Order[]) => {
    let map = new Map<string, Models.OrderExecution[]>();
    let orderGroups = splitOrdersBySymbol(orders);
    orderGroups.forEach((orderGroup, symbol) => {
        let executions = extractOrderExecutions(symbol, orderGroup);
        map.set(symbol, executions);
    });

    return map;
}

// Assume all orders are for the same symbol to keep it simple 
export const extractOrderExecutions = (symbol: string, ordersForSymbol: Order[]) => {
    let filledOrders = extractFilledOrders(ordersForSymbol);
    filledOrders.sort((a, b) => {
        let timeA = a.closeTime;
        let timeB = b.closeTime;
        if (timeA && timeB && timeA > timeB) {
            return 1;
        } else {
            return -1;
        }
    });
    //console.log(filledOrders)

    let orderExecutions: Models.OrderExecution[] = [];
    filledOrders.forEach((order: any) => {
        let m = buildOrderModel(order);
        let orderLeg = order.orderLegCollection[0];
        let orderInstruction = orderLeg.instruction;
        let positionEffectIsOpen = getPositionEffectIsOpen(order);
        let isBuy = isBuyOrder(orderInstruction);
        let activities = order.orderActivityCollection;
        if (!activities || activities.length == 0) {
            Firestore.logError(`no activities in order`);
            return;
        }
        activities.forEach((activity: any) => {
            if (activity.activityType != "EXECUTION" || activity.executionType != "FILL") {
                Firestore.logError(`unexpected activity ${JSON.stringify(activity)}`);
                return;
            }
            let executions = activity.executionLegs;
            if (!executions || executions.length == 0) {
                Firestore.logError(`no executions in order`);
                return;
            }
            let result = aggregateExecutionLegs(symbol, m.orderType, executions, isBuy, positionEffectIsOpen, order.enteredTime);
            if (Helper.isToday(result.time)) {
                orderExecutions.push(result);
            }
        });
    });
    return orderExecutions;
};

export const aggregateExecutionLegs = (symbol: string, orderType: Models.OrderType, legs: any, isBuy: boolean, positionEffectIsOpen: boolean, submitTime: string) => {
    let totalQuantity = 0;
    let accumulativeDollarAmount = 0;
    for (let i = 0; i < legs.length; i++) {
        totalQuantity += legs[i].quantity;
        accumulativeDollarAmount += (legs[i].quantity * legs[i].price);
    }
    let jsDate = new Date(legs[0].time);
    let minutesSinceOpen = Helper.getMinutesSinceMarketOpen(jsDate);
    minutesSinceOpen = Math.floor(minutesSinceOpen);
    let price = accumulativeDollarAmount / totalQuantity;
    let result: Models.OrderExecution = {
        symbol: symbol,
        time: jsDate,
        tradingViewTime: Helper.jsDateToTradingViewUTC(jsDate),
        quantity: totalQuantity,
        price: price,
        isBuy: isBuy,
        positionEffectIsOpen: positionEffectIsOpen,
        roundedPrice: Helper.roundPrice(symbol, price),
        minutesSinceOpen: minutesSinceOpen,
    };
    return result;
}

// Assume all orders are for the same symbol to keep it simple 
export const extractTradeExecutions = (symbol: string, ordersForSymbol: Order[]) => {
    let executions = extractOrderExecutions(symbol, ordersForSymbol);

    let trades: any[] = [];
    let tradeMap: any = {};

    executions.forEach((execution) => {
        let price = execution.price;
        let time = execution.time;
        let orderInstruction = execution.isBuy ? "BUY" : "SELL";

        let minutesSinceOpen = Helper.getMinutesSinceMarketOpen(new Date(time));
        minutesSinceOpen = Math.floor(minutesSinceOpen);
        let secondsSinceOpen = minutesSinceOpen * 60;
        let key = orderInstruction + price + minutesSinceOpen;
        let perMinuteKey = orderInstruction + minutesSinceOpen;
        let tradeObject = {
            'isBuy': execution.isBuy,
            'quantity': execution.quantity,
            'price': price,
            'time': time,
            'minutesSinceOpen': minutesSinceOpen,
            'secondsSinceOpen': secondsSinceOpen,
            'key': key,
            'perMinuteKey': perMinuteKey,
        };
        if (tradeObject.key in tradeMap) {
            tradeMap[tradeObject.key].quantity += tradeObject.quantity;
        } else {
            tradeMap[tradeObject.key] = tradeObject;
        }
    });

    for (let t in tradeMap) {
        trades.push(tradeMap[t]);
    }
    let minuteMap: any = {};
    trades.forEach(trade => {
        let key = trade.perMinuteKey;
        if (key in minuteMap) {
            minuteMap[key].quantity += trade.quantity;
            minuteMap[key].dollarAmount += (trade.quantity * trade.price);
        } else {
            minuteMap[key] = {
                'isBuy': trade.isBuy,
                'quantity': trade.quantity,
                'dollarAmount': trade.quantity * trade.price,
                'secondsSinceOpen': trade.secondsSinceOpen,
            };
        }
    });
    let tradePerMinute = [];
    for (let t in minuteMap) {
        tradePerMinute.push(minuteMap[t]);
    }
    return {
        'trades': trades,
        'tradePerMinute': tradePerMinute,
    };
};

export const generateExecutionScript = (symbol: string, orders: any) => {
    let tradeData = extractTradeExecutions(symbol, orders);
    //console.log(tradeData);
    let text = "";
    tradeData.tradePerMinute.forEach((trade: any) => {
        let price = trade.dollarAmount / trade.quantity;
        price = Helper.roundPrice(symbol, price);
        let condition = `GetSymbol() == "${symbol}" and time == ${trade.secondsSinceOpen}`;
        if (trade.isBuy) {
            text += `AddChartBubble(${condition}, ${price}, "+${trade.quantity}", GlobalColor("BubbleGreen"), 0);\n`;
        } else {
            text += `AddChartBubble(${condition}, ${price}, "-${trade.quantity}", GlobalColor("BubbleRed"), 1);\n`;
        }
    });
    //console.log(text);
    return text;
};

/* #endregion */
