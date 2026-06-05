import * as Models from '../models/models';

export interface ExitOrderLegConfig {
    orderID: string;
    price: number;
    quantity: number;
    isBuy: boolean;
}

export interface ExitOrderPairConfig {
    index: number;
    source: string;
    parentOrderID: string;
    STOP?: ExitOrderLegConfig;
    LIMIT?: ExitOrderLegConfig;
}

export const sortExitOrderPairsForDisplay = (pairs: Models.ExitPair[]) => {
    pairs.sort((a, b) => {
        if (!a.LIMIT || !b.LIMIT) {
            return 1;
        }
        let limitA = a.LIMIT;
        let limitB = b.LIMIT;
        let isBuyOrder = limitB.isBuy;
        let isLong = !isBuyOrder;

        let priceA = limitA.price ?? 0;
        let priceB = limitB.price ?? 0;
        if (isLong) {
            return priceA - priceB;
        } else {
            return priceB - priceA;
        }
    });
    return pairs;
};

export const getExitOrderPairsForDisplay = (pairs: Models.ExitPair[]) => {
    return sortExitOrderPairsForDisplay(pairs.slice());
};

const createLegConfig = (order: Models.OrderModel | undefined): ExitOrderLegConfig | undefined => {
    if (!order || order.price === undefined || !Number.isFinite(order.price)) {
        return undefined;
    }
    return {
        orderID: order.orderID,
        price: order.price,
        quantity: order.quantity,
        isBuy: order.isBuy,
    };
};

export const buildExitOrderPairConfigs = (pairs: Models.ExitPair[]): ExitOrderPairConfig[] => {
    return getExitOrderPairsForDisplay(pairs).map((pair, index) => {
        let config: ExitOrderPairConfig = {
            index: index + 1,
            source: pair.source,
            parentOrderID: pair.parentOrderID,
        };
        let stop = createLegConfig(pair.STOP);
        if (stop) {
            config.STOP = stop;
        }
        let limit = createLegConfig(pair.LIMIT);
        if (limit) {
            config.LIMIT = limit;
        }
        return config;
    });
};
