import * as Models from '../../models/models';
import * as Helper from '../../utils/helper';

export interface Order {
    "AccountID": string,
    "Symbol": string,
    "Quantity": string,
    "OrderType": string,
    "TimeInForce": {
        "Duration": "GTC"
    },
    "Route": "Intelligent"
    "LimitPrice"?: string,
    "StopPrice"?: string,
    "TradeAction": string,
    "OSOs"?: OrderRequestOSO[],
};
export interface OrderRequestOSO {
    "Type": string,
    "Orders": Order[],
}

export const buildTradeAction = (isLong: boolean, isEquity: boolean, isEntry: boolean) => {
    if (isEquity) {
        if (isEntry) {
            if (isLong)
                return "BUY";
            else
                return "SELLSHORT";
        } else {
            if (isLong)
                return "BUYTOCOVER";
            else
                return "SELL";
        }
    }
    else {
        // assume it's futures
        if (isLong)
            return "BUY";
        else
            return "SELL"
    }
};

export const buildSingleOrder = (accountID: string, symbol: string, quantity: number, orderType: string, price: number, isLong: boolean, isEquity: boolean, isEntry: boolean) => {
    let order: Order = {
        "AccountID": accountID,
        "Symbol": symbol,
        "Quantity": quantity.toString(),
        "OrderType": orderType,
        "TimeInForce": {
            "Duration": "GTC"
        },
        "Route": "Intelligent",
        "TradeAction": buildTradeAction(isLong, isEquity, isEntry)
    };
    if (orderType == "Limit") {
        order.LimitPrice = price.toString();
    } else if (orderType == "StopMarket") {
        order.StopPrice = price.toString();
    }
    return order;
};
export const buildEntryOrderWithBracket = (accountID: string, symbol: string, orderType: string, quantity: number, entryPrice: number, isLong: boolean, isEquity: boolean, limitPrice: number, stopPrice: number) => {
    let limitExit = buildSingleOrder(accountID, symbol, quantity, "Limit", limitPrice, !isLong, isEquity, false);
    let stopExit = buildSingleOrder(accountID, symbol, quantity, "StopMarket", stopPrice, !isLong, isEquity, false);
    let order = buildSingleOrder(accountID, symbol, quantity, orderType, entryPrice, isLong, isEquity, true);
    order.OSOs = [
        {
            "Type": "BRK",
            "Orders": [
                limitExit,
                stopExit,
            ],
        }
    ];
    return order;
};

const isParentOrder = (order: any) => {
    if (!order.ConditionalOrders || order.ConditionalOrders.length == 0)
        return false;
    let linkedOrders = order.ConditionalOrders;
    for (let i = 0; i < linkedOrders.length; i++) {
        if (linkedOrders[i].Relationship != "OSO")
            return false;
    }
    return true;
};
const isFilledParent = (order: any) => {
    if (!isParentOrder(order))
        return false;
    if (order.Status != "FLL")
        return false;
    return true;
};

export const extractWorkingExitPairs = (orders: any, ordersMap: Map<string, any>, orderModelsMap: Map<string, Models.OrderModel>) => {
    let exitPairs = new Map<string, Models.ExitPair[]>();
    orders.forEach((order: any) => {
        if (!isFilledParent(order))
            return;

        if (!order.ConditionalOrders || order.ConditionalOrders.length != 2)
            return;
        let child1OrderID = order.ConditionalOrders[0].OrderID;
        let child2OrderID = order.ConditionalOrders[1].OrderID;
        let childOrder1 = ordersMap.get(child1OrderID);
        let childOrder2 = ordersMap.get(child2OrderID);
        if (!childOrder1 || !childOrder2)
            return;
        if (!(isWorkingOrder(childOrder1) && isWorkingOrder(childOrder2)))
            return;

        let m1 = buildOrderModel(childOrder1);
        let m2 = buildOrderModel(childOrder2);
        let exitPair: Models.ExitPair = {
            symbol: m1.symbol,
            LIMIT: m1,
            STOP: m2,
            source: 'OTO',
            parentOrderID: order.orderID, // TODO: test this
        };

        if (m1.orderType == Models.OrderType.STOP) {
            exitPair.STOP = m1;
            exitPair.LIMIT = m2;
        }
        let mapValue = exitPairs.get(m1.symbol);
        if (mapValue) {
            mapValue.push(exitPair);
            exitPairs.set(m1.symbol, mapValue);
        } else {
            exitPairs.set(m1.symbol, [exitPair]);
        }
    });
    return exitPairs;
};

export const extractEntryOrders = (orders: any) => {
    let entryOrders = new Map<string, Models.OrderModel[]>();
    if (!orders || orders.length == 0)
        return entryOrders;
    orders.forEach((order: any) => {
        if (!isParentOrder(order))
            return;
        if (isWorkingOrder(order)) {
            let m = buildOrderModel(order);
            let mapValue = entryOrders.get(m.symbol);
            if (mapValue) {
                mapValue.push(m);
                entryOrders.set(m.symbol, mapValue);
            } else {
                entryOrders.set(m.symbol, [m]);
            }
        }
    });
    return entryOrders;
};

export const extractOrderExecutions = (orders: any[]) => {
    let result = new Map<string, Models.OrderExecution[]>();
    let filledOrders: any[] = [];
    orders.forEach(order => {
        if (FilledOrderStatus.includes(order.Status)) {
            filledOrders.push(order);
        }
    });
    filledOrders.forEach(order => {
        let m = buildOrderModel(order);
        let jsDate = new Date(order.ClosedDateTime);
        let submitTime = new Date(order.OpenedDateTime);
        let minutesSinceOpen = Helper.getMinutesSinceMarketOpen(jsDate);
        minutesSinceOpen = Math.floor(minutesSinceOpen);
        let price = +order.FilledPrice;
        let oe: Models.OrderExecution = {
            symbol: m.symbol,
            isBuy: m.isBuy,
            quantity: m.quantity,
            positionEffectIsOpen: m.positionEffectIsOpen,
            time: jsDate,
            tradingViewTime: Helper.jsDateToTradingViewUTC(jsDate),
            price: price,
            roundedPrice: Helper.roundPrice(m.symbol, price),
            minutesSinceOpen: minutesSinceOpen,
        };
        if (!Helper.isToday(oe.time))
            return;
        let mapValue = result.get(m.symbol);
        if (mapValue) {
            mapValue.push(oe);
            result.set(m.symbol, mapValue);
        } else {
            result.set(m.symbol, [oe]);
        }
    });
    return result;
};
const isWorkingOrder = (order: any) => {
    return WorkingOrderStatus.includes(order.Status);
};

export const buildOrderModel = (order: any) => {
    let leg = order.Legs[0];
    let price = 0;
    let orderType = Models.OrderType.MARKET;
    if (order.OrderType == "Market") {
        price = +order.PriceUsedForBuyingPower;
    } else if (order.OrderType == "Limit") {
        orderType = Models.OrderType.LIMIT;
        price = +order.LimitPrice;
    }
    else if (order.OrderType == "StopMarket") {
        orderType = Models.OrderType.STOP;
        price = +order.StopPrice;
    }

    let quantity = leg.QuantityOrdered;
    let orderModel: Models.OrderModel = {
        symbol: leg.Symbol,
        orderID: order.OrderID,
        rawOrder: order,
        orderType: orderType,
        price: price,
        quantity: +quantity,
        isBuy: leg.BuyOrSell == "Buy",
        positionEffectIsOpen: isParentOrder(order),
    };
    return orderModel;
};
const DeadOrderStatus = [
    'BRO', // - Broken
    'CAN', // - Canceled
    'EXP', // - Expired
    'OUT', // - UROut
    'REJ', // - Rejected
    'UCH', // - Replaced
    'UCN', // - Cancel Sent
    'TSC', // – Trade Server Canceled
    'RJC', // – Cancel Request Rejected
    'RSN', // - Replace Sent
    'SUS', // - Suspended
];
const WorkingOrderStatus = [
    'ACK', // - Received
    'LAT', // - Too Late to Cancel
    'OPN', // - Sent
    'DON', // – Queued
    'CND', // – Condition Met
    'OSO', // - OSO Order
];
const FilledOrderStatus = [
    'FLL', // - Filled
    'FLP', // - Partial Fill (UROut)
    'FPR', // - Partial Fill (Alive)
];
export const buildOrderResponse = (orders: any[]) => {
    let orderModels: Models.OrderModel[] = [];
    let orderModelsMap = new Map<string, Models.OrderModel>();
    let ordersMap = new Map<string, any>();
    orders.forEach(order => {
        let m = buildOrderModel(order);
        orderModels.push(m);
        ordersMap.set(m.orderID, order);
        orderModelsMap.set(m.orderID, m);
    });
    let entryOrders = extractEntryOrders(orders);
    let exitPairs = extractWorkingExitPairs(orders, ordersMap, orderModelsMap);
    return {
        orderModels: orderModels,
        ordersMap: ordersMap,
        entryOrders: entryOrders,
        exitPairs: exitPairs,
    };
};
