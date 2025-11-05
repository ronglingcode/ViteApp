import * as Models from '../../models/models';
import * as Helper from '../../utils/helper';
export const entryOrderPrefix = 'entry-';
export const getSide = (isLong: boolean) => {
    return isLong ? "buy" : "sell";
}
export const createOcoExits = (symbol: string, quantity: number, isLong: boolean,
    stopLoss: number, profitTarget: number) => {
    return {
        "symbol": symbol,
        "side": getSide(isLong),
        "type": "limit",
        "qty": quantity,
        "time_in_force": "day",
        "order_class": "oco",
        "take_profit": {
            "limit_price": profitTarget,
        },
        "stop_loss": {
            "stop_price": stopLoss
        }
    }
}
export const createOneEntryWithTwoExits = (symbol: string, quantity: number, isLong: boolean,
    entryOrderType: Models.OrderType, entryPrice: number, stopLoss: number, profitTarget: number) => {
    let entryOrder = {};
    if (entryOrderType == Models.OrderType.STOP)
        entryOrder = createStopOrder(symbol, quantity, entryPrice, isLong);
    else if (entryOrderType == Models.OrderType.LIMIT)
        entryOrder = createLimitOrder(symbol, quantity, entryPrice, isLong);
    else if (entryOrderType == Models.OrderType.MARKET)
        entryOrder = createMarketOrder(symbol, quantity, isLong);
    let tracking_id = entryOrderPrefix + Helper.generateUniqueString();
    let position_intent = isLong ? "buy_to_open" : "sell_to_open";
    return {
        ...entryOrder,
        position_intent: position_intent,
        client_order_id: tracking_id,
        order_class: "bracket",
        take_profit: {
            limit_price: profitTarget,
        },
        stop_loss: {
            stop_price: stopLoss,
        }
    }
}

export const createStopOrder = (symbol: string, quantity: number, price: number, isLong: boolean) => {
    return {
        symbol: symbol,
        side: getSide(isLong),
        qty: quantity,
        time_in_force: 'day',
        type: 'stop',
        stop_price: price,
    }
}
export const createLimitOrder = (symbol: string, quantity: number, price: number, isLong: boolean) => {
    return {
        symbol: symbol,
        side: getSide(isLong),
        qty: quantity,
        time_in_force: 'day',
        type: 'limit',
        limit_price: price,
    }
}

export const createMarketOrder = (symbol: string, quantity: number, isLong: boolean) => {
    return {
        symbol: symbol,
        side: getSide(isLong),
        qty: quantity,
        time_in_force: 'day',
        type: 'market',
    }
}
export const createBreakoutBracketOrder = (symbol: string, quantity: number, isLong: boolean,
    entryPrice: number, stopLoss: number, profitTarget: number) => {
    let side = isLong ? "buy" : "sell";
    return {
        symbol: symbol,
        side: side,
        qty: quantity,
        time_in_force: 'day',
        type: 'stop',
        stop_price: entryPrice,
        order_class: 'bracket',
        stop_loss: {
            stop_price: stopLoss,
        },
        take_profit: {
            limit_price: profitTarget,
        }
    }
}

export const createMarketBracketOrder = (symbol: string, quantity: number, isLong: boolean,
    stopLoss: number, profitTarget: number) => {
    let side = isLong ? "buy" : "sell";
    return {
        symbol: symbol,
        side: side,
        qty: quantity,
        time_in_force: 'day',
        type: 'market',
        order_class: 'bracket',
        stop_loss: {
            stop_price: stopLoss,
        },
        take_profit: {
            limit_price: profitTarget,
        }
    }
}


export const createOcoExitOrder = (
    symbol: string, positionIsLong: boolean,
    quantity: number, targetPrice: number, stopLossPrice: number) => {
    let side = positionIsLong ? "sell" : "buy";
    return {
        symbol: symbol,
        side: side,
        qty: quantity,
        time_in_force: 'day',
        order_class: 'oco',
        type: 'limit',
        take_profit: {
            limit_price: targetPrice,
        },
        stop_loss: {
            stop_price: stopLossPrice

        }
    }
}
export const processOrders = (orders: any[]) => {
    let entryOrderMap = new Map<string, Models.EntryOrderModel[]>();
    let exitPairs = new Map<string, Models.ExitPair[]>();
    console.log('open orders');
    console.log(orders);
    orders.forEach((order: any) => {
        let symbol = order.symbol;
        if (order.order_class == "bracket") {
            if (!order.client_order_id.startsWith(entryOrderPrefix)) {
                console.log('not entry order at root, try process as OCO exits');
                console.log(order);
                let legs = [order];
                if (order.legs) {
                    order.legs.forEach((leg: any) => {
                        legs.push(leg);
                    });
                }
                addExitPairFromLegs(symbol, exitPairs, legs, order.id, 'OTO', order);
            } else {
                if (order.status == "new") {
                    addToEntryOrderMap(entryOrderMap, order);
                } else if (order.status == 'filled') {
                    addExitPairFromLegs(symbol, exitPairs, order.legs, order.id, 'OTO', order);
                }
            }
        } else if (order.order_class == "oco") {
            if (isSingleOrderOpenStatus(order.status)) {
                console.log(`process oco: ${order.status}`);
                let legs = [order];
                if (order.legs) {
                    order.legs.forEach((leg: any) => {
                        legs.push(leg);
                    });
                }

                addExitPairFromLegs(symbol, exitPairs, legs, order.id, 'OCO', order);
            }
        }


    });
    return {
        entryOrderMap: entryOrderMap,
        exitPairs: exitPairs,
    }
}
export const addExitPairFromLegs = (symbol: string, map: Map<string, Models.ExitPair[]>, legs: any, parentOrderID: string, source: string, parentOrder: any) => {
    if (!legs || legs.length == 0) {
        return;
    }
    let hasAnyLeg = false;
    let pair: Models.ExitPair = {
        symbol: symbol,
        source: source,
        parentOrderID: parentOrderID,
    }
    for (let i = 0; i < legs.length; i++) {
        let order = legs[i];
        if (!isSingleOrderOpenStatus(order.status)) {
            continue;
        }
        if (order.order_type == "limit") {
            hasAnyLeg = true;
            pair.LIMIT = buildSingleOrderModel(order, false);
        } else if (order.order_type == "stop") {
            hasAnyLeg = true;
            pair.STOP = buildSingleOrderModel(order, false);
        }
    }
    if (!hasAnyLeg) {
        return;
    }
    //console.log(pair);
    let list = map.get(symbol);
    if (list) {
        list.push(pair);
    } else {
        map.set(symbol, [pair]);
    }
}
export const buildSingleOrderModel = (order: any, positionEffectIsOpen: boolean) => {
    let orderModel: Models.OrderModel = {
        symbol: order.symbol,
        orderID: order.id,
        orderType: getOrderType(order),
        quantity: Number(order.qty),
        isBuy: order.side == "buy",
        positionEffectIsOpen: positionEffectIsOpen,
    }
    if (orderModel.orderType == Models.OrderType.LIMIT) {
        orderModel.price = Number(order.limit_price);
    } else if (orderModel.orderType == Models.OrderType.STOP) {
        orderModel.price = Number(order.stop_price);
    }
    return orderModel;
}
export const isSingleOrderOpenStatus = (status: any) => {
    return status != 'filled' && status != 'canceled' && status != 'replaced';
}
export const getOrderType = (order: any) => {
    if (order.order_type == "stop")
        return Models.OrderType.STOP;
    else if (order.order_type == "limit")
        return Models.OrderType.LIMIT
    else
        return Models.OrderType.MARKET;
}
export const addToEntryOrderMap = (map: Map<string, Models.EntryOrderModel[]>, order: any) => {
    let symbol = order.symbol;
    let orderModel: Models.EntryOrderModel = {
        symbol: symbol,
        orderID: order.id,
        orderType: getOrderType(order),
        quantity: Number(order.qty),
        isBuy: order.side == "buy",
        positionEffectIsOpen: true,
    }
    if (order.legs && order.legs.length > 0) {
        order.legs.forEach((leg: any) => {
            if (leg.order_type == "limit") {
                orderModel.exitLimitPrice = Number(leg.limit_price);
            } else if (leg.order_type == "stop") {
                orderModel.exitStopPrice = Number(leg.stop_price);
            }
        });
    }
    if (orderModel.orderType == Models.OrderType.LIMIT) {
        orderModel.price = Number(order.limit_price);
    } else if (orderModel.orderType == Models.OrderType.STOP) {
        orderModel.price = Number(order.stop_price);
    }
    let list = map.get(symbol);
    if (list) {
        list.push(orderModel);
    } else {
        map.set(symbol, [orderModel]);
    }
}