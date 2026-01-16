import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradebookUtil from './tradebookUtil';
import * as Helper from '../utils/helper';
import * as Rules from '../algorithms/rules';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';

export class GapAndCrapNearAboveVwap extends Tradebook {
    public static readonly gapAndCrapNearAboveVwapShort: string = 'G_crap NearAboveVwap';
    private gapAndCrapPlan: TradingPlansModels.GapAndCrapPlan;

    public getID(): string {
        return GapAndCrapNearAboveVwap.gapAndCrapNearAboveVwapShort;
    }

    constructor(symbol: string, isLong: boolean, plan: TradingPlansModels.GapAndCrapPlan) {
        // This tradebook only supports short positions
        if (isLong) {
            throw new Error('GapAndCrapNearAboveVwap tradebook only supports short positions');
        }
        let tradebookName = 'Gap and Crap Near Above VWAP';
        let buttonLabel = 'G_crap NearAboveVwap';
        super(symbol, false, tradebookName, buttonLabel);
        this.gapAndCrapPlan = plan;
        this.enableByDefault = false;
    }

    refreshLiveStats(): void {
        // TODO: Implement live stats refresh if needed
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let isLong = false; // This tradebook only supports short
        let logTagName = '_short_gap_and_crap_near_above_vwap';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);
        let entryMethod = parameters.entryMethod;
        if (!entryMethod) {
            Firestore.logError(`entry method is missing`, logTags);
            return 0;
        }
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let symbolData = Models.getSymbolData(symbol);
        let stopOutPrice = symbolData.highOfDay;
        let defaultRiskLevel = this.gapAndCrapPlan.defaultRiskLevel ?? stopOutPrice;
        let riskLevelPrice = Models.getRiskLevelPrice(symbol, isLong, defaultRiskLevel, entryPrice);
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, useMarketOrder, entryMethod, logTags);

        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }

        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, logTags);
        return allowedSize;
    }

    validateEntry(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, entryMethod: string, logTags: Models.LogTags): number {
        let symbolData = Models.getSymbolData(this.symbol);
        let openPrice = Models.getOpenPrice(this.symbol);
        let currentVwap = Models.getCurrentVwap(this.symbol);
        let atr = Models.getAtr(this.symbol);

        if (!openPrice) {
            Firestore.logError(`missing open price`, logTags);
            return 0;
        }

        // Validate entry method specific requirements
        if (entryMethod === 'false b/o') {
            // For false breakout: high of day must have touched pm high, and entry price must be below pm high
            if (symbolData.highOfDay < symbolData.premktHigh) {
                Firestore.logError(`high of day ${symbolData.highOfDay} has not touched pm high ${symbolData.premktHigh}`, logTags);
                return 0;
            }
            if (entryPrice >= symbolData.premktHigh) {
                Firestore.logError(`entry price ${entryPrice} must be below pm high ${symbolData.premktHigh}`, logTags);
                return 0;
            }
        } else if (entryMethod === 'vwap b/d') {
            // For vwap breakdown: entry price must be below vwap
            if (entryPrice >= currentVwap) {
                Firestore.logError(`entry price ${entryPrice} must be below vwap ${currentVwap}`, logTags);
                return 0;
            }
        }

        // Use basic global entry rules
        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            this.symbol, false, entryPrice, stopOutPrice, useMarketOrder,
            this.gapAndCrapPlan, false, logTags);
        return allowedSize / 2;
    }

    submitEntryOrders(dryRun: boolean, useMarketOrder: boolean,
        entryPrice: number, stopOutPrice: number, riskLevel: number,
        allowedSize: number, logTags: Models.LogTags): void {
        let planCopy = JSON.parse(JSON.stringify(this.gapAndCrapPlan)) as TradingPlansModels.GapAndCrapPlan;
        this.submitEntryOrdersBase(
            dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevel, allowedSize, planCopy, logTags);
    }

    getEligibleEntryParameters(): Models.TradebookEntryParameters {
        return {
            useCurrentCandleHigh: false,
            useFirstNewHigh: false,
            useMarketOrderWithTightStop: false,
        };
    }

    refreshState(): void {
        // TODO: Implement state refresh logic if needed
    }

    transitionToState(newState: any): void {
        // TODO: Implement state transition logic if needed
    }

    isEnabled(): boolean {
        return true; // TODO: Implement enable/disable logic
    }

    getCommonLiveStats(): string {
        return super.getCommonLiveStats();
    }

    getTightStopLevels(): Models.DisplayLevel[] {
        let tightStopLevels = TradebookUtil.getTightStopLevelsForTrend(this.symbol, false);
        return tightStopLevels;
    }

    getTradebookDoc(): string {
        return "";
    }

    getTradeManagementInstructions(): Models.TradeManagementInstructions {
        let instructions = this.getTradeManagementInstructionsForShort();
        TradebookUtil.setlevelToAddInstructions(this.symbol, false, instructions);
        TradebookUtil.setFinalTargetInstructions(this.symbol, false, instructions);

        let conditionsToFail = ["new high of day, lose gap reversal momentum"];

        let result: Models.TradeManagementInstructions = {
            mapData: instructions,
            conditionsToFail: conditionsToFail,
        };
        return result;
    }

    getTradeManagementInstructionsForShort(): Map<string, string[]> {
        const instructions = new Map<string, string[]>([
            ['conditions to fail', [
                'new high of day breakout',
                'reclaim open price (gap fill fails)',
            ]],
            ['conditions to trim', [
                'first new high after initial fade',
                'M5 reversal candle',
            ]],
            ['add or re-entry', [
                'add on open price rejection if weak',
                'add on VWAP rejection',
            ]],
            ['partial targets', [
                "25-40%: first leg fade toward previous close",
                "40-60%: approach previous day close",
                "60-80%: reclaim previous day close",
                "80-100%: extended target beyond previous close",
            ]]
        ]);
        return instructions;
    }

    onNewTimeSalesData(): void {

    }

    getEntryMethods(): string[] {
        return ['false b/o', 'vwap b/d'];
    }
}
