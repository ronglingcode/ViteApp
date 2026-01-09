import { Tradebook } from "./baseTradebook";
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels'
import * as Firestore from '../firestore';
import * as Models from '../models/models';
import * as Chart from '../ui/chart';
import * as TradebookUtil from './tradebookUtil';
import * as Helper from '../utils/helper';
import * as GlobalSettings from '../config/globalSettings';
import * as VwapPatterns from '../algorithms/vwapPatterns';
import * as TradebookUtils from './utils';

export class VwapScalp extends Tradebook {
    public static readonly vwapScalpLong: string = 'VwapScalpLong';
    public static readonly vwapScalpShort: string = 'VwapScalpShort';
    private vwapScalpPlan: TradingPlansModels.VwapScalpPlan;
    private maxEntry: number = 0;
    public getID(): string {
        return this.isLong ? VwapScalp.vwapScalpLong : VwapScalp.vwapScalpShort;
    }
    constructor(symbol: string, isLong: boolean, vwapScalpPlan: TradingPlansModels.VwapScalpPlan) {
        let tradebookName = isLong ? 'Long VWAP Scalp' : 'Short VWAP Scalp';
        let buttonLabel = isLong ? 'VWAP Scalp' : 'VWAP Scalp';
        super(symbol, isLong, tradebookName, buttonLabel);
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
            Firestore.logError(`${this.symbol} entry method is missing`, logTags);
            return 0;
        }
        let timeframe = Models.getTimeframeFromEntryMethod(entryMethod);
        let hasTwoCandlesAgainstVwap = VwapPatterns.hasTwoConsecutiveCandlesAgainstVwap(this.symbol, this.isLong, timeframe);
        if (hasTwoCandlesAgainstVwap) {
            Firestore.logError(`${this.symbol} has two candles against vwap for M${timeframe}, giving up`, logTags);
            return 0;
        }
        
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let stopOutPrice = Chart.getStopLossPrice(symbol, isLong, true, null);
        let riskLevelPrice = Models.getRiskLevelPrice(symbol, stopOutPrice);
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, logTags);
        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }

        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, logTags);
        return allowedSize;
    }

    validateEntry(entryPrice: number, stopOutPrice: number, logTags: Models.LogTags): number {
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



        // TODO: check global rules
        return 0.21;
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

    refreshState(): void {
        // TODO: Implement state refresh logic
    }

    transitionToState(newState: any): void {
        // TODO: Implement state transition logic
    }

    isEnabled(): boolean {
        return true; // TODO: Implement enable/disable logic
    }

    getCommonLiveStats(): string {
        return ''; // TODO: Implement common live stats
    }

    getTightStopLevels(): Models.DisplayLevel[] {
        let tightStopLevels = TradebookUtil.getTightStopLevelsForTrend(this.symbol, this.isLong);
        return tightStopLevels;
    }

    /** Minimal doc method for now — returns empty string. */
    getTradebookDoc(): string {
        return "";
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
            'conditions to fail', [
                'lose vwap, low of day breakdown',
            ]], [
            'conditions to trim', [
                'first new low on M1, M5, M15',
            ]], [
            'add or re-entry', [
                'none, just scalp',
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
                'reclaim of vwap, high of day breakout',
            ]], [
            'conditions to trim', [
                'first new high on M1, M5, M15',
            ]], [
            'add or re-entry', [
                'none, just scalp',
            ]], [
            'partial targets', [
                "10-30%: 1 minute drop, 1st leg down",
                "30-60%: 5 minute drop, 2nd leg down",
                "60-90%: 15 minute drop, 3rd leg down, 1+ ATR",
            ]]
        ]);
        return instructions;
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