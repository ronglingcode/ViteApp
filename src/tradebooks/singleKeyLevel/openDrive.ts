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

export class OpenDrive extends SingleKeyLevelTradebook {
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
        if (!this.isEnabled()) {
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
}