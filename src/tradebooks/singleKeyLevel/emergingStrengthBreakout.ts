import { BaseBreakoutTradebook } from './baseBreakoutTradebook'
import type * as TradingPlansModels from '../../models/tradingPlans/tradingPlansModels'

import * as Chart from '../../ui/chart';
import * as Firestore from '../../firestore';
import * as Models from '../../models/models';
import * as Patterns from '../../algorithms/patterns';
import * as TradebookUtils from '../tradebookUtil';
import * as VwapPatterns from '../../algorithms/vwapPatterns';

import { TradebookID } from '../tradebookIds';

export class EmergingStrengthBreakout extends BaseBreakoutTradebook {
    public getID(): string {
        return this.buildID(this.isLong ? TradebookID.EmergingStrengthBreakoutLong : TradebookID.EmergingWeaknessBreakdownShort);
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
        if (!parameters.entryMethod) {
            Firestore.logError(`entryMethod is not set`, logTags);
            return 0;
        }
        let timeframe = Models.getTimeframeFromEntryMethod(parameters.entryMethod);
        let hasFailedMomentum = VwapPatterns.hasTwoConsecutiveCandlesAgainstLevelAfterCloseAbove(
            this.symbol, this.isLong, keyLevel, timeframe);
        if (hasFailedMomentum) {
            Firestore.logError(`closed 2 candles below level on M${timeframe}`, logTags);
            return 0;
        }
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
        let failedMomentum = VwapPatterns.hasTwoConsecutiveCandlesAgainstLevelAfterCloseAbove(
            this.symbol, this.isLong, this.getKeyLevel(), timeframe);
        if (failedMomentum) {
            TradebookUtils.setButtonStatus(button, "inactive");
        } else {
            TradebookUtils.setButtonStatus(button, "active");
        }
    }
} 