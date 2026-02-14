import * as Helper from '../utils/helper';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as EntryHandler from '../controllers/entryHandler';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as Patterns from './patterns';
import * as Rules from './rules';
import * as Broker from '../api/broker';

interface AlgoState {
    timeoutID: NodeJS.Timeout,
    initialSizeMultiplier: number,
    planType: TradingPlansModels.PlanType,
    isLong: boolean,
    hasPendingCondition: boolean,
    pendingConditionPassed: boolean
}
export let algoStateBySymbol = new Map<string, AlgoState>();

export const startAlgo = (symbol: string, isLong: boolean,
    plan: TradingPlansModels.BasePlan, planType: TradingPlansModels.PlanType) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}_${planType}`);
    Firestore.logInfo(logTags.logSessionName, logTags);
    // make sure there's no already same algo
    let currentState = algoStateBySymbol.get(symbol);
    if (currentState) {
        Firestore.logError(`already having RedToGreen60 as ${currentState.planType}, skip`, logTags);
        return;
    }

    let seconds = Helper.getSecondsSinceMarketOpen(new Date());
    if (seconds > 60) {
        Firestore.logError(`expired after 1st minute`, logTags);
        return;
    }

    let waitSeconds = 0.01;
    Firestore.logInfo(`schedule RedToGreen60 as ${planType}`, logTags);
    let loopId = setTimeout(() => {
        loop(symbol, isLong, true, plan, planType, logTags);
    }, waitSeconds * 1000);
    let newState: AlgoState = {
        timeoutID: loopId,
        initialSizeMultiplier: 0,
        planType: planType,
        isLong: isLong,
        hasPendingCondition: false,
        pendingConditionPassed: false,
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
export const checkPendingCondition = (symbol: string) => {
    // OpenDriveContinuation60 removed
}
const prepareNextLoop = (waitInSeconds: number, symbol: string, isLong: boolean,
    plan: TradingPlansModels.BasePlan, planType: TradingPlansModels.PlanType, logTags: Models.LogTags) => {
    let loopId = setTimeout(() => {
        loop(symbol, isLong, false, plan, planType, logTags);
    }, waitInSeconds * 1000);
    let s = algoStateBySymbol.get(symbol);
    if (s) {
        s.timeoutID = loopId;
        algoStateBySymbol.set(symbol, s);
    }

}
export const loop = (symbol: string, isLong: boolean, isFirstLoop: boolean,
    plan: TradingPlansModels.BasePlan, planType: TradingPlansModels.PlanType, logTags: Models.LogTags) => {
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

    // OpenDriveContinuation60 removed; no plan types left for this algo
}
const checkLiquidityAndDailyRange = (symbol: string, isLong: boolean, isFirstLoop: boolean,
    plan: TradingPlansModels.BasePlan, planType: TradingPlansModels.PlanType, logTags: Models.LogTags) => {
    let scale = Models.getLiquidityScale(symbol);
    if (scale == 0) {
        logError(isFirstLoop, `not enough liquidity, recheck after 0.4 seconds`, logTags);
        prepareNextLoop(0.4, symbol, isLong, plan, planType, logTags);
        return false;
    } else {
        Firestore.logInfo(`liquidity pass with ${scale}`);
    }
    return true;
}
const runPlan = (symbol: string, isLong: boolean,
    plan: TradingPlansModels.BasePlan,
    planType: TradingPlansModels.PlanType, logTags: Models.LogTags) => {
    let algoState = algoStateBySymbol.get(symbol);
    if (!algoState) {
        Firestore.logInfo('algo canceled, existing', logTags);
        return;
    }
    algoState.initialSizeMultiplier = EntryHandler.runRedToGreen60Plan(symbol, isLong, plan, planType, logTags);
    if (algoState.initialSizeMultiplier <= 0) {
        Firestore.logError(`size is 0, existing algo`);
    }
    algoStateBySymbol.delete(symbol);
    /*
    if (planType == TradingPlansModels.PlanType.ProfitTakingExhuast60
    ) {
        let seconds = Helper.getSecondsSinceMarketOpen(new Date());
        let waitSeconds = 59 - seconds;
        setTimeout(() => {
            
             * cancel entry if not triggered in the first 60 seconds.
             * for gap up extended short, after 1st min close, if it didn't trigger,
             * vwap will be much closer, and it reduce the profit potential.
            
            Broker.cancelBreakoutEntryOrders(symbol);
        }, waitSeconds * 1000);

    }*/
}
const logError = (isFirstLoop: boolean, msg: string, logTags: Models.LogTags) => {
    if (isFirstLoop) {
        Firestore.logError(msg, logTags);
    } else {
        Firestore.logError(msg, logTags);
    }
}

