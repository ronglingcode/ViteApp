import * as Helper from '../utils/helper';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as EntryHandler from '../controllers/entryHandler';
import * as Patterns from './patterns';
import * as Rules from './rules';


interface AlgoState {
    timeoutID: NodeJS.Timeout,
    initialSizeMultiplier: number,
}
export let algoStateBySymbol = new Map<string, AlgoState>();

export const startAlgo = (symbol: string, isLong: boolean,
    plan: TradingPlansModels.RedToGreenPlan) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}_red2greenAlgo`);
    Firestore.logInfo(logTags.logSessionName, logTags);
    // make sure there's no already red to green algo
    let currentState = algoStateBySymbol.get(symbol);
    if (currentState) {
        Firestore.logError(`already having a red to green, skip`);
        return;
    }

    let seconds = Helper.getSecondsSinceMarketOpen(new Date());
    if (seconds >= 55) {
        Firestore.logInfo(`run red to green immediately`, logTags);
        EntryHandler.runRedToGreenPlan(symbol, isLong, plan);
        return;
    }

    let waitSeconds = 61 - seconds;
    Firestore.logInfo(`schedule red to green in ${waitSeconds} seconds`, logTags);
    let loopId = setTimeout(() => {
        loop(symbol, isLong, true, plan, logTags);
    }, waitSeconds * 1000);
    let newState: AlgoState = {
        timeoutID: loopId,
        initialSizeMultiplier: 0,
    }
    algoStateBySymbol.set(symbol, newState);
}

export const stopAlgo = (symbol: string) => {
    let s = algoStateBySymbol.get(symbol);
    if (s) {
        clearTimeout(s.timeoutID);
        algoStateBySymbol.delete(symbol);
    }
}

const prepareNextLoop = (waitInSeconds: number, symbol: string, isLong: boolean,
    plan: TradingPlansModels.RedToGreenPlan, logTags: Models.LogTags) => {
    let loopId = setTimeout(() => {
        loop(symbol, isLong, false, plan, logTags);
    }, waitInSeconds * 1000);
    let s = algoStateBySymbol.get(symbol);
    if (s) {
        s.timeoutID = loopId;
        algoStateBySymbol.set(symbol, s);
    }

}
export const loop = (symbol: string, isLong: boolean, isFirstLoop: boolean,
    plan: TradingPlansModels.RedToGreenPlan, logTags: Models.LogTags) => {
    let algoState = algoStateBySymbol.get(symbol);
    if (!algoState) {
        Firestore.logInfo('algo canceled, existing', logTags);
        return;
    }

    let secondsSinceMarketOpen = Helper.getSecondsSinceMarketOpen(new Date());
    if (secondsSinceMarketOpen > 60) {
        Firestore.logInfo('exiting after 60 seconds', logTags);
        algoStateBySymbol.delete(symbol);
        return;
    }

    // wait for conditions to meet to submit orders
    let currentCandle = Models.getCurrentCandle(symbol);
    let hasReversal = Patterns.hasReversalBarSinceOpen(symbol, isLong, plan.strictMode, plan.considerCurrentCandleAfterOneMinute, "loop");
    let scale = Models.getLiquidityScale(symbol);
    let enoughAtr = meetAtrRule(symbol, currentCandle, logTags);
    if (enoughAtr && hasReversal && scale > 0) {
        // meet condition, submit orders
        algoState.initialSizeMultiplier = EntryHandler.runRedToGreenPlan(symbol, isLong, plan);
        if (algoState.initialSizeMultiplier <= 0) {
            Firestore.logError(`size is 0, existing algo`);
        }
        algoStateBySymbol.delete(symbol);
    } else {
        if (!hasReversal) {
            logError(isFirstLoop, `not reversal, recheck after 0.4 seconds`, logTags);
        }
        if (!enoughAtr) {
            logError(isFirstLoop, `range too small, recheck after 0.4 seconds`, logTags);
        }
        if (scale == 0) {
            logError(isFirstLoop, `not enough liquidity, recheck after 0.4 seconds`, logTags);
        }
        prepareNextLoop(0.4, symbol, isLong, plan, logTags);
    }
}
const logError = (isFirstLoop: boolean, msg: string, logTags: Models.LogTags) => {
    if (isFirstLoop) {
        Firestore.logError(msg, logTags);
    } else {
        Firestore.logError(msg, logTags);
    }
}

const meetAtrRule = (symbol: string, currentCandle: Models.Candle, logTags: Models.LogTags) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    let atr = plan.atr;
    return !Rules.isDailyRangeTooSmall(symbol, atr, true, logTags);
}
