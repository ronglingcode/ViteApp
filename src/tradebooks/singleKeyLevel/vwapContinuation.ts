import { SingleKeyLevelTradebook } from './singleKeyLevelTradebook'
import type * as TradingPlansModels from '../../models/tradingPlans/tradingPlansModels'
import * as CommonRules from './commonRules'
import * as Chart from '../../ui/chart';
import * as Firestore from '../../firestore';
import * as AutoLevelMomentum from '../../algorithms/autoLevelMomentum';
import * as Models from '../../models/models';
import * as Atr from '../../models/atr';
import * as EntryThresholdValidator from '../../utils/entryThresholdValidator';
import * as Helper from '../../utils/helper';
import * as Patterns from '../../algorithms/patterns';
import * as AutoTrader from '../../algorithms/autoTrader';
import * as LiveStats from '../../ui/liveStats';
import { TradebookState } from '../tradebookStates';
import * as TradebooksManager from '../tradebooksManager';
import * as TradebookUtil from '../tradebookUtil';
import * as ExitRulesCheckerNew from '../../controllers/exitRulesCheckerNew';
import * as GlobalSettings from '../../config/globalSettings';
import * as LongDocs from '../tradebookDocs/vwapContinuationLong';
import * as ShortDocs from '../tradebookDocs/vwapContinuationShort';
import * as VwapPatterns from '../../algorithms/vwapPatterns';
import * as TradebookUtils from '../tradebookUtil';
import * as Rules from '../../algorithms/rules';

export class VwapContinuation extends SingleKeyLevelTradebook {
    public disableExitRules: boolean = false;
    public static readonly vwapContinuationLong: string = 'VwapContinuationLong';
    public static readonly vwapContinuationShort: string = 'VwapContinuationShort';
    private highOfDayToBreakout: number = 0;
    public getID(): string {
        return this.isLong ? VwapContinuation.vwapContinuationLong : VwapContinuation.vwapContinuationShort;
    }
    constructor(symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
        levelMomentumPlan: TradingPlansModels.LevelMomentumPlan) {
        let tradebookName = isLong ? 'Long VWAP Continuation' : 'Short VWAP Continuation';
        let buttonLabel = isLong ? 'VWAP Cont' : 'VWAP Cont';
        super(symbol, isLong, keyLevel, levelMomentumPlan, tradebookName, buttonLabel)
        this.init()
    }

    private init(): void {

    }

    /**
     * reversal near vwap, min distance to vwap
     */
    refreshLiveStats(): void {
        if (!this.isEnabled() || !GlobalSettings.allowLiveStats) {
            Helper.updateHtmlIfChanged(this.htmlStats, '');
            return;
        }
        let symbol = this.symbol;
        let isLong = this.isLong;
        let candles = Models.getUndefinedCandlesSinceOpen(symbol);
        let vwaps = Models.getVwapsSinceOpen(symbol);
        if (candles.length == 0) {
            let currentPrice = Models.getCurrentPrice(symbol);
            let currentVwap = Models.getCurrentVwap(symbol);
            let currentDistanceToVwap = Patterns.getDirectionalDistanceToVwap(isLong, currentPrice, currentVwap);
            let currentDistanceToVwapText = Atr.getAtrPercentageString(symbol, currentDistanceToVwap);
            Helper.updateHtmlIfChanged(this.htmlStats, `dis2vwap: ${currentDistanceToVwapText}`);
            return;
        }

        let minDistanceToVwap = Patterns.getMinimumDistanceToVwap(isLong, candles[0], vwaps[0].value);
        for (let i = 1; i < candles.length; i++) {
            let d = Patterns.getMinimumDistanceToVwap(isLong, candles[i], vwaps[i].value);
            minDistanceToVwap = Math.min(minDistanceToVwap, d);
        }
        let minDistanceToVwapText = Atr.getAtrPercentageString(symbol, minDistanceToVwap);
        let hasRedToGreen = AutoTrader.hasReversalMove(this.symbol, this.isLong);
        let hasRedToGreenText = LiveStats.getLiveStatsForReversalMove(this.isLong, hasRedToGreen);
        let liveStats = this.getCommonLiveStats();
        liveStats += `min dis2vwap: ${minDistanceToVwapText}, ${hasRedToGreenText}`;
        Helper.updateHtmlIfChanged(this.htmlStats, liveStats);
    }


    getEligibleEntryParameters(): Models.TradebookEntryParameters {
        return {
            useCurrentCandleHigh: true,
            useFirstNewHigh: true,
            useMarketOrderWithTightStop: false,
        }
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let logTagName = this.isLong ? '_vwap-continuation' : '_vwap-continuation';
        let logTags = Models.generateLogTags(this.symbol, `${this.symbol}_${logTagName}`);
        let entryMethod = parameters.entryMethod;
        if (!entryMethod) {
            Firestore.logError(`${this.symbol} entry method is missing`, logTags);
            return 0;
        }
        let timeframe = Models.getTimeframeFromEntryMethod(entryMethod);
        let hasTwoCandlesAgainstVwap = VwapPatterns.hasTwoConsecutiveCandlesAgainstVwap(this.symbol, this.isLong, timeframe);
        let multiplier = 1;
        if (hasTwoCandlesAgainstVwap) {
            Firestore.logError(`${this.symbol} has two candles against vwap for M${timeframe}, use half size. Add after close back above vwap`, logTags);
            multiplier = 0.5;
        }
        let entryPrice = Chart.getBreakoutEntryPrice(this.symbol, this.isLong, useMarketOrder, parameters);
        let stopOutPrice = Chart.getStopLossPrice(this.symbol, this.isLong, true, null);
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, useMarketOrder, timeframe, logTags);
        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }
        allowedSize = allowedSize * multiplier;
        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, stopOutPrice, allowedSize, "", logTags);
        return allowedSize;
    }

    private validateEntry(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean,
        timeframe: number, logTags: Models.LogTags): number {
        // check whether vwap moved to the other side of the key level
        let currentVwap = Models.getCurrentVwap(this.symbol);
        let keyLevel = this.getKeyLevel();
        let isChangedToAboveWaterBreakout = (this.isLong && currentVwap < keyLevel) || (!this.isLong && currentVwap > keyLevel);
        if (isChangedToAboveWaterBreakout) {
            if (this.isLong) {
                if (entryPrice < keyLevel) {
                    Firestore.logError(`${this.symbol} not valid entry price as new above water breakout`);
                    return 0;
                }
            } else {
                if (entryPrice > keyLevel) {
                    Firestore.logError(`${this.symbol} not valid entry price as new below water breakdown`);
                    return 0;
                }
            }
        } else {
            const isValidThreshold = EntryThresholdValidator.validateEntryThreshold({
                symbol: this.symbol,
                isLong: this.isLong,
                entryPrice,
                keyLevel: this.keyLevel
            }, logTags);
            if (!isValidThreshold) {
                Firestore.logError(`${this.symbol} not valid threshold`);
                return 0;
            }
        }
        if (!Rules.isTimingAndEntryAllowedForHigherTimeframe(this.symbol, entryPrice, this.isLong, timeframe, logTags)) {
            return 0;
        }

        let allowedSize = CommonRules.validateCommonEntryRules(
            this.symbol, this.isLong, entryPrice, stopOutPrice, useMarketOrder, this.keyLevel, this.levelMomentumPlan, false, true, logTags);
        return allowedSize;
    }

    refreshState(): void {
        if (!this.isEnabled()) {
            return;
        }
        if (this.state === TradebookState.OBSERVING) {
            this.checkForPosition();
        } else if (this.state === TradebookState.MOMENTUM) {
            this.checkDuringMomentum();
        } else if (this.state === TradebookState.PULLBACK) {
            this.checkDuringPullback();
        } else if (this.state === TradebookState.FAILED) {
            this.checkForPosition();
        }
    }

    transitionToState(newState: TradebookState): void {
        if (this.state === newState) {
            return;
        }
        this.state = newState;
        let symbolData = Models.getSymbolData(this.symbol);
        if (newState === TradebookState.MOMENTUM) {
            Helper.speak(`partial small during momentum`);
        } else if (newState === TradebookState.PULLBACK) {
            this.highOfDayToBreakout = this.isLong ? symbolData.highOfDay : symbolData.lowOfDay;
            Helper.speak(`check the depth of pullback`);
        } else if (newState === TradebookState.FAILED) {
            Helper.speak(`consider exiting`);
        }
    }
    checkForPosition(): void {
        if (this.hasPositionForTradebook()) {
            this.transitionToState(TradebookState.MOMENTUM);
        } else {
            this.transitionToState(TradebookState.OBSERVING);
        }
    }
    checkDuringMomentum(): void {
        let candles = Models.getUndefinedCandlesSinceOpen(this.symbol);
        if (candles.length < 2) {
            return;
        }
        let currentCandle = candles[candles.length - 1];
        let previousCandle = candles[candles.length - 2];
        if ((this.isLong && currentCandle.low < previousCandle.low) || (!this.isLong && currentCandle.high > previousCandle.high)) {
            this.transitionToState(TradebookState.PULLBACK);
        }
    }
    checkDuringPullback(): void {
        let lostKeyLevel = Patterns.hasLostKeyLevel(this.symbol, this.isLong, this.getKeyLevel());
        if (lostKeyLevel) {
            this.transitionToState(TradebookState.FAILED);
            return;
        }
        let symbolData = Models.getSymbolData(this.symbol);
        if ((this.isLong && symbolData.highOfDay > this.highOfDayToBreakout) || (!this.isLong && symbolData.lowOfDay < this.highOfDayToBreakout)) {
            this.transitionToState(TradebookState.MOMENTUM);
            return;
        }
        let currentVwap = Models.getCurrentVwap(this.symbol);
        let candles = Models.getM1ClosedCandlesSinceOpen(this.symbol);
        let lastClosedCandle = candles[candles.length - 1];
        let closePrice = lastClosedCandle.close;
        if ((this.isLong && closePrice < currentVwap) || (!this.isLong && closePrice > currentVwap)) {
            this.transitionToState(TradebookState.FAILED);
            return;
        }
    }
    getTradeManagementInstructions(): Models.TradeManagementInstructions {
        let instructions = new Map<string, string[]>();
        if (this.isLong) {
            instructions = this.getTradeManagementInstructionsForLong();
        } else {
            instructions = this.getTradeManagementInstructionsForShort();
        }
        TradebookUtil.setlevelToAddInstructions(this.symbol, this.isLong, instructions);
        TradebookUtil.setFinalTargetInstructions(this.symbol, this.isLong, instructions);
        let conditionsToFail = this.isLong ? ["lose vwap"] : ["reclaim vwap"];
        let result: Models.TradeManagementInstructions = {
            mapData: instructions,
            conditionsToFail: conditionsToFail,
        }
        return result;
    }

    getTradeManagementInstructionsForLong(): Map<string, string[]> {
        const instructions = new Map<string, string[]>([[
            "check after entry", [
                "make sure it didn't stay below vwap for too long",
                "mark the most recent retest dip to vwap"
            ]], [
            'conditions to fail', [
                "lose vwap: a new candle (M1, M5, M15) close below vwap",
                "lose vwap: dip to vwap and bounced, get below the bounce low"
            ]], [
            'conditions to trim', [
                "50%: rejection near the next level above, break below the entry candle",
                "50%: M1 new low before 9:35 AM",
                "10-30%: M5/M15 new low",
                "deep pullback, partial some during bounce to half way or near double top"
            ]], [
            'add or re-entry', [
                "reclaim of previous exit levels",
                "another retest of vwap holds",
            ]], [
            'partial targets', [
                "10-30%: 1 minute push, 1st leg up",
                "30-60%: 5 minute push, 2nd leg up",
                "60-90%: 15 minute push, 3rd leg up, 1+ ATR",
            ]]
        ]);
        return instructions;
    }

    getTradeManagementInstructionsForShort(): Map<string, string[]> {
        const instructions = new Map<string, string[]>([[
            "check after entry", [
                "make sure it didn't stay above vwap for too long",
                "mark the most recent retest pop to vwap"
            ]], [
            'conditions to fail', [
                "reclaim vwap: a new candle (M1, M5, M15) close above vwap",
                "reclaim vwap: pop to vwap and rejected, get above the rejection high"
            ]], [
            'conditions to trim', [
                "50%: hold near the next level below, break above the entry candle",
                "50%: M1 new high before 9:35 AM",
                "10-30%: M5/M15 new low",
                "deep pullback, partial some during pushdown to half way or near double bottom"
            ]], [
            'add or re-entry', [
                "lost of previous exit levels",
                "another retest of vwap holds",
            ]], [
            'partial targets', [
                "10-30%: 1 minute drop, 1st leg down",
                "30-60%: 5 minute drop, 2nd leg down",
                "60-90%: 15 minute drop, 3rd leg down, 1+ ATR",
            ]]
        ]);
        return instructions;
    }

    getTightStopLevels(): Models.DisplayLevel[] {
        let tightStopLevels = TradebookUtil.getTightStopLevelsForTrend(this.symbol, this.isLong);
        return tightStopLevels;
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
        if (VwapPatterns.isNearAlignWithVwap(symbol, this.isLong, newPrice)) {
            allowedReason.allowed = false;
            if (this.isLong) {
                allowedReason.reason = "near above vwap";
            } else {
                allowedReason.reason = "near below vwap";
            }
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

        if (VwapPatterns.isNearAlignWithVwap(symbol, this.isLong, newPrice)) {
            result.allowed = false;
            if (this.isLong) {
                result.reason = "near above vwap";
            } else {
                result.reason = "near below vwap";
            }
            return result;
        }
        return result;
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
        if (VwapPatterns.isNearAlignWithVwap(symbol, this.isLong, currentPrice)) {
            result.allowed = false;
            if (this.isLong) {
                result.reason = "near above vwap";
            } else {
                result.reason = "near below vwap";
            }
            return result;
        }


        return result;
    }

    getTradebookDoc(): string {
        if (this.isLong) {
            return LongDocs.tradebookText;
        } else {
            return ShortDocs.tradebookText;
        }
    }

    getEntryMethods(): string[] {
        return [
            Models.TimeFrameEntryMethod.M1,
            Models.TimeFrameEntryMethod.M5,
            Models.TimeFrameEntryMethod.M15,
            Models.TimeFrameEntryMethod.M30,
        ];
    }
    onNewCandleClose(): void {
        this.updateEntryMethodButtonStatus(Models.TimeFrameEntryMethod.M1);
        this.updateEntryMethodButtonStatus(Models.TimeFrameEntryMethod.M5);
        this.updateEntryMethodButtonStatus(Models.TimeFrameEntryMethod.M15);
        this.updateEntryMethodButtonStatus(Models.TimeFrameEntryMethod.M30);
    }
    updateEntryMethodButtonStatus(buttonLabel: string): void {
        let button = this.getButtonForLabel(buttonLabel);
        if (!button) {
            Firestore.logError(`${this.symbol} button not found for ${buttonLabel}`);
            return;
        }
        let timeframe = Models.getTimeframeFromEntryMethod(buttonLabel);
        let lostMomentum = VwapPatterns.hasTwoConsecutiveCandlesAgainstVwap(this.symbol, this.isLong, timeframe);
        if (lostMomentum) {
            TradebookUtils.setButtonStatus(button, "inactive");
        } else {
            TradebookUtils.setButtonStatus(button, "active");
        }
    }

    getDisallowedReasonToFlatten(symbol: string, logTags: Models.LogTags, exitPrice: number): Models.CheckRulesResult {
        let result: Models.CheckRulesResult = {
            allowed: true,
            reason: "defaultallowed",
        };
        if (VwapPatterns.isNearAlignWithVwap(symbol, this.isLong, exitPrice)) {
            result.allowed = false;
            if (this.isLong) {
                result.reason = "near above vwap";
            } else {
                result.reason = "near below vwap";
            }
            return result;
        }
        return result;
    }
    getDisallowedReasonToAdjustAllExitPairs(symbol: string, logTags: Models.LogTags, newPrice: number): Models.CheckRulesResult {
        let result: Models.CheckRulesResult = {
            allowed: true,
            reason: "default allowed",
        };
        if (VwapPatterns.isNearAlignWithVwap(symbol, this.isLong, newPrice)) {
            result.allowed = false;
            if (this.isLong) {
                result.reason = "near above vwap";
            } else {
                result.reason = "near below vwap";
            }
            return result;
        }
        return result;
    }
} 