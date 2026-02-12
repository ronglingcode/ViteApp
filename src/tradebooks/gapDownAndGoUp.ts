import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradebookUtil from './tradebookUtil';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';

export class GapDownAndGoUp extends Tradebook {
    public static readonly gapDownAndGoUpLong: string = 'GapDownAndGoUpLong';
    private basePlan: TradingPlansModels.GapDownAndGoUpPlan;

    public getID(): string {
        return GapDownAndGoUp.gapDownAndGoUpLong;
    }

    constructor(symbol: string, isLong: boolean, basePlan: TradingPlansModels.GapDownAndGoUpPlan) {
        if (!isLong) {
            throw new Error('GapDownAndGoUp tradebook only supports long positions');
        }
        let tradebookName = 'Long Gap Down and Go Up';
        let buttonLabel = 'Gap Down Go Up';
        super(symbol, true, tradebookName, buttonLabel);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    refreshLiveStats(): void {
        // TODO: Implement live stats refresh if needed
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let isLong = true;
        let logTagName = '_long_gap_down_go_up';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let symbolData = Models.getSymbolData(symbol);
        let stopOutPrice = symbolData.lowOfDay;
        let riskLevelPrice = Models.chooseRiskLevel(symbol, isLong, entryPrice, this.basePlan.defaultRiskLevels);
        let entryMethod = parameters.entryMethod;
        if (entryMethod === 'LOD') {
            riskLevelPrice = symbolData.lowOfDay;
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
        let currentVwap = Models.getCurrentVwap(this.symbol);
        if (this.basePlan.support.length > 0) {
            let support = this.basePlan.support[0];
            if (entryPrice < support.low) {
                Firestore.logError(`entry price ${entryPrice} is below support ${support.low}`, logTags);
                return 0;
            }

            if (entryPrice < currentVwap) {
                let atr = Models.getAtr(this.symbol).average;
                let maxPrice = support.high + 0.5 * atr;
                if (entryPrice > maxPrice) {
                    Firestore.logError(`entry price ${entryPrice} is above max price ${maxPrice}`, logTags);
                    return 0;
                }
            }
        }

        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            this.symbol, true, entryPrice, stopOutPrice, useMarketOrder,
            this.basePlan, false, logTags);

        if (entryPrice < currentVwap) {
            return allowedSize * 0.5;
        }
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
        return TradebookUtil.getTightStopLevelsForTrend(this.symbol, true);
    }

    getTradebookDoc(): string {
        return "";
    }

    getTradeManagementInstructions(): Models.TradeManagementInstructions {
        let instructions = this.getTradeManagementInstructionsForLong();
        TradebookUtil.setlevelToAddInstructions(this.symbol, true, instructions);
        TradebookUtil.setFinalTargetInstructions(this.symbol, true, instructions);

        let conditionsToFail = ["new low of day, lose gap down reversal momentum"];

        let result: Models.TradeManagementInstructions = {
            mapData: instructions,
            conditionsToFail: conditionsToFail,
        };
        return result;
    }

    getTradeManagementInstructionsForLong(): Map<string, string[]> {
        const instructions = new Map<string, string[]>([
            ['conditions to fail', [
                'new low of day breakdown',
                'fail to hold open price (reversal fails)',
            ]],
            ['conditions to trim', [
                'first new low after initial bounce',
                'M5 reversal candle',
            ]],
            ['add or re-entry', [
                'add on open price rejection if strong',
                'add on VWAP rejection',
            ]],
            ['partial targets', [
                "25-40%: first leg bounce toward previous close",
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
            'LOD'
        ];
    }
}
