import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradebookUtil from './tradebookUtil';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';

export class GapDownAndGoDown extends Tradebook {
    public static readonly gapDownAndGoDownShort: string = 'GapDownAndGoDownShort';
    private basePlan: TradingPlansModels.GapDownAndGoDownPlan;

    public getID(): string {
        return GapDownAndGoDown.gapDownAndGoDownShort;
    }

    constructor(symbol: string, isLong: boolean, basePlan: TradingPlansModels.GapDownAndGoDownPlan) {
        if (isLong) {
            throw new Error('GapDownAndGoDown tradebook only supports short positions');
        }
        let tradebookName = 'Short Gap Down and Go Down';
        let buttonLabel = 'Gap Down Go Down';
        super(symbol, false, tradebookName, buttonLabel);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    refreshLiveStats(): void {
        // TODO: Implement live stats refresh if needed
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let isLong = false;
        let logTagName = '_short_gap_down_go_down';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let symbolData = Models.getSymbolData(symbol);
        let stopOutPrice = symbolData.highOfDay;
        let defaultRiskLevel = this.basePlan.defaultRiskLevel ?? stopOutPrice;
        let riskLevelPrice = Models.getRiskLevelPrice(symbol, isLong, defaultRiskLevel, entryPrice);
        let entryMethod = parameters.entryMethod;
        if (entryMethod === 'HOD') {
            riskLevelPrice = symbolData.highOfDay;
        }
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, useMarketOrder, logTags);

        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }

        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, logTags);
        return allowedSize;
    }

    validateEntry(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, logTags: Models.LogTags): number {
        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            this.symbol, false, entryPrice, stopOutPrice, useMarketOrder,
            this.basePlan, false, logTags);
        return allowedSize;
    }

    submitEntryOrders(dryRun: boolean, useMarketOrder: boolean,
        entryPrice: number, stopOutPrice: number, riskLevel: number,
        allowedSize: number, logTags: Models.LogTags): void {
        let planCopy = JSON.parse(JSON.stringify(this.basePlan)) as TradingPlansModels.BasePlan;
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
        return true;
    }

    getCommonLiveStats(): string {
        return super.getCommonLiveStats();
    }

    getTightStopLevels(): Models.DisplayLevel[] {
        return TradebookUtil.getTightStopLevelsForTrend(this.symbol, false);
    }

    getTradebookDoc(): string {
        return "";
    }

    getTradeManagementInstructions(): Models.TradeManagementInstructions {
        let instructions = this.getTradeManagementInstructionsForShort();
        TradebookUtil.setlevelToAddInstructions(this.symbol, false, instructions);
        TradebookUtil.setFinalTargetInstructions(this.symbol, false, instructions);

        let conditionsToFail = ["new high of day, lose gap down continuation momentum"];

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
                'reclaim open price (gap fill)',
            ]],
            ['conditions to trim', [
                'first new high after initial continuation',
                'M5 reversal candle',
            ]],
            ['add or re-entry', [
                'add on open price rejection if weak',
                'add on VWAP rejection',
            ]],
            ['partial targets', [
                "25-40%: first leg continuation toward previous close",
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
        return [
            'default',
            'HOD'
        ];
    }
}
