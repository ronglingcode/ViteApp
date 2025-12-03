import { SingleKeyLevelTradebook } from './singleKeyLevelTradebook'
import type * as TradingPlansModels from '../../models/tradingPlans/tradingPlansModels'
import * as CommonRules from './commonRules'
import * as Chart from '../../ui/chart';
import * as Firestore from '../../firestore';
import * as Models from '../../models/models';
import * as EntryRulesChecker from '../../controllers/entryRulesChecker';
import * as Helper from '../../utils/helper';
import * as EntryThresholdValidator from '../../utils/entryThresholdValidator';
import * as AutoTrader from '../../algorithms/autoTrader';
import * as LiveStats from '../../ui/liveStats';
import type { TradebookState } from '../tradebookStates';
import * as TradebookUtil from '../tradebookUtil';
import * as ExitRulesCheckerNew from '../../controllers/exitRulesCheckerNew';
import * as Patterns from '../../algorithms/patterns';
import * as GlobalSettings from '../../config/globalSettings';
import * as LongDocs from '../tradebookDocs/openDriveLong';
import * as ShortDocs from '../tradebookDocs/openDriveShort';

export class OpenDrive extends SingleKeyLevelTradebook {
    public disableExitRules: boolean = false;
    public static readonly openDriveLong: string = 'openDriveLong';
    public static readonly openDriveShort: string = 'openDriveShort';
    public getID(): string {
        return this.isLong ? OpenDrive.openDriveLong : OpenDrive.openDriveShort;
    }
    constructor(symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
        levelMomentumPlan: TradingPlansModels.LevelMomentumPlan
    ) {
        let tradebookName = isLong ? 'Long Open Drive' : 'Short Open Drive';
        let buttonLabel = 'Open Drive';
        super(symbol, isLong, keyLevel, levelMomentumPlan, tradebookName, buttonLabel)
        this.init()
    }

    private init(): void {

    }

    refreshLiveStats(): void {
        if (!this.isEnabled() || !GlobalSettings.allowLiveStats) {
            Helper.updateHtmlIfChanged(this.htmlStats, '');
            return;
        }
        let hasRedToGreen = AutoTrader.hasReversalMove(this.symbol, this.isLong);
        let liveStats = this.getCommonLiveStats();
        liveStats += LiveStats.getLiveStatsForReversalMove(this.isLong, hasRedToGreen);
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
        let logTagName = this.isLong ? '_open-drive' : '_open-drive';
        let logTags = Models.generateLogTags(this.symbol, `${this.symbol}_${logTagName}`);
        let entryPrice = Chart.getBreakoutEntryPrice(this.symbol, this.isLong, useMarketOrder, parameters);
        let stopOutPrice = Chart.getStopLossPrice(this.symbol, this.isLong, true, null);
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, logTags);
        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }

        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, stopOutPrice, allowedSize, logTags);
        return allowedSize;
    }

    private validateEntry(entryPrice: number, stopOutPrice: number, logTags: Models.LogTags): number {
        let seconds = Helper.getSecondsSinceMarketOpen(new Date());
        let reduceRatio = 1;
        if (seconds < 60) {
            let hasReversal = Models.getRedToGreenState(this.symbol, this.isLong);
            if (!hasReversal) {
                hasReversal = EntryRulesChecker.conditionallyHasReversalBarSinceOpen(this.symbol, this.isLong, true, true);
            }
            if (!hasReversal) {
                Firestore.logInfo(`${this.symbol} has no reversal movement for OpenDrive`);
                reduceRatio = 0.5;
            }
        }

        const isValidThreshold = EntryThresholdValidator.validateEntryThreshold({
            symbol: this.symbol,
            isLong: this.isLong,
            entryPrice,
            keyLevel: this.keyLevel
        }, logTags);

        if (!isValidThreshold) {
            return 0;
        }

        let allowedSize = CommonRules.validateCommonEntryRules(
            this.symbol, this.isLong, entryPrice, stopOutPrice, this.keyLevel, this.levelMomentumPlan, false, true, logTags);
        return allowedSize * reduceRatio;
    }
    refreshState(): void {
        // Empty implementation - subclasses can override
    }

    transitionToState(newState: TradebookState): void {
        // Empty implementation - subclasses can override
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
        let conditionsToFail = this.isLong ? ["incremental new low"] : ["incremental new high"];
        let result: Models.TradeManagementInstructions = {
            mapData: instructions,
            conditionsToFail: conditionsToFail,
        }
        return result;
    }
    getTradeManagementInstructionsForLong(): Map<string, string[]> {
        const instructions = new Map<string, string[]>([[
            'conditions to trim', [
                '80%: break below entry signal candle (M1, M5, M15)',
                '50%: M1 new low before 9:35 AM',
                '10-30%: M5/M15 new low',
            ]], [
            'add or re-entry', [
                'reclaim of previous exit levels',
                'after vwap cross above key level, pullback to vwap holds',
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
            'conditions to trim', [
                '80%: break above entry signal candle (M1, M5, M15)',
                '50%: M1 new high before 9:35 AM',
                '10-30%: M5/M15 new high',
            ]], [
            'add or re-entry', [
                'reclaim of previous exit levels',
                'after vwap cross below key level, pullback to vwap holds',
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
        if (!Patterns.hasLevelRetest(symbol, this.isLong, this.getKeyLevel())) {
            allowedReason.reason = "not retested key level";
            allowedReason.allowed = true;
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
        if (!Patterns.hasLevelRetest(symbol, this.isLong, this.getKeyLevel())) {
            result.reason = "not retested key level";
            result.allowed = true;
            return result;
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
        if (!Patterns.hasLevelRetest(symbol, this.isLong, this.getKeyLevel())) {
            result.reason = "not retested key level";
            result.allowed = true;
            return result;
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

    getTradebookDoc(): string {
        if (this.isLong) {
            return LongDocs.tradebookText;
        } else {
            return ShortDocs.tradebookText;
        }
    }
}