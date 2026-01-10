import { BaseBreakoutTradebook } from './baseBreakoutTradebook'
import type * as TradingPlansModels from '../../models/tradingPlans/tradingPlansModels'

import * as Chart from '../../ui/chart';
import * as Firestore from '../../firestore';
import * as Models from '../../models/models';
import * as Patterns from '../../algorithms/patterns';
import * as TradebookUtil from '../tradebookUtil';
import * as TradebookUtils from '../tradebookUtil';
import * as VwapPatterns from '../../algorithms/vwapPatterns';

export class EmergingStrengthBreakout extends BaseBreakoutTradebook {
    public static readonly emergingStrengthBreakoutLong: string = 'EmergingStrengthBreakoutLong';
    public static readonly emergingWeaknessBreakdownShort: string = 'EmergingWeaknessBreakdownShort';
    public getID(): string {
        return this.isLong ? EmergingStrengthBreakout.emergingStrengthBreakoutLong : EmergingStrengthBreakout.emergingWeaknessBreakdownShort;
    }
    public updateConfig(config: TradingPlansModels.TradebooksConfig) {
        if (this.isLong) {
            if (!config.level_vwap_open.longEmergingStrengthBreakout.waitForClose) {
                this.waitForClose = false;
            }
            if (config.level_vwap_open.longEmergingStrengthBreakout.allowCloseWithin) {
                this.allowCloseWithin = true;
            }
        } else {
            if (!config.open_vwap_level.shortEmergingWeaknessBreakdown.waitForClose) {
                this.waitForClose = false;
            }
            if (config.open_vwap_level.shortEmergingWeaknessBreakdown.allowCloseWithin) {
                this.allowCloseWithin = true;
            }
        }

    }
    constructor(symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
        levelMomentumPlan: TradingPlansModels.LevelMomentumPlan) {
        let tradebookName = isLong ? 'Long Emerging Strength Breakout' : 'Short Emerging Strength Breakdown';
        let buttonLabel = 'Emerging';
        super(symbol, isLong, keyLevel, levelMomentumPlan, tradebookName, buttonLabel);
    }
    getEligibleEntryParameters(): Models.TradebookEntryParameters {
        return {
            useCurrentCandleHigh: true,
            useFirstNewHigh: false,
            useMarketOrderWithTightStop: false,
        }
    }
    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let logTagName = this.isLong ? '_emerging-strength-breakout' : '_emerging-strength-breakdown';
        let logTags = Models.generateLogTags(this.symbol, `${this.symbol}_${logTagName}`);
        let keyLevel = this.getKeyLevel();
        let { firstTestingCandle, firstTestingCandleIsClosed, firstCandleClosedBeyondLevel, firstCandleClosedBeyondLevelIndex } = Patterns.analyzeBreakoutPatterns(this.symbol, this.isLong, keyLevel);
        let entryPrice = Chart.getBreakoutEntryPrice(this.symbol, this.isLong, useMarketOrder, parameters);
        if (firstCandleClosedBeyondLevel != null) {
            // closed beyond level, check if there's a retest after this candle
            let hasRetest = false;
            let retestTouchedLevel = false;
            let deepestRetest = 0;
            let candles = Models.getCandlesFromM1SinceOpen(this.symbol);
            for (let i = firstCandleClosedBeyondLevelIndex + 1; i < candles.length; i++) {
                let c = candles[i];
                if (this.isLong) {
                    if (c.close < c.open) {
                        hasRetest = true;
                        if (c.low <= keyLevel) {
                            retestTouchedLevel = true;
                        }
                        if (deepestRetest == 0) {
                            deepestRetest = c.low;
                        } else {
                            deepestRetest = Math.min(deepestRetest, c.low);
                        }
                    }
                } else {
                    if (c.close > c.open) {
                        hasRetest = true;
                        if (c.high >= keyLevel) {
                            retestTouchedLevel = true;
                        }
                        if (deepestRetest == 0) {
                            deepestRetest = c.high;
                        } else {
                            deepestRetest = Math.max(deepestRetest, c.high);
                        }
                    }
                }
            }
            if (!hasRetest) {
                return this.triggerClosedBeyondLevelNoRetest(useMarketOrder, dryRun, parameters, logTags);
            } else {
                if (retestTouchedLevel) {
                    return this.triggerClosedBeyondLevelRetestTouchedLevel(entryPrice, deepestRetest, useMarketOrder, dryRun, parameters, logTags);
                } else {
                    return this.triggerClosedBeyondLevelRetestNoTouchedLevel(entryPrice, useMarketOrder, dryRun, parameters, logTags);
                }
            }
        }
        else {
            Firestore.logError(`${this.symbol} must wait for a candle closed beyond level`, logTags);
            return 0;
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
        let conditionsToFail = this.isLong ? ["lose level"] : ["reclaim level"];
        let result: Models.TradeManagementInstructions = {
            mapData: instructions,
            conditionsToFail: conditionsToFail,
        }
        return result;
    }
    getTradeManagementInstructionsForLong(): Map<string, string[]> {
        const instructions = new Map<string, string[]>([[
            'conditions to fail', [
                'next new low after closed a candle (M1, M5, M15) below key level',
                'break below the low of breakout candle (M1, M5, M15)',
            ]], [
            'conditions to trim', [
                'deep pullback, partial some during bounce to half way or near double top'
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
            'conditions to fail', [
                'next new high after closed a candle (M1, M5, M15) above key level',
                'break above the high of breakdown candle (M1, M5, M15)',
            ]], [
            'conditions to trim', [
                'deep pullback, partial some during pushdown to half way or near double bottom'
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

    getEntryMethods(): string[] {
        return [Models.TimeFrameEntryMethod.M1, Models.TimeFrameEntryMethod.M5, Models.TimeFrameEntryMethod.M15, Models.TimeFrameEntryMethod.M30];
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
            return;
        }
        let timeframe = Models.getTimeframeFromEntryMethod(buttonLabel);
        let failedMomentum = VwapPatterns.hasTwoConsecutiveCandlesAgainstLevel(
            this.symbol, this.isLong, this.getKeyLevel(), timeframe);
        if (failedMomentum) {
            TradebookUtils.setButtonStatus(button, "inactive");
        } else {
            TradebookUtils.setButtonStatus(button, "active");
        }
    }
} 