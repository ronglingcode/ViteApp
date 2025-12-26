import { SingleKeyLevelTradebook } from './singleKeyLevelTradebook'
import type * as TradingPlansModels from '../../models/tradingPlans/tradingPlansModels'
import * as CommonRules from './commonRules'
import * as Chart from '../../ui/chart';
import * as Firestore from '../../firestore';
import * as AutoLevelMomentum from '../../algorithms/autoLevelMomentum';
import * as Models from '../../models/models';
import * as Helper from '../../utils/helper';
import * as Patterns from '../../algorithms/patterns';
import * as TradingPlans from '../../models/tradingPlans/tradingPlans';
import * as ExitRulesCheckerNew from '../../controllers/exitRulesCheckerNew';
import * as Calculator from '../../utils/calculator';
import { TradebookState, TradebookStateHelper } from '../tradebookStates';
import * as GlobalSettings from '../../config/globalSettings';

export abstract class BaseBreakoutTradebook extends SingleKeyLevelTradebook {
    public disableExitRules: boolean = false;
    public waitForClose: boolean = true;
    constructor(symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
        levelMomentumPlan: TradingPlansModels.LevelMomentumPlan, tradebookName: string, buttonLabel: string) {
        super(symbol, isLong, keyLevel, levelMomentumPlan, tradebookName, buttonLabel);
    }
    refreshLiveStats(): void {
        if (!this.isEnabled() || !GlobalSettings.allowLiveStats) {
            Helper.updateHtmlIfChanged(this.htmlStats, '');
            return;
        }
        let symbol = this.symbol;
        let isLong = this.isLong;
        let keyLevel = this.getKeyLevel();
        let hasClosedOutside = Patterns.hasClosedBeyondPrice(symbol, isLong, keyLevel);

        let topPlan = TradingPlans.getTradingPlans(symbol);
        let atr = topPlan.atr.average;
        let currentVwap = Models.getCurrentVwap(symbol);
        let distanceFromKeyLevelToVwap = Math.abs(this.getKeyLevel() - currentVwap);
        let distanceFromKeyLevelToVwapInAtrPercentageString = Calculator.getPercentageString(distanceFromKeyLevelToVwap, atr, 0);
        let stateDescription = TradebookStateHelper.getStateDescription(this.state);
        let liveStats = this.getCommonLiveStats();
        liveStats += `state: ${stateDescription}, level to vwap: ${distanceFromKeyLevelToVwapInAtrPercentageString} atr, closed outside: ${hasClosedOutside}`;
        Helper.updateHtmlIfChanged(this.htmlStats, liveStats);
    }
    /**
     * combine both breakout tradebook entry
     * first check whether there's a candle closed above the level. if yes, go normal process
     * if not, check whether there's candle tested key level.
     *  if yes, allow breakout above or at the high of any test candle
     *  if entry is not above any test candle yet, also above level, but need to use tight stop of current candle low
     *  
     * if no closed candles closed key level, only allow if wait for close is disabled
     * @param entryPrice 
     * @param stopOutPrice 
     * @param logTags 
     * @returns 
     */
    validateEntryWithoutClose(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, logTags: Models.LogTags): number {
        let allowedSize = CommonRules.validateCommonEntryRules(
            this.symbol, this.isLong, entryPrice, stopOutPrice, useMarketOrder, this.keyLevel, this.levelMomentumPlan, false, true, logTags);
        return allowedSize;
    }
    validateEntryWithCloseNew(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, logTags: Models.LogTags): number {
        let candles = Models.getM1ClosedCandlesSinceOpen(this.symbol);
        let hasTestedKeyLevel = false;
        for (let i = 0; i < candles.length; i++) {
            let c = candles[i];
            if ((this.isLong && c.high >= this.keyLevel.high) ||
                (!this.isLong && c.low <= this.keyLevel.low)) {
                hasTestedKeyLevel = true;
            }
        }
        if (!hasTestedKeyLevel) {
            Firestore.logError(`${this.symbol} has no candles tested key level`, logTags);
            return 0;
        }
        let allowedSize = CommonRules.validateCommonEntryRules(
            this.symbol, this.isLong, entryPrice, stopOutPrice, useMarketOrder, this.keyLevel, this.levelMomentumPlan, false, true, logTags);
        return allowedSize;
    }

    validateEntryWithClose(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, logTags: Models.LogTags): number {
        let hasClosedOutside = AutoLevelMomentum.hasClosedOutsideKeyLevel(this.symbol, this.isLong, this.keyLevel);
        if (!hasClosedOutside) {
            // not closed outside yet, try checking if there's a previous candle that tested key level
            Firestore.logError(`${this.symbol} has not closed outside key level`, logTags);
            let candles = Models.getM1ClosedCandlesSinceOpen(this.symbol);
            let candlesTestedkeyLevel: Models.CandlePlus[] = [];
            for (let i = 0; i < candles.length; i++) {
                let c = candles[i];
                if ((this.isLong && c.high > this.keyLevel.high) ||
                    (!this.isLong && c.low < this.keyLevel.low)) {
                    candlesTestedkeyLevel.push(c);
                }
            }
            if (candlesTestedkeyLevel.length == 0) {
                Firestore.logError(`${this.symbol} has no candles tested key level`, logTags);
                return 0;
            }
            let entryPriceThreshold = this.isLong ? candlesTestedkeyLevel[0].high : candlesTestedkeyLevel[0].low;
            for (let i = 1; i < candlesTestedkeyLevel.length; i++) {
                let c = candlesTestedkeyLevel[i];
                if (this.isLong) {
                    entryPriceThreshold = Math.min(entryPriceThreshold, c.high);
                } else {
                    entryPriceThreshold = Math.max(entryPriceThreshold, c.low);
                }
            }
            if ((this.isLong && entryPrice < entryPriceThreshold) ||
                (!this.isLong && entryPrice > entryPriceThreshold)) {
                Firestore.logError(`${this.symbol} entry price ${entryPrice} is inside threshold ${entryPriceThreshold}`, logTags);
                return 0;
            }
            hasClosedOutside = true;
        }
        let allowedSize = CommonRules.validateCommonEntryRules(
            this.symbol, this.isLong, entryPrice, stopOutPrice, useMarketOrder, this.keyLevel, this.levelMomentumPlan, false, true, logTags);
        return allowedSize;
    }

    generalEntry(entryPrice: number, useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters, logTags: Models.LogTags): number {
        let stopOutPrice = Chart.getStopLossPrice(this.symbol, this.isLong, true, null);
        
        let allowedSize = CommonRules.validateCommonEntryRules(
            this.symbol, this.isLong, entryPrice, stopOutPrice, useMarketOrder, this.keyLevel, this.levelMomentumPlan, false, true, logTags);
        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }
        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, stopOutPrice, allowedSize, logTags);
        return allowedSize;
    }
    generalEntryWithCustomRiskLevel(entryPrice: number, riskLevelPrice: number, stopOutPrice: number, useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters, logTags: Models.LogTags): number {
        let allowedSize = CommonRules.validateCommonEntryRules(
            this.symbol, this.isLong, entryPrice, riskLevelPrice, useMarketOrder, this.keyLevel, this.levelMomentumPlan, false, true, logTags);
        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }
        this.submitEntryOrdersWithCustomRiskLevelPrice(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, logTags);
        return allowedSize;
    }

    triggerClosedBeyondLevelNoRetest(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters, logTags: Models.LogTags): number {
        if (this.isLong) {
            Firestore.logError(`${this.symbol} trigger closed above level no retest`, logTags);
        } else {
            Firestore.logError(`${this.symbol} trigger closed below level no retest`, logTags);
        }
        // no retest yet, we need to use the current candle low as stop out price 
        let currentCandle = Models.getCurrentCandle(this.symbol);
        let stopOutPrice = currentCandle.low;
        if (!this.isLong) {
            stopOutPrice = currentCandle.high;
        }
        let entryPrice = Chart.getBreakoutEntryPrice(this.symbol, this.isLong, useMarketOrder, parameters);
        let symbolData = Models.getSymbolData(this.symbol);
        let riskLevelPrice = this.isLong ? symbolData.lowOfDay : symbolData.highOfDay;
        return this.generalEntryWithCustomRiskLevel(entryPrice, riskLevelPrice, stopOutPrice, useMarketOrder, dryRun, parameters, logTags);
    }

    triggerClosedBeyondLevelRetestTouchedLevel(entryPrice: number, deepestRetest: number, useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters, logTags: Models.LogTags): number {
        if (this.isLong) {
            Firestore.logError(`${this.symbol} trigger closed above level retest touched level`, logTags);
        } else {
            Firestore.logError(`${this.symbol} trigger closed below level retest touched level`, logTags);
        }
        let symbolData = Models.getSymbolData(this.symbol);
        let riskLevelPrice = this.isLong ? symbolData.lowOfDay : symbolData.highOfDay;
        let stopOutPrice =  deepestRetest;
        return this.generalEntryWithCustomRiskLevel(entryPrice, riskLevelPrice, stopOutPrice, useMarketOrder, dryRun, parameters, logTags);
    }

    triggerClosedBeyondLevelRetestNoTouchedLevel(entryPrice: number, useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters, logTags: Models.LogTags): number {
        if (this.isLong) {
            Firestore.logError(`${this.symbol} trigger closed above level retest no touched level`, logTags);
        } else {
            Firestore.logError(`${this.symbol} trigger closed below level retest no touched level`, logTags);
        }
        return this.generalEntry(entryPrice, useMarketOrder, dryRun, parameters, logTags);        
    }

    triggerClosedWithinLevelNewHigh(entryPrice: number, firstTestingCandle: Models.CandlePlus, useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters, logTags: Models.LogTags): number {
        if (this.isLong) {
            Firestore.logError(`${this.symbol} trigger closed within level new high`, logTags);
        } else {
            Firestore.logError(`${this.symbol} trigger closed within level new low`, logTags);
        }
        let symbolData = Models.getSymbolData(this.symbol);
        let riskLevelPrice = this.isLong ? symbolData.lowOfDay : symbolData.highOfDay;
        let stopOutPrice = this.isLong ? firstTestingCandle.low : firstTestingCandle.high;
        return this.generalEntryWithCustomRiskLevel(entryPrice, riskLevelPrice, stopOutPrice, useMarketOrder, dryRun, parameters, logTags);
    }

    triggerClosedWithinLevelReclaimLevel(entryPrice: number,useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters, logTags: Models.LogTags): number {
        Firestore.logError(`${this.symbol} trigger closed within level reclaim level`, logTags);
        let symbolData = Models.getSymbolData(this.symbol);
        let currentCandle = Models.getCurrentCandle(this.symbol);
        let riskLevelPrice = this.isLong ? symbolData.lowOfDay : symbolData.highOfDay;
        let stopOutPrice = this.isLong ? currentCandle.low : currentCandle.high;
        return this.generalEntryWithCustomRiskLevel(entryPrice, riskLevelPrice, stopOutPrice, useMarketOrder, dryRun, parameters, logTags);
    }

    triggerNoCloseBullFlagBeyondLevel(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters, logTags: Models.LogTags): number {
        if (this.waitForClose) {
            Firestore.logError(`${this.symbol} triggerNoCloseBullFlagBeyondLevel, waiting for close`, logTags);
            return 0;
        }
        if (this.isLong) {
            Firestore.logError(`${this.symbol} trigger no close bull flag above level`, logTags);
        } else {
            Firestore.logError(`${this.symbol} trigger no close bear flag below level`, logTags);
        }
        let symbolData = Models.getSymbolData(this.symbol);
        let entryPrice = this.isLong ? symbolData.highOfDay : symbolData.lowOfDay;
        // TODO: find the swing low / consolidation low to use as stop out price
        // can start with require a manual stop level, later detect the swing low automatically
        return this.generalEntry(entryPrice, useMarketOrder, dryRun, parameters, logTags);
    }
    triggerNoCloseBearFlagWithinLevel(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters, logTags: Models.LogTags): number {
        if (this.waitForClose) {
            Firestore.logError(`${this.symbol} triggerNoCloseBearFlagWithinLevel, waiting for close`, logTags);
            return 0;
        }
        if (this.isLong) {
            Firestore.logError(`${this.symbol} trigger no close bull flag below level`, logTags);
        } else {
            Firestore.logError(`${this.symbol} trigger no close bear flag above level`, logTags);
        }
        let entryPrice =  this.getKeyLevel();
        // TODO: find the swing low / consolidation low to use as stop out price
        return this.generalEntry(entryPrice, useMarketOrder, dryRun, parameters, logTags);
    }

    getDisallowedReasonToAdjustSingleLimitOrder(
        symbol: string, keyIndex: number, order: Models.OrderModel,
        pair: Models.ExitPair, newPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        let allowedReason: Models.CheckRulesResult = {
            allowed: false,
            reason: "default disallow",
        };
        if (this.disableExitRules) {
            allowedReason.allowed = true;
            allowedReason.reason = "disabled";
            return allowedReason;
        }

        let isMarketOrder = false;
        let newResult = ExitRulesCheckerNew.isAllowedForLimitOrderForAllTradebooks(
            symbol, this.isLong, isMarketOrder, newPrice, keyIndex, pair, logTags);
        if (newResult.allowed) {
            return newResult;
        }
        if (Patterns.hasLostKeyLevel(symbol, this.isLong, this.getKeyLevel())) {
            allowedReason.reason = "lost key level";
            allowedReason.allowed = true;
            return allowedReason;
        }
        if (Patterns.isPriceWorseThanKeyLevel(symbol, this.isLong, this.getKeyLevel(), newPrice)) {
            allowedReason.reason = "new price is worse than key level";
            allowedReason.allowed = false;
            return allowedReason;
        }

        return allowedReason;
    }

    getDisallowedReasonToAdjustSingleStopOrder(
        symbol: string, keyIndex: number, order: Models.OrderModel, pair: Models.ExitPair, newPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        if (this.disableExitRules) {
            return {
                allowed: true,
                reason: "disabled",
            };
        }
        Firestore.logInfo(`breakout tradebook check rules`, logTags);
        let result: Models.CheckRulesResult = {
            allowed: false,
            reason: "default disallow",
        };
        let isMarketOrder = false;
        let newResult = ExitRulesCheckerNew.isAllowedForSingleOrderForAllTradebooks(
            symbol, this.isLong, isMarketOrder, newPrice, keyIndex, logTags);
        if (newResult.allowed) {
            return newResult;
        }

        if (Patterns.hasLostKeyLevel(symbol, this.isLong, this.getKeyLevel())) {
            result.reason = "lost key level";
            result.allowed = true;
            return result;
        }
        if (Patterns.isPriceWorseThanKeyLevel(symbol, this.isLong, this.getKeyLevel(), newPrice)) {
            result.reason = "new price is worse than key level";
            result.allowed = false;
            return result;
        }
        let pullbackStatus = Patterns.getFirstPullbackStatus(symbol);
        if (pullbackStatus.status == "recovered") {
            // allow move stop to the pivot
            if (this.isLong) {
                if (newPrice > pullbackStatus.pivot) {
                    result.reason = "new price is higher than 1st pullback low";
                    result.allowed = false;
                    return result;
                } else {
                    result.reason = "new price respects 1st pullback low";
                    result.allowed = true;
                    return result;
                }
            } else {
                if (newPrice < pullbackStatus.pivot) {
                    result.reason = "new price is lower than 1st pullback high";
                    result.allowed = false;
                    return result;
                } else {
                    result.reason = "new price respects 1st pullback high";
                    result.allowed = true;
                    return result;
                }
            }
        } else {
            // pullback not started or recovered yet, only allow move stop to the low of breakout candle
            let breakoutCandle = Patterns.getFirstBreakoutCandle(symbol, this.isLong, this.getKeyLevel());
            if (breakoutCandle) {
                if (this.isLong) {
                    if (newPrice > breakoutCandle.low) {
                        result.reason = "new price is higher than breakout candle low";
                        result.allowed = false;
                        return result;
                    } else {
                        result.reason = "new price respects breakout candle low";
                        result.allowed = true;
                        return result;
                    }
                } else {
                    if (newPrice < breakoutCandle.high) {
                        result.reason = "new price is lower than breakdown candle high";
                        result.allowed = false;
                        return result;
                    } else {
                        result.reason = "new price respects breakdown candle high";
                        result.allowed = true;
                        return result;
                    }
                }
            } else {
                result.reason = "breakout candle not found";
                result.allowed = false;
                return result;
            }
        }
    }

    getDisallowedReasonToMarketOutSingleOrder(symbol: string, keyIndex: number, logTags: Models.LogTags): Models.CheckRulesResult {
        if (this.disableExitRules) {
            return {
                allowed: true,
                reason: "disabled",
            };
        }
        let result: Models.CheckRulesResult = {
            allowed: false,
            reason: "default disallow",
        };
        let isMarketOrder = true;
        let currentPrice = Models.getCurrentPrice(symbol);
        let newResult = ExitRulesCheckerNew.isAllowedForSingleOrderForAllTradebooks(
            symbol, this.isLong, isMarketOrder, currentPrice, keyIndex, logTags);
        if (newResult.allowed) {
            return newResult;
        }
        if (Patterns.hasLostKeyLevel(symbol, this.isLong, this.getKeyLevel())) {
            result.reason = "lost key level";
            result.allowed = true;
            return result;
        }
        if (Patterns.isPriceWorseThanKeyLevel(symbol, this.isLong, this.getKeyLevel(), currentPrice)) {
            result.reason = "new price is worse than key level";
            result.allowed = false;
            return result;
        }

        return result;
    }

    transitionToState(newState: TradebookState): void {
        if (this.state === newState) {
            return;
        }
        this.state = newState;
        // there's a bug, it can keep going between momentum and failed state
        // so disable for now
        /*
        if (newState === TradebookState.MOMENTUM) {
            Helper.speak(`${this.symbol} partial small during momentum`);
        } else if (newState === TradebookState.PULLBACK) {
            Helper.speak(`${this.symbol} check the depth of pullback`);
        } else if (newState === TradebookState.FAILED) {
            let pullbackName = this.isLong ? "bounce" : "dip";
            Helper.speak(`${this.symbol} get out on a ${pullbackName}`);
        }*/
    }

    refreshState(): void {
        if (!this.isEnabled()) {
            return;
        }
        if (this.state === TradebookState.OBSERVING) {
            this.checkForPosition();
        } else if (this.state === TradebookState.MOMENTUM) {
            this.checkForPullback();
        } else if (this.state === TradebookState.PULLBACK) {
            this.checkForPullback();
        } else if (this.state === TradebookState.FAILED) {
            this.checkForPosition();
        }
    }
    checkForPosition(): void {
        if (this.hasPositionForTradebook()) {
            this.transitionToState(TradebookState.MOMENTUM);
        } else {
            this.transitionToState(TradebookState.OBSERVING);
        }
    }
    checkForPullback(): void {
        if (!this.hasPositionForTradebook()) {
            this.transitionToState(TradebookState.OBSERVING);
        }
        let lostKeyLevel = Patterns.hasLostKeyLevel(this.symbol, this.isLong, this.getKeyLevel());
        if (lostKeyLevel) {
            this.transitionToState(TradebookState.FAILED);
            return;
        }
        let pullbackStatus = Patterns.getFirstPullbackStatus(this.symbol);
        if (pullbackStatus.status == "in progress") {
            this.transitionToState(TradebookState.PULLBACK);
        } else if (pullbackStatus.status == "recovered") {
            this.transitionToState(TradebookState.MOMENTUM);
        }
    }

}