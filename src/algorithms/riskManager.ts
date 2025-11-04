import * as Models from '../models/models';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels'
import * as TradingState from '../models/tradingState';
import * as Firestore from '../firestore';
import * as Helper from '../utils/helper';

export const getMaxDailyLossLimit = () => {
    let initialBalance = TradingState.getInitialBalance();
    if (initialBalance > 120000) {
        // each trade risk 0.0477*0.21 = 1% of the entire cash account
        return initialBalance * 0.0477;
    } else {
        return 5000; // each trade use 21%
    }
}

export const addCents = (price: number, cents: number) => {
    price = Math.ceil(price * 100);
    return (price + cents) / 100;
};
export const minusCents = (price: number, cents: number) => {
    price = Math.floor(price * 100);
    return (price - cents) / 100;
};
export const quantityToRiskMultiples = (riskPerShare: number, quantity: number) => {
    let riskSize = riskPerShare * quantity;
    return riskInDollarToMultiples(riskSize);
};

export const calculateTotalShares = (
    symbol: string, entryPrice: number, stopOutPrice: number,
    setupQuality: string, multiplier: number) => {
    let riskPerShare = getRiskPerShare(symbol, entryPrice, stopOutPrice);
    let maxRiskPerTrade = multiplier * getMaxDailyLossLimit();
    let totalShares = Math.max(2, Math.floor(maxRiskPerTrade / riskPerShare));
    return totalShares;
};

export const getRiskPerShare = (symbol: string, entryPrice: number, stopLossPrice: number) => {
    let risk = Math.abs(entryPrice - stopLossPrice);
    let delta = Helper.getDelta(symbol);
    if (delta == 1) {
        return risk;
    } else {
        return risk * delta;
    }
}

const orOverride = (original: number, override: number) => {
    if (override > 0) {
        return override;
    } else {
        return original;
    }
}
const getInitialMultipler = (basePlan: TradingPlansModels.BasePlan) => {
    let override = 0.24;
    if (basePlan.planConfigs.size > 0) {
        override = basePlan.planConfigs.size;
    }

    return override;
}
/**
 * Start from 100%, remove loss from the same direction on the same stock. 
 * Remove risk from existing positions and existings entries. 
 * Use half of that. And use half of remaining daily max loss. 
 * Use whichever is smaller
 * @returns a number between 0 and 1
 */
export const getRiskMultiplerForNextEntry = (symbol: string, isLong: boolean, basePlan: TradingPlansModels.BasePlan, logTags: Models.LogTags) => {
    let multipler = getInitialMultipler(basePlan);
    if (multipler > 0) {
        return multipler;
        //return getRiskMultiplerForNextEntry2(symbol, isLong, multipler, logTags);
    }

    let profitLossPerDirection = Models.getRealizedProfitLossPerDirection(symbol, isLong);
    let profitLossTotal = Models.getRealizedProfitLoss();
    let existingRisk = getRiskInDollarFromExistingPositionsAndEntries(symbol, logTags);
    if (existingRisk > 0) {
        let netQuantity = Models.getPositionNetQuantity(symbol);
        let positionIsLong = netQuantity > 0;
        if (netQuantity != 0 && positionIsLong == isLong) {
            Firestore.logError(`no more entry with existing risk, use add partial instead`, logTags);
            return 0;
        }
    }
    let riskUsingPerDirection = getRiskInDollarForNextEntry(
        getMaxDailyLossLimit() / 2, profitLossPerDirection, existingRisk, "per direction", logTags
    );
    let riskUsingDailyPnL = getRiskInDollarForNextEntry(
        getMaxDailyLossLimit(), profitLossTotal, existingRisk, "daily PNL", logTags
    );
    let finalRisk = Math.min(riskUsingDailyPnL, riskUsingPerDirection);
    return riskInDollarToMultiples(finalRisk);
}

const getRiskMultiplerForNextEntry2 = (symbol: string, isLong: boolean, multipler: number, logTags: Models.LogTags) => {
    let profitLossTotal = Models.getRealizedProfitLoss();
    let dailyMaxLoss = getMaxDailyLossLimit();
    if (profitLossTotal < 0 && Math.abs(profitLossTotal) > dailyMaxLoss * 0.9) {
        return 0;
    }
    let existingRisk = getRiskInDollarFromExistingPositionsAndEntries(symbol, logTags);
    if (existingRisk > 0) {
        let netQuantity = Models.getPositionNetQuantity(symbol);
        let positionIsLong = netQuantity > 0;
        if (netQuantity != 0 && positionIsLong == isLong) {
            Firestore.logError(`no more entry with existing risk, use add partial instead`, logTags);
            return 0;
        }
    }

    return multipler;
}

const getRiskInDollarForNextEntry = (initialBudget: number, profitLoss: number, existingRisk: number,
    source: string, logTags: Models.LogTags) => {
    let divider = 2;
    let lossDeduction = profitLoss < 0 ? Math.abs(profitLoss) : 0;
    let result = (initialBudget - existingRisk - lossDeduction) / divider;
    let i = riskInDollarToMultiples(initialBudget);
    let e = riskInDollarToMultiples(existingRisk);
    let l = riskInDollarToMultiples(lossDeduction);
    let r = riskInDollarToMultiples(result);
    Firestore.logInfo(`next entry risk from ${source}: (${i}-${e}-${l})/${divider}=${r}`, logTags);
    return result;
}

export const getRiskInDollarFromExistingPositionsAndEntries = (symbol: string, logTags: Models.LogTags) => {
    let positions = getRiskInDollarFromExistingPosition(symbol);
    let entries = getRiskInDollarFromExistingEntries(symbol);
    let result = positions + entries;
    let p = riskInDollarToMultiples(positions);
    let e = riskInDollarToMultiples(entries);
    let r = riskInDollarToMultiples(result);
    //Firestore.logInfo(`existing risk: ${p}+${e}=${r}`, logTags);
    return result;
}

export const getRiskInDollarFromExistingEntries = (symbol: string) => {
    let entryOrders = Models.getEntryOrders(symbol);
    let risk = 0;
    entryOrders.forEach(entryOrder => {
        if (entryOrder.exitStopPrice && entryOrder.price) {
            let riskPerShare = getRiskPerShare(symbol, entryOrder.price, entryOrder.exitStopPrice);
            let riskToAdd = riskPerShare * entryOrder.quantity;
            risk += riskToAdd;
        }
    });
    return risk;
}

/**
 * Return a number between 0 and 1 if risk size 0% to 100%
 * @param symbol the symbol
 */
export const getRiskMultiplesFromExistingPosition = (symbol: string) => {
    let risk = getRiskInDollarFromExistingPosition(symbol);
    return riskInDollarToMultiples(risk);
}
export const getQuanityWithoutStopLoss = (symbol: string) => {
    let filledPrice = Models.getAveragePrice(symbol);
    let position = Models.getPosition(symbol);
    if (!position) {
        return 0;
    }
    let riskUsingStopOrders = getRiskInDollarFromExistingPositionUsingStopOrders(symbol, filledPrice);
    let quantityWithStopLoss = riskUsingStopOrders.quantity;
    let total = Math.abs(Models.getPositionNetQuantity(symbol));
    return total - quantityWithStopLoss;
}
export const isOverDailyMaxLossFromRealizedProfitLossAndExistingPosition = (symbol: string, logTags: Models.LogTags) => {
    let pnl = Models.getRealizedProfitLoss();
    let risk = getRiskInDollarFromExistingPosition(symbol);
    let currentPotentialTotalLoss = pnl - risk;
    let limit = getMaxDailyLossLimit();
    if (currentPotentialTotalLoss < 0 && Math.abs(currentPotentialTotalLoss) > limit) {
        Firestore.logError(`exceeded daily max loss: current pnl - risk = ${pnl} - ${risk} = ${currentPotentialTotalLoss} > ${limit}`, logTags);
        return true;
    }
    return false;
}
export const getRiskInDollarFromExistingPosition = (symbol: string) => {
    let filledPrice = Models.getAveragePrice(symbol);
    let position = Models.getPosition(symbol);
    if (!position) {
        return 0;
    }
    let isLong = position.netQuantity > 0;
    let riskUsingStopOrders = getRiskInDollarFromExistingPositionUsingStopOrders(symbol, filledPrice);
    let positionQuantity = Math.abs(position.netQuantity);
    if (riskUsingStopOrders.quantity >= positionQuantity) {
        return riskUsingStopOrders.risk;
    } else {
        Firestore.logError(`${symbol} not all quantity has stop loss in UI, quantity with stop: ${riskUsingStopOrders.quantity}, total: ${positionQuantity}`);
        let symbolData = Models.getSymbolData(symbol);
        let remainingQuantity = positionQuantity - riskUsingStopOrders.quantity;
        let riskPerShare = 0;
        if (position.netQuantity > 0) {
            riskPerShare = getRiskPerShare(symbol, filledPrice, symbolData.lowOfDay);
        } else if (position.netQuantity < 0) {
            riskPerShare = getRiskPerShare(symbol, filledPrice, symbolData.highOfDay);
        }
        let risk = riskPerShare * remainingQuantity;
        risk += riskUsingStopOrders.risk;
        return risk;
    }
};
export const getRiskInDollarFromExistingPositionUsingStopOrders = (symbol: string, filledPrice: number) => {
    let exits = Models.getExitOrdersPairs(symbol);
    let quantity = 0;
    let risk = 0;
    exits.forEach(pair => {
        let stop = pair.STOP;
        if (stop && stop.price) {
            quantity += stop.quantity;
            let riskToAdd = stop.quantity * Math.abs(filledPrice - stop.price);
            risk += riskToAdd;
        }
    });
    return {
        quantity: quantity,
        risk: risk,
    };
}

export const isBreakeven = (profit: number) => {
    let threshold = getMaxDailyLossLimit() * 0.05;
    return Math.abs(profit) <= threshold;
};

export const riskInDollarToMultiples = (risk: number) => {
    let riskMultiples = risk / getMaxDailyLossLimit();
    return Math.round(riskMultiples * 1000) / 1000;
}

export const isOverSized = (symbol: string) => {
    let riskMultiples = getRiskMultiplesFromExistingPosition(symbol);
    return (riskMultiples > 0.25)
}

export const isPaperCut = (entryPrice: number, stopLossPrice: number, exitPrice: number) => {
    let originalRisk = Math.abs(entryPrice - stopLossPrice);
    let currentLoss = Math.abs(entryPrice - exitPrice);
    return currentLoss <= originalRisk * 0.15;
}

export const hasEnoughBuyingPower = (currentPrice: number, quantity: number) => {
    let account = Models.getBrokerAccount();
    if (!account) {
        return false;
    }
    let buyingPower = account.currentBalance * 3.9; // leave some room
    let required = currentPrice * quantity;
    let used = 0;

    let watchlist = Models.getWatchlist();
    let symbolsInWatchlist: Map<string, boolean> = new Map<string, boolean>();
    watchlist.forEach(item => {
        symbolsInWatchlist.set(item.symbol, true);
    });

    account.positions.forEach((position, symbol) => {
        if (symbolsInWatchlist.has(symbol)) {
            let positionPrice = Models.getCurrentPrice(symbol);
            used += Math.abs(position.netQuantity) * positionPrice;
        }
    });

    if ((buyingPower - used) <= required) {
        Firestore.logError(`buying power: ${buyingPower}, used: ${used}, required: ${required}`);
        return false;
    } else {
        return true;
    }
}

export const isRealizedProfitLossOverThreshold = (symbol: string) => {
    let profitLoss = Models.getRealizedProfitLossForSymbol(symbol);
    if (profitLoss > 0) {
        return false;
    }
    let loss = Math.abs(profitLoss);
    return loss >= 0.2 * getMaxDailyLossLimit();
}