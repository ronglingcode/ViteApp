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

export abstract class BaseBreakoutTradebook extends SingleKeyLevelTradebook {
    public disableExitRules: boolean = false;
    constructor(symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
        levelMomentumPlan: TradingPlansModels.LevelMomentumPlan, tradebookName: string, buttonLabel: string) {
        super(symbol, isLong, keyLevel, levelMomentumPlan, tradebookName, buttonLabel);
    }
    refreshLiveStats(): void {
        if (!this.isEnabled()) {
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
    validateEntry(entryPrice: number, stopOutPrice: number, logTags: Models.LogTags): number {
        let hasClosedOutside = AutoLevelMomentum.hasClosedOutsideKeyLevel(this.symbol, this.isLong, this.keyLevel);
        if (!hasClosedOutside) {
            // not closed outside yet, try checking if there's a previous candle that tested key level
            Firestore.logError(`${this.symbol} has not closed outside key level`, logTags);
            let candles = Models.getM1ClosedCandlesSinceOpen(this.symbol);
            let candlesTestedkeyLevel: Models.CandlePlus[] = [];
            for(let i = 0; i < candles.length; i++) {
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
            let entryPriceThreshold= this.isLong ? candlesTestedkeyLevel[0].high : candlesTestedkeyLevel[0].low;
            for(let i = 1; i < candlesTestedkeyLevel.length; i++) {
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
            this.symbol, this.isLong, entryPrice, stopOutPrice, this.keyLevel, this.levelMomentumPlan, false, true, logTags);
        return allowedSize;
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