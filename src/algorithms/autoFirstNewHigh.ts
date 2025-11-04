import * as Models from '../models/models';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as Firestore from '../firestore';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as EntryHandler from '../controllers/entryHandler';
import * as OrderFlow from '../controllers/orderFlow';
import * as Helper from '../utils/helper';
import * as AutoLevelMomentum from './autoLevelMomentum';
import * as Chart from '../ui/chart';
import * as Popup from '../ui/popup';
interface AlgoState {
    isLong: boolean,
    plan: TradingPlansModels.FirstNewHighPlan,
    logTags: Models.LogTags,
    orderSubmitted: boolean,
}
export let algoStateBySymbol = new Map<string, AlgoState>();

export const TryAutoTrigger = (symbol: string) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    if (plan.long && plan.long.firstNewHighPlan && plan.long.firstNewHighPlan.enableAutoTrigger) {
        TryAutoTriggerForOneSide(symbol, true, plan.long.firstNewHighPlan);
    }
    if (plan.short && plan.short.firstNewHighPlan && plan.short.firstNewHighPlan.enableAutoTrigger) {
        TryAutoTriggerForOneSide(symbol, false, plan.short.firstNewHighPlan);
    }
}

export const TryAutoTriggerForOneSide = (symbol: string, isLong: boolean, plan: TradingPlansModels.FirstNewHighPlan) => {
    if (Models.hasEntryOrdersInSameDirection(symbol, isLong)) {
        Firestore.logError(`already had entries in the same direction, cannot auto trigger first new high`);
        return 0;
    }
    let netQuantity = Models.getPositionNetQuantity(symbol);
    if ((isLong && netQuantity > 0) || (!isLong && netQuantity < 0)) {
        Firestore.logError(`already had position in the same direction, cannot auto trigger first new high`);
        return 0;
    }
    startAlgo(symbol, isLong, true, plan);
}

export const startAlgo = (symbol: string, isLong: boolean, startImmediately: boolean,
    plan: TradingPlansModels.FirstNewHighPlan) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}_firstNewHighAlgo`);
    Firestore.logInfo(logTags.logSessionName, logTags);
    let s = algoStateBySymbol.get(symbol);
    if (s) {
        Firestore.logError(`already having first new high, skip`, logTags);
        return;
    }

    let newState: AlgoState = {
        isLong: isLong,
        plan: plan,
        logTags: logTags,
        orderSubmitted: false,
    };
    algoStateBySymbol.set(symbol, newState);
    if (startImmediately) {
        loop(symbol, newState);
    }
}
export const stopAlgo = (symbol: string) => {
    algoStateBySymbol.delete(symbol);
}

export const loop = (symbol: string, algoState: AlgoState) => {
    let logTags = algoState.logTags;
    let isLong = algoState.isLong;
    let plan = algoState.plan;
    let runResult = EntryHandler.runFirstNewHighPlan(symbol, isLong, plan, algoState.orderSubmitted, logTags);
    if (!runResult.needContinueNextCycle) {
        Firestore.logError(`not continue auto first new high`, logTags);
        stopAlgo(symbol);
    }
    if (runResult.orderSubmitted) {
        algoState.orderSubmitted = true;
    } else {
        Firestore.logInfo(`no entries yet, auto recheck in next cycle`, logTags);
    }
}

export const onMinuteClosed = (symbol: string) => {
    let s = algoStateBySymbol.get(symbol);
    if (s) {
        loop(symbol, s);
    } else {
        //notifyPotentialSetup(symbol);
    }
}
export const notifyPotentialSetup = (symbol: string) => {
    let seconds = Helper.getSecondsSinceMarketOpen(new Date());
    let minutes = Math.floor(seconds / 60);
    if (minutes < 7) {
        // remind 5 minute chart instead
        return;
    }

    let timeFrames: number[] = [];
    let minute_5_remainder = minutes % 5;
    let minute_15_remainder = minutes % 15;
    let minute_30_remainder = minutes % 30;
    if (minutes >= 5 &&
        (minute_5_remainder == 0 || minute_5_remainder == 1)) {
        timeFrames.push(5);
    }
    if (minutes >= 15 &&
        (minute_15_remainder == 0 || minute_15_remainder == 1)) {
        timeFrames.push(15);
    }
    if (minutes >= 30 &&
        (minute_30_remainder == 0 || minute_30_remainder == 1)) {
        timeFrames.push(30);
    }
    if (timeFrames.length == 0) {
        return;
    }
    let plan = TradingPlans.getTradingPlans(symbol);
    if (!TradingPlans.hasSingleMomentumLevel(plan)) {
        return;
    }
    let singleKeyArea = TradingPlans.getSingleMomentumLevel(plan);
    let openPrice = Models.getOpenPrice(symbol);
    if (!openPrice) {
        return;
    }
    let isLong = openPrice > singleKeyArea.high;
    let rawCandles = Models.getCandlesFromM1SinceOpen(symbol);

    timeFrames.forEach(timeFrame => {
        notifyPotentialSetupForTimeFrame(
            symbol, isLong, rawCandles, timeFrame, singleKeyArea);
    });
}

export const notifyPotentialSetupForTimeFrame = (symbol: string, isLong: boolean,
    rawCandles: Models.CandlePlus[], timeFrame: number, singleKeyArea: TradingPlansModels.LevelArea) => {
    let candles = Models.aggregateCandles(rawCandles, timeFrame);

    for (let i = 0; i < candles.length; i++) {
        let c = candles[i];
        if (isLong) {
            if (c.high < singleKeyArea.low) {
                return;
            }
        } else {
            if (c.low > singleKeyArea.high) {
                return;
            }
        }
    }

    let previousCandle = candles[0];
    for (let i = 1; i < candles.length; i++) {
        let currentCandle = candles[i];
        if (isLong) {
            if (currentCandle.high > previousCandle.high) {
                return;
            }
        } else {
            if (currentCandle.low < previousCandle.low) {
                return;
            }
        }
        previousCandle = currentCandle;
    }
    let direction = isLong ? 'high' : 'low';
    let keyLevels = [singleKeyArea.high];
    if (singleKeyArea.high != singleKeyArea.low) {
        keyLevels.push(singleKeyArea.low);
    }
    let message = `potential first new ${direction} on ${timeFrame} min`;
    let options: Popup.PopupOptions = {
        symbol: symbol,
        isLong: isLong,
        candles: candles,
        timeFrame: timeFrame,
        message: message,
        keyLevels: keyLevels,
    };
    new Popup.Popup(options, () => {
        console.log('Yes clicked!');
    });
    Firestore.logInfo(message);
    //Helper.speak(message);
}