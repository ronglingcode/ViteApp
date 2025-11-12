import * as Firestore from '../firestore';
import * as Config from '../config/config';
import * as Models from './models';
import * as AutoTrader from '../algorithms/autoTrader';
import * as TakeProfit from '../algorithms/takeProfit'
import * as TradingPlansModels from './tradingPlans/tradingPlansModels';
import * as UI from '../ui/ui';
import { Timestamp } from 'firebase/firestore';
import * as Helper from '../utils/helper';
declare let window: Models.MyWindow;

const getDefaultAtr = () => {
    let result: TradingPlansModels.AverageTrueRange = {
        average: 0,
        mutiplier: 0,
        minimumMultipler: 1,
        maxRisk: 0,
    }
    return result;
}
const getDefaultBreakoutTradeState = (isLong: boolean) => {
    let result: Models.BreakoutTradeState = {
        hasValue: false,
        entryPrice: 0,
        stopLossPrice: 0,
        initialQuantity: 0,
        submitTime: Timestamp.now(),
        isLong: isLong,
        status: Models.BreakoutTradeStatus.None,
        isMarketOrder: false,
        lowestExitBatchCount: -1,
        sizeMultipler: 0,
        maxPullbackAllowed: 0,
        maxPullbackReached: 0,
        adjustedTargetDueToMaxPullback: false,
        exitDescription: "",
        closedOutsideRatio: -1,
        submitEntryResult: {
            isSingleOrder: false,
            profitTargets: [],
            totalQuantity: 0,
            tradeBookID: "",
        },
        plan: {
            targets: {
                initialTargets: {
                    priceLevels: [],
                    rrr: [],
                    dailyRanges: [],
                },
                trail5Count: 0,
                trail15Count: 0,
            },
            planConfigs: {
                size: 0,
                deferTradingInSeconds: 0,
                stopTradingAfterSeconds: 0,
                requireReversal: true,
                alwaysAllowFlatten: false,
                alwaysAllowMoveStop: false,
                setupQuality: TradingPlansModels.SetupQuality.Move2Move,
            },
        }
    }
    return result;
}
export const getDefaultSymbolState = () => {
    let result: Models.SymbolState = {
        breakoutTradeStateForLong: getDefaultBreakoutTradeState(true),
        breakoutTradeStateForShort: getDefaultBreakoutTradeState(false),
        peakRiskMultiple: 0,
    };
    return result;
};

export const getDefaultTradingState = () => {
    let result: Models.TradingState = {
        date: "",
        initialBalance: 0,
        stateBySymbol: new Map<string, Models.SymbolState>(),
        readOnlyStateBySymbol: new Map<string, Models.ReadOnlySymbolState>(),
    }
    return result;
}

let internalTradingState = getDefaultTradingState();

export const getSymbolState = (symbol: string) => {
    let mapValue = internalTradingState.stateBySymbol.get(symbol);
    if (!mapValue) {
        let newValue = getDefaultSymbolState();
        internalTradingState.stateBySymbol.set(symbol, newValue);
        return newValue;
    } else {
        return mapValue;
    }
};
export const getBreakoutTradeState = (symbol: string, isLong: boolean) => {
    let ss = getSymbolState(symbol);
    if (isLong)
        return ss.breakoutTradeStateForLong;
    else
        return ss.breakoutTradeStateForShort;

}

export const addStocksFromWatchlist = (stocks: Models.WatchlistItem[]) => {
    window.HybridApp.SymbolsList = [];
    stocks.forEach(stock => {
        window.HybridApp.SymbolsList.push(stock.symbol);
    });
};

export const initializeTradingState = async (account: Models.BrokerAccount) => {
    let state = await Firestore.getTradingState();
    let currentDate = Config.Settings.currentDay;
    let dateString = currentDate.toLocaleDateString();
    if (state == null || dateString !== state.date) {
        // start a new day
        let initialState = getDefaultTradingState();
        initialState.date = dateString;
        initialState.initialBalance = account.currentBalance;
        internalTradingState = initialState;
        update();
    } else {
        internalTradingState = state;
    }
    console.log(internalTradingState);
    return true;
};

export const set = async (state: Models.TradingState) => {
    internalTradingState = state;
    Firestore.setTradingState(state);
};
export const update = async () => {
    let state = internalTradingState;
    if (state) {
        Firestore.setTradingState(state);
        UI.displayState(state);
    }
};

export const getInitialBalance = () => {
    return internalTradingState.initialBalance;
}

export const setPendingOrderTimeoutID = (symbol: string, timeoutID: NodeJS.Timeout) => {
    let symbolState = getSymbolState(symbol);
    symbolState.pendingOrderTimeoutID = timeoutID;
    update();
};

export const clearPendingOrder = (symbol: string) => {
    let symbolState = getSymbolState(symbol);
    if (symbolState.pendingOrderTimeoutID) {
        clearTimeout(symbolState.pendingOrderTimeoutID);
    }
};

export const onPlaceMarketTrade = async (symbol: string, isLong: boolean,
    entryPrice: number, stopLossPrice: number, submitEntryResult: Models.SubmitEntryResult,
    sizeMultipler: number,
    plan: TradingPlansModels.BasePlan) => {
    onPlaceTrade(symbol, isLong, true, entryPrice, stopLossPrice, submitEntryResult, sizeMultipler, plan);
};
export const onPlaceBreakoutTrade = async (symbol: string, isLong: boolean,
    entryPrice: number, stopLossPrice: number, submitEntryResult: Models.SubmitEntryResult,
    sizeMultipler: number,
    plan: TradingPlansModels.BasePlan) => {
    onPlaceTrade(symbol, isLong, false, entryPrice, stopLossPrice, submitEntryResult, sizeMultipler, plan);
};

const onPlaceTrade = async (symbol: string, isLong: boolean, isMarketOrder: boolean,
    entryPrice: number, stopLossPrice: number, submitEntryResult: Models.SubmitEntryResult,
    sizeMultipler: number,
    plan: TradingPlansModels.BasePlan) => {
    let netQuantity = Models.getPositionNetQuantity(symbol);
    if ((isLong && netQuantity > 0) || (!isLong && netQuantity < 0)) {
        // adding positions there's already a trading state in the same direction
        return;
    }
    let symbolState = getSymbolState(symbol);
    let atr = Models.getAtr(symbol);
    let readOnlyState: Models.ReadOnlySymbolState = {
        atr: atr,
    };
    let bts: Models.BreakoutTradeState = {
        hasValue: true,
        isLong: isLong,
        entryPrice: entryPrice,
        stopLossPrice: stopLossPrice,
        initialQuantity: submitEntryResult.totalQuantity,
        submitTime: Timestamp.now(),
        status: Models.BreakoutTradeStatus.Pending,
        isMarketOrder: isMarketOrder,
        lowestExitBatchCount: -1,
        submitEntryResult: submitEntryResult,
        plan: plan,
        sizeMultipler: sizeMultipler,
        maxPullbackAllowed: Helper.getPullbackPrice(symbol, entryPrice, stopLossPrice, isLong, 0.75),
        maxPullbackReached: 0,
        adjustedTargetDueToMaxPullback: false,
        exitDescription: "",
        closedOutsideRatio: -1,
    };
    if (isLong) {
        symbolState.breakoutTradeStateForLong = bts;
    } else {
        symbolState.breakoutTradeStateForShort = bts;
    }
    symbolState.activeBasePlan = plan;
    internalTradingState.readOnlyStateBySymbol.set(symbol, readOnlyState);
    update();
    AutoTrader.checkTimingForEntry(symbol);
}

export const getAtrInTrade = (symbol: string) => {
    let readOnlyState = internalTradingState.readOnlyStateBySymbol.get(symbol);
    let result: TradingPlansModels.AverageTrueRange = {
        average: 100,
        mutiplier: 1,
        minimumMultipler: 1,
        maxRisk: 0,
    };
    if (readOnlyState) {
        let atr = readOnlyState.atr;
        result.average = atr.average;
        result.mutiplier = atr.mutiplier;
        result.minimumMultipler = atr.minimumMultipler;
        result.maxRisk = atr.maxRisk;
    }
    return result;
}

export const updatePeakRisk = (symbol: string, riskMultiple: number) => {
    let symbolState = getSymbolState(symbol);
    symbolState.peakRiskMultiple = riskMultiple;
    update();
}

export const updateLowestExitBatchCount = (symbol: string, count: number) => {
    let isLong = Models.isLongForReload(symbol);
    let breakoutTradeState = getBreakoutTradeState(symbol, isLong);
    let oldCount = breakoutTradeState.lowestExitBatchCount;
    if (oldCount != -1 && count < oldCount) {
        breakoutTradeState.lowestExitBatchCount = count;
        Firestore.logInfo(`update lowestExitBatchCount to ${count}`);
        update();
    }
}

export const setLowestExitBatchCount = (symbol: string, isLong: boolean, count: number) => {
    let breakoutTradeState = getBreakoutTradeState(symbol, isLong);
    let oldCount = breakoutTradeState.lowestExitBatchCount;
    if (oldCount == -1) {
        breakoutTradeState.lowestExitBatchCount = count;
        Firestore.logInfo(`set lowestExitBatchCount to ${count}`);
        update();
    }
}

export const setExitDescription = (symbol: string, isLong: boolean, description: string) => {
    let breakoutTradeState = getBreakoutTradeState(symbol, isLong);
    breakoutTradeState.exitDescription = description;
    update();
}

export const getAddCount = (symbol: string, isLong: boolean) => {
    let addedStack = getAddedPartialStack(symbol, isLong);
    if (addedStack.length > 0) {
        Firestore.logInfo(`added partial:`);
        Firestore.logInfo(addedStack);
    }
    return addedStack.length;
    /*
    let breakoutTradeState = getBreakoutTradeState(symbol, isLong);
    let oldCount = breakoutTradeState.lowestExitBatchCount;
    Firestore.logInfo(`lowestExitBatchCount is ${oldCount}`);
    if (oldCount == -1) {
        return 0;
    }
    let currentCount = Models.getExitOrdersPairs(symbol).length;
    if (currentCount > oldCount) {
        return currentCount - oldCount;
    } else {
        return 0;
    }
    */
}


export const getAddedPartialStack = (symbol: string, isLong: boolean) => {
    let trade = Models.getCurrentOpenTrade(symbol);
    if (!trade) {
        return [];
    }
    let stack: number[] = [];
    let executions: Models.OrderExecution[] = [];
    trade.entries.forEach(entry => {
        executions.push(entry);
    });
    trade.exits.forEach(exit => {
        executions.push(exit);
    });
    executions.sort((a, b) => {
        let timeA = a.time;
        let timeB = b.time;
        return timeA.getTime() - timeB.getTime();
    });
    let state = getBreakoutTradeState(symbol, isLong);
    let initialQuantity = state.initialQuantity;
    let currentQuantity = 0;
    let hasExit = false;
    for (let i = 0; i < executions.length; i++) {
        let cur = executions[i];
        if (cur.positionEffectIsOpen) {
            currentQuantity += cur.quantity;
            let isAdd = (currentQuantity > initialQuantity) || hasExit;
            if (isAdd) {
                stack.push(cur.price);
            }
        } else {
            hasExit = true;
            currentQuantity -= cur.quantity;
            if (stack.length > 0) {
                stack.pop();
            }
        }
    }
    return stack;
}