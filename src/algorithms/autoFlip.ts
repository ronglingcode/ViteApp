import * as Helper from '../utils/helper';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as EntryHandler from '../controllers/entryHandler';
import * as Broker from '../api/broker';

export const startAutoFlip = (symbol: string) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    if (!plan || !plan.autoFlip)
        return;

    let secondsSinceMarketOpen = Helper.getSecondsSinceMarketOpen(new Date());
    let logTags = EntryHandler.getLogTagsForEntryAction(symbol, true, "autoFlip");
    let waitInSeconds = 0;
    if (secondsSinceMarketOpen < 0) {
        // need to wait for market open
        waitInSeconds = Math.abs(secondsSinceMarketOpen) + 1;
    }
    setTimeout(() => {
        runAutoFlip(symbol, logTags);
    }, waitInSeconds * 1000);
}
export const runAutoFlip = (symbol: string, logTags: Models.LogTags) => {
    let secondsSinceMarketOpen = Helper.getSecondsSinceMarketOpen(new Date());
    if (secondsSinceMarketOpen > 5 * 60) {
        return;
    }

    let q = Models.getPositionNetQuantity(symbol);
    if (q != 0) {
        let isLong = q > 0;
        let hasFlipEntries = false;
        let entries = Models.getEntryOrders(symbol);
        let currentStopLoss = 0;
        for (let i = 0; i < entries.length; i++) {
            if (entries[i].isBuy == !isLong) {
                hasFlipEntries = true;
                if (entries[i].exitStopPrice) {
                    currentStopLoss = entries[i].exitStopPrice || 0;
                }
                break;
            }
        }
        if (hasFlipEntries) {
            updateEntryWithStop(symbol, !isLong, currentStopLoss, logTags);
        } else {
            submitFlipEntry(symbol, !isLong, logTags);
        }
    }

    setTimeout(() => {
        runAutoFlip(symbol, logTags);
    }, 2000);
}
export const updateEntryWithStop = (symbol: string, isLong: boolean, currentStopLoss: number, logTags: Models.LogTags) => {
    if (currentStopLoss == 0) {
        Firestore.logInfo('no stop loss from entry orders, nothing to update', logTags);
        return;
    }
    let symbolData = Models.getSymbolData(symbol);
    let newStopLoss = isLong ? symbolData.lowOfDay : symbolData.highOfDay;
    let entryPrice = isLong ? symbolData.highOfDay : symbolData.lowOfDay;
    if ((isLong && newStopLoss < currentStopLoss) || (
        !isLong && newStopLoss > currentStopLoss)) {
        Firestore.logDebug('update entry orders', logTags);
        Broker.cancelOneSideEntryOrders(symbol, isLong);
        submitFlipEntry(symbol, isLong, logTags);
    }
};
export const submitFlipEntry = (symbol: string, isLong: boolean, logTags: Models.LogTags) => {
    let symbolData = Models.getSymbolData(symbol);
    let newStopLoss = isLong ? symbolData.lowOfDay : symbolData.highOfDay;
    let entryPrice = isLong ? symbolData.highOfDay : symbolData.lowOfDay;
    /*
    EntryHandler.breakoutEntryWithoutRules(
        symbol, isLong, entryPrice, newStopLoss, logTags, sizeMultipler, algo);
        */
};