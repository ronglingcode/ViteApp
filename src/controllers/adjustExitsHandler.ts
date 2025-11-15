import * as Models from '../models/models';
import * as Helper from '../utils/helper';
import * as Calculator from '../utils/calculator';
import * as Firestore from '../firestore';
import * as ExitRulesChecker from './exitRulesChecker';
import * as OrderFlow from './orderFlow';
import * as Chart from '../ui/chart';
import * as ExitRulesCheckerNew from './exitRulesCheckerNew';
import * as TraderFocus from './traderFocus';
import * as QuestionPopup from '../ui/questionPopup';

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

export const getSnapPriceForAdjustStops = (symbol: string, newPrice: number) => {
    let snapPrice = newPrice;
    if (Models.isSnapMode()) {
        let now = new Date();
        let seconds = Helper.getSecondsSinceMarketOpen(now);
        let isFirstMinute = 0 < seconds && seconds < 60;
        if (isFirstMinute) {
            return newPrice;
        }
        let firstEntryTime = Models.getFirstEntryTime(symbol);
        if (firstEntryTime) {
            if (Helper.jsDateToTradingViewUTC(firstEntryTime) == Helper.jsDateToTradingViewUTC(now)) {
                return newPrice;
            }
        }
        // get snap price
        let hoveredCandle = Chart.getHoveredCandle(symbol);
        if (hoveredCandle) {
            let positionIsLong = Models.getPositionNetQuantity(symbol) > 0;
            if (positionIsLong) {
                snapPrice = hoveredCandle.low;
            } else {
                snapPrice = hoveredCandle.high;
            }
        }
    }
    return snapPrice;
}
export const prepareAdjustStopExits = (symbol: string, newPrice: number, logName: string) => {
    let logTags = Models.generateLogTags(symbol, logName);
    Firestore.logInfo(logTags.logSessionName, logTags);
    let positionIsLong = Models.getPositionNetQuantity(symbol) > 0;
    let newUpdatedPrice = Calculator.updateStopPriceFromCurrentQuote(symbol, newPrice, !positionIsLong);
    return {
        logTags: logTags,
        newUpdatedPrice: newUpdatedPrice,
    }
}

export const adjustAllStopExitsWithoutRule = async (symbol: string, newPrice: number) => {
    let { logTags, newUpdatedPrice } = prepareAdjustStopExits(symbol, newPrice, `${symbol}-adjust_all_stops`);
    Firestore.logInfo(logTags.logSessionName, logTags);

    OrderFlow.moveAllStopExitsToNewPrice(symbol, newUpdatedPrice, logTags);
    onAdjustExits(symbol);
};

export const tryAdjustSingleLimitExit = (symbol: string, positionIsLong: boolean, keyIndex: number,
    order: Models.OrderModel, pair: Models.ExitPair,
    newPrice: number, isFromBatch: boolean, totalPairsCount: number, logTags: Models.LogTags) => {
    if (!isFromBatch) {
        let allowed = ExitRulesCheckerNew.isAllowedToAdjustSingleLimitOrder(symbol, keyIndex, order, pair, newPrice, logTags)
        if (!allowed) {
            Firestore.logError(`Rules blocked adjusting order for ${symbol}`, logTags);
            return;
        }
    }
    OrderFlow.adjustExitPairsWithNewPrice(symbol, [pair], newPrice, false, positionIsLong, logTags);
    afterAdjustSingleExit(symbol, totalPairsCount);
}


export const tryAdjustSingleStopExit = (symbol: string, positionIsLong: boolean, keyIndex: number,
    order: Models.OrderModel, pair: Models.ExitPair,
    newPrice: number, isFromBatch: boolean, totalPairsCount: number, logTags: Models.LogTags) => {
    if (!isFromBatch) {
        let allowed = ExitRulesCheckerNew.checkAdjustSingleStopOrderRules(symbol, keyIndex, order, pair, newPrice, logTags)
        if (!allowed) {
            Firestore.logError(`Rules blocked adjusting order for ${symbol}`, logTags);
            return;
        }
    }
    OrderFlow.adjustExitPairsWithNewPrice(symbol, [pair], newPrice, true, positionIsLong, logTags);
    afterAdjustSingleExit(symbol, totalPairsCount);
}

export const afterAdjustSingleExit = (symbol: string, totalPairsCount: number) => {
    if (totalPairsCount > 7) {
        return;
    }

    /*let message = "";
    let alertText = "";
    let tradeManagetment = TraderFocus.getTradeManagementFromPosition(symbol);
    let tradebook = TraderFocus.getTradebookFromPosition(symbol);
    if (tradebook) {
        alertText = tradebook.name
    }
    if (totalPairsCount < 4) {
        message = "review trade book, manage third leg in M15";
    } else if (totalPairsCount <= 7) {
        message = "review trade book, manage second leg in M5";
    }
    alertText += `: ${message}`;
    alert(alertText);*/
    let now = new Date();
    let seconds = Helper.getSecondsSinceMarketOpen(now);
    if (seconds < 60 * 2 + 30) {
        // skip pop up for the first 2.5 minutes
        return;
    }
    // check entry time and market time, if after 2 minutes, show question popup
    //QuestionPopup.show(symbol);
}