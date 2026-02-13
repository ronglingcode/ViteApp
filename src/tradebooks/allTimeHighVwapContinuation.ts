import { Tradebook } from "./baseTradebook";
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels'
import * as Firestore from '../firestore';
import * as Models from '../models/models';
import * as Chart from '../ui/chart';
import * as TradebookUtil from './tradebookUtil';
import * as Helper from '../utils/helper';
import * as VwapPatterns from '../algorithms/vwapPatterns';
import * as TradebookUtils from './tradebookUtil';
import * as Rules from '../algorithms/rules';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';

export class AllTimeHighVwapContinuation extends Tradebook {
    public static readonly allTimeHighVwapContinuationLong: string = 'ATHVwapCont';
    private allTimeHighVwapContinuationPlan: TradingPlansModels.AllTimeHighVwapContinuationPlan;

    public getID(): string {
        return AllTimeHighVwapContinuation.allTimeHighVwapContinuationLong;
    }

    constructor(symbol: string, isLong: boolean, plan: TradingPlansModels.AllTimeHighVwapContinuationPlan) {
        // This tradebook only supports long positions
        if (!isLong) {
            throw new Error('AllTimeHighVwapContinuation tradebook only supports long positions');
        }
        let tradebookName = 'ATH VWAP Cont';
        let buttonLabel = 'ATH VWAP Cont';
        super(symbol, true, tradebookName, buttonLabel);
        this.allTimeHighVwapContinuationPlan = plan;
        this.enableByDefault = false;
    }

    refreshLiveStats(): void {
        // TODO: Implement live stats refresh
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let isLong = true; // This tradebook only supports long
        let logTagName = '_long_all_time_high_vwap_continuation';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);
        let entryMethod = parameters.entryMethod;
        if (!entryMethod) {
            Firestore.logError(`entry method is missing`, logTags);
            return 0;
        }
        let timeframe = Models.getTimeframeFromEntryMethod(entryMethod);
        let hasTwoCandlesAgainstVwap = VwapPatterns.hasTwoConsecutiveCandlesAgainstVwap(this.symbol, isLong, timeframe);
        if (hasTwoCandlesAgainstVwap) {
            Firestore.logError(`has two candles against vwap for M${timeframe}, giving up`, logTags);
            return 0;
        }
        let hasTwoCandlesAgainstLevel = VwapPatterns.hasTwoConsecutiveCandlesAgainstLevel(this.symbol, isLong, this.allTimeHighVwapContinuationPlan.allTimeHigh, timeframe);
        if (hasTwoCandlesAgainstLevel) {
            Firestore.logError(`has two candles against all-time high for M${timeframe}, giving up`, logTags);
            return 0;
        }

        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let stopOutPrice = Chart.getStopLossPrice(symbol, isLong, true, null);
        let riskLevelPrice = Models.chooseRiskLevel(symbol, isLong, entryPrice, stopOutPrice, this.allTimeHighVwapContinuationPlan.defaultRiskLevels);
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, useMarketOrder, timeframe, logTags);
        if (allowedSize === 0) {
            Firestore.logError(`not allowed entry`, logTags);
            return 0;
        }

        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, logTags);
        return allowedSize;
    }

    validateEntry(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, timeframe: number, logTags: Models.LogTags): number {
        let symbolData = Models.getSymbolData(this.symbol);
        let allTimeHigh = this.allTimeHighVwapContinuationPlan.allTimeHigh;
        let currentVwap = Models.getCurrentVwap(this.symbol);

        // Entry must be above both VWAP and all-time high
        if (entryPrice <= currentVwap) {
            Firestore.logError(`entry price ${entryPrice} must be above VWAP ${currentVwap}`, logTags);
            return 0;
        }

        if (entryPrice <= allTimeHigh) {
            Firestore.logError(`entry price ${entryPrice} must be above all-time high ${allTimeHigh}`, logTags);
            return 0;
        }

        // Check if price has touched VWAP
        if (symbolData.lowOfDay > currentVwap) {
            // Just a warning, not going to block the trade
            // because sometimes vwap will move until the candle is closed
            // Firestore.logError(`not touch vwap yet: ${currentVwap}`, logTags);
        }

        // Check if price has broken above all-time high
        if (symbolData.highOfDay <= allTimeHigh) {
            Firestore.logError(`price has not broken above all-time high ${allTimeHigh}, current high: ${symbolData.highOfDay}`, logTags);
            //return 0;
        }

        if (!Rules.isTimingAndEntryAllowedForHigherTimeframe(this.symbol, entryPrice, true, timeframe, logTags)) {
            Firestore.logError(`not timing and entry allowed for higher timeframe`, logTags);
            return 0;
        }

        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            this.symbol, true, entryPrice, stopOutPrice, useMarketOrder,
            this.allTimeHighVwapContinuationPlan, false, logTags);
        return allowedSize;
    }

    submitEntryOrders(dryRun: boolean, useMarketOrder: boolean,
        entryPrice: number, stopOutPrice: number, riskLevelPrice: number, allowedSize: number, logTags: Models.LogTags): void {
        let planCopy = JSON.parse(JSON.stringify(this.allTimeHighVwapContinuationPlan)) as TradingPlansModels.AllTimeHighVwapContinuationPlan;
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
        let tightStopLevels = TradebookUtil.getTightStopLevelsForTrend(this.symbol, true);
        return tightStopLevels;
    }

    getTradebookDoc(): string {
        return "";
    }

    getTradeManagementInstructions(): Models.TradeManagementInstructions {
        let instructions = this.getTradeManagementInstructionsForLong();
        TradebookUtil.setlevelToAddInstructions(this.symbol, true, instructions);
        TradebookUtil.setFinalTargetInstructions(this.symbol, true, instructions);
        let conditionsToFail = ["lose vwap", "lose all-time high"];
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
                'lose all-time high level',
            ]], [
            'conditions to trim', [
                'first new low on M1, M5, M15',
                'close below all-time high',
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

    onNewTimeSalesData(): void {
        // Disable logic is handled in tradebooksManager.ts
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
        let lostMomentum = VwapPatterns.hasTwoConsecutiveCandlesAgainstVwap(this.symbol, true, timeframe);
        if (lostMomentum) {
            TradebookUtils.setButtonStatus(button, "inactive");
        } else {
            TradebookUtils.setButtonStatus(button, "active");
        }
    }
}
