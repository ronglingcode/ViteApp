import { Tradebook } from "./baseTradebook";
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels'
import * as Firestore from '../firestore';
import * as Models from '../models/models';
import * as Chart from '../ui/chart';

import * as Helper from '../utils/helper';
import * as GlobalSettings from '../config/globalSettings';
import * as VwapPatterns from '../algorithms/vwapPatterns';
import * as TradebookUtils from './tradebookUtil';
import * as Rules from '../algorithms/rules';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';

export class VwapScalp extends Tradebook {
    public static readonly vwapScalpLong: string = 'VwapScalpLong';
    public static readonly vwapScalpShort: string = 'VwapScalpShort';
    private vwapScalpPlan: TradingPlansModels.VwapScalpPlan;
    private maxEntry: number = 0;
    public getID(): string {
        return this.buildID(this.isLong ? VwapScalp.vwapScalpLong : VwapScalp.vwapScalpShort);
    }
    constructor(familyName: string, symbol: string, isLong: boolean, vwapScalpPlan: TradingPlansModels.VwapScalpPlan) {
        let tradebookName = isLong ? 'Long VWAP Scalp' : 'Short VWAP Scalp';
        let buttonLabel = isLong ? 'VWAP Scalp' : 'VWAP Scalp';
        super(familyName, symbol, isLong, tradebookName, buttonLabel);
        this.vwapScalpPlan = vwapScalpPlan;
        this.enableByDefault = false;
        this.maxEntry = 0;
    }


    refreshLiveStats(): void {
        //TODO
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let isLong = this.isLong;
        let logTagName = this.isLong ? '_long_vwap_scalp' : '_short_vwap_scalp';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);
        let entryMethod = parameters.entryMethod;
        if (!entryMethod) {
            Firestore.logError(`entry method is missing`, logTags);
            return 0;
        }
        let timeframe = Models.getTimeframeFromEntryMethod(entryMethod);
        let hasTwoCandlesAgainstVwap = VwapPatterns.hasTwoConsecutiveCandlesAgainstVwap(this.symbol, this.isLong, timeframe);
        if (hasTwoCandlesAgainstVwap) {
            Firestore.logError(`has two candles against vwap for M${timeframe}, giving up`, logTags);
            return 0;
        }

        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let stopOutPrice = Chart.getStopLossPrice(symbol, isLong, true, null);
        let riskLevelPrice = Models.chooseRiskLevel(symbol, isLong, entryPrice, stopOutPrice, TradingPlans.getAnalysisDefaultRiskLevels(this.symbol));
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, useMarketOrder, timeframe, logTags);
        if (allowedSize === 0) {
            Firestore.logError(`not allowed entry`, logTags);
            return 0;
        }

        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, logTags);
        return allowedSize;
    }

    validateEntry(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, timeframe: number, logTags: Models.LogTags): number {
        if (this.vwapScalpPlan.strongReasonToUseThisLevel.length == 0) {
            Firestore.logError(`${this.symbol} not allowed entry because of missing strong reason to use this level`, logTags);
            return 0;
        }
        let symbolData = Models.getSymbolData(this.symbol);

        // Check if price has touched VWAP
        let currentVwap = Models.getCurrentVwap(this.symbol);
        if (this.isLong) {
            if (symbolData.lowOfDay > currentVwap) {
                // Just a warning, not going to block the trade
                // because sometimes vwap will move until the candle is closed
                Firestore.logError(`not touch vwap yet: ${currentVwap}`, logTags);
            }
        } else {
            if (symbolData.highOfDay < currentVwap) {
                Firestore.logError(`not touch vwap yet: ${currentVwap}`, logTags);
            }
        }

        if (GlobalSettings.checkMaxEntryThreshold) {
            if (this.maxEntry > 0) {
                if (this.isLong) {
                    if (entryPrice > this.maxEntry) {
                        Firestore.logError(`entry price ${entryPrice} is greater than max entry ${this.maxEntry}`, logTags);
                        return 0;
                    }
                } else {
                    if (entryPrice < this.maxEntry) {
                        Firestore.logError(`entry price ${entryPrice} is less than max entry ${this.maxEntry}`, logTags);
                        return 0;
                    }
                }
            }
        }

        let threshold = this.vwapScalpPlan.threshold;
        if (this.isLong && entryPrice < threshold) {
            Firestore.logError(`entry price ${entryPrice} is less than threshold ${threshold}`, logTags);
            return 0;
        } else if (!this.isLong && entryPrice > threshold) {
            Firestore.logError(`entry price ${entryPrice} is greater than threshold ${threshold}`, logTags);
            return 0;
        }

        if (!Rules.isTimingAndEntryAllowedForHigherTimeframe(this.symbol, entryPrice, this.isLong, timeframe, logTags)) {
            return 0;
        }

        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            this.symbol, this.isLong, entryPrice, stopOutPrice, useMarketOrder,
            this.vwapScalpPlan, false, logTags);
        return allowedSize;
    }

    submitEntryOrders(dryRun: boolean, useMarketOrder: boolean,
        entryPrice: number, stopOutPrice: number, riskLevelPrice: number, allowedSize: number, logTags: Models.LogTags): void {
        let planCopy = JSON.parse(JSON.stringify(this.vwapScalpPlan)) as TradingPlansModels.VwapScalpPlan;
        this.submitEntryOrdersBase(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, planCopy, logTags);
    }

    getEligibleEntryParameters(): Models.TradebookEntryParameters {
        return {
            useCurrentCandleHigh: true,
            useFirstNewHigh: true,
            useMarketOrderWithTightStop: false,
        }
    }

    isEnabled(): boolean {
        return true; // TODO: Implement enable/disable logic
    }

    getCommonLiveStats(): string {
        return ''; // TODO: Implement common live stats
    }

    /** Minimal doc method for now — returns empty string. */
    getTradebookDoc(): string {
        return "";
    }

    onNewTimeSalesData(): void {
        // do nothing
        let candles = Models.getCandlesFromM1SinceOpen(this.symbol);
        if (candles.length == 0) {
            return;
        }
        if (candles.length >= 2) {
            if (this.maxEntry > 0) {
                this.maxEntry = 0;
                Chart.clearMaxEntry(this.symbol);
            }
            return;
        }
        let openPrice = candles[0].open;
        if (this.isLong && openPrice >= this.vwapScalpPlan.originalKeyLevel) {
            // opened above the key level, no max entry needed for long
            return;
        }
        if (!this.isLong && openPrice <= this.vwapScalpPlan.originalKeyLevel) {
            // opened below the key level, no max entry needed for short
            return;
        }
        let lastCandle = candles[candles.length - 1];
        let symbolData = Models.getSymbolData(this.symbol);
        let risk = symbolData.highOfDay - symbolData.lowOfDay + 0.01;
        if (this.isLong && lastCandle.close <= lastCandle.open) {
            let newMaxEntry = symbolData.highOfDay + 0.3 * risk;
            newMaxEntry = Helper.roundPrice(this.symbol, newMaxEntry);
            this.updateMaxEntryThreshold(newMaxEntry);
        } else if (!this.isLong && lastCandle.close >= lastCandle.open) {
            let newMaxEntry = symbolData.lowOfDay - 0.3 * risk;
            newMaxEntry = Helper.roundPrice(this.symbol, newMaxEntry);
            this.updateMaxEntryThreshold(newMaxEntry);
        }
    }
    updateMaxEntryThreshold(newValue: number): void {
        if (!GlobalSettings.checkMaxEntryThreshold) {
            return;
        }
        if (this.maxEntry == 0) {
            this.maxEntry = newValue;
            Chart.drawMaxEntry(this.symbol, this.maxEntry);
            return;
        }
        if (this.isLong && newValue > this.maxEntry) {
            this.maxEntry = Math.max(this.maxEntry, newValue);
            Chart.drawMaxEntry(this.symbol, this.maxEntry);
        } else if (!this.isLong && newValue < this.maxEntry) {
            this.maxEntry = Math.min(this.maxEntry, newValue);
            Chart.drawMaxEntry(this.symbol, this.maxEntry);
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
        let timeframe = 1;
        if (buttonLabel == Models.TimeFrameEntryMethod.M5) {
            timeframe = 5;
        } else if (buttonLabel == Models.TimeFrameEntryMethod.M15) {
            timeframe = 15;
        } else if (buttonLabel == Models.TimeFrameEntryMethod.M30) {
            timeframe = 30;
        }
        let lostMomentum = VwapPatterns.hasTwoConsecutiveCandlesAgainstVwap(this.symbol, this.isLong, timeframe);
        if (lostMomentum) {
            TradebookUtils.setButtonStatus(button, "inactive");
        } else {
            TradebookUtils.setButtonStatus(button, "active");
        }
    }
}