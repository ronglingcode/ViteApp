import { BaseBreakoutTradebook } from './baseBreakoutTradebook'
import type * as TradingPlansModels from '../../models/tradingPlans/tradingPlansModels'
import * as Chart from '../../ui/chart';
import * as Models from '../../models/models';
import * as Helper from '../../utils/helper';
import * as Patterns from '../../algorithms/patterns';
import * as Firestore from '../../firestore';
import * as OrderFlow from '../../controllers/orderFlow';
import * as LongDocs from '../tradebookDocs/aboveWaterBreakout';
import * as ShortDocs from '../tradebookDocs/belowWaterBreakdown';
import * as TradebookUtils from '../tradebookUtil';
import * as VwapPatterns from '../../algorithms/vwapPatterns';

import { TradebookID } from '../tradebookIds';

export class AboveWaterBreakout extends BaseBreakoutTradebook {
    public getID(): string {
        return this.buildID(this.isLong ? TradebookID.AboveWaterBreakout : TradebookID.BelowWaterBreakdown);
    }

    public updateConfig(config: TradingPlansModels.TradebooksConfig) {
        if (this.isLong) {
            if (!config.level_open_vwap.longAboveWaterBreakout.waitForClose) {
                this.waitForClose = false;
            }
            if (config.level_open_vwap.longAboveWaterBreakout.allowCloseWithin) {
                this.allowCloseWithin = true;
            }
        } else {
            if (!config.vwap_open_level.shortBelowWaterBreakout.waitForClose) {
                this.waitForClose = false;
            }
            if (config.vwap_open_level.shortBelowWaterBreakout.allowCloseWithin) {
                this.allowCloseWithin = true;
            }
        }

    }
    constructor(symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
        levelMomentumPlan: TradingPlansModels.LevelMomentumPlan) {
        let tradebookName = isLong ? 'Long Above Water Breakout' : 'Short Below Water Breakdown';
        let buttonLabel = isLong ? 'Abv Wtr' : 'Blw Wtr';
        super(symbol, isLong, keyLevel, levelMomentumPlan, tradebookName, buttonLabel);
    }

    getEligibleEntryParameters(): Models.TradebookEntryParameters {
        return {
            useCurrentCandleHigh: true,
            useFirstNewHigh: false,
            useMarketOrderWithTightStop: true,
        }
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let logTagName = this.isLong ? '_above-water-breakout' : '_below-water-breakdown';
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
        if (firstTestingCandle != null && firstTestingCandleIsClosed) {
            if ((this.isLong && entryPrice < firstTestingCandle.high) || (!this.isLong && entryPrice > firstTestingCandle.low)) {
                return this.triggerClosedWithinLevelReclaimLevel(entryPrice, useMarketOrder, dryRun, parameters, logTags);
            } else {
                return this.triggerClosedWithinLevelNewHigh(entryPrice, firstTestingCandle, useMarketOrder, dryRun, parameters, logTags);
            }
        }
        if (firstTestingCandle != null) {
            return this.triggerNoCloseBullFlagBeyondLevel(useMarketOrder, dryRun, parameters, logTags);
        } else {
            return this.triggerNoCloseBearFlagWithinLevel(useMarketOrder, dryRun, parameters, logTags);
        }
    }

    getTradebookDoc(): string {
        if (this.isLong) {
            return LongDocs.tradebookText;
        } else {
            return ShortDocs.tradebookText;
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