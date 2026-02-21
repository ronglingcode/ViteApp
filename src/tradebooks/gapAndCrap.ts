import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradebookUtil from './tradebookUtil';
import * as Helper from '../utils/helper';
import * as Rules from '../algorithms/rules';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';

export class GapAndCrap extends Tradebook {
    public static readonly gapAndCrapShort: string = 'GapAndCrapShort';
    private basePlan: TradingPlansModels.GapAndCrapPlan;

    /**
     * Returns true if at least one reason is set on the gap-and-crap plan.
     * Otherwise logs error and returns false. Use when validating a plan has a reason set.
     */
    public static hasAtLeastOneReasonSet(plan: TradingPlansModels.GapAndCrapPlan, symbol: string): boolean {
        const hasOne =
            !!plan.heavySupplyZoneDays ||
            !!plan.recentRallyWithoutPullback ||
            !!plan.extendedGapUpInAtr ||
            !!plan.earnings ||
            !!plan.topEdgeOfCurrentRange ||
            !!plan.nearBelowPreviousEventKeyLevel;
        if (!hasOne) {
            Firestore.logError(`${symbol} missing one reason set for gap and crap plan`);
            return false;
        }
        return true;
    }

    public getID(): string {
        return GapAndCrap.gapAndCrapShort;
    }

    constructor(symbol: string, isLong: boolean, basePlan: TradingPlansModels.GapAndCrapPlan) {
        // This tradebook only supports short positions
        if (isLong) {
            throw new Error('GapAndCrap tradebook only supports short positions');
        }
        let tradebookName = 'Short Gap and Crap';
        let buttonLabel = 'Gap and Crap';
        super(symbol, false, tradebookName, buttonLabel);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    refreshLiveStats(): void {
        let entryPrice = Models.getCurrentPrice(this.symbol);
        let symbolData = Models.getSymbolData(this.symbol);
        let stopOutPrice = symbolData.highOfDay;
        let riskLevel = Models.chooseRiskLevel(this.symbol, this.isLong, entryPrice, stopOutPrice, this.basePlan.defaultRiskLevels);
        Helper.updateHtmlIfChanged(this.htmlStats, `risk level: ${riskLevel}`);
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let isLong = false; // This tradebook only supports short
        let logTagName = '_short_gap_and_crap';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let symbolData = Models.getSymbolData(symbol);
        let stopOutPrice = symbolData.highOfDay;
        let riskLevelPrice = Models.chooseRiskLevel(symbol, isLong, entryPrice, stopOutPrice, this.basePlan.defaultRiskLevels);
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
        let maxLevelToShort = this.basePlan.aboveThisLevelNoMoreShort;
        if (maxLevelToShort > 0 && entryPrice > maxLevelToShort) {
            Firestore.logError(`entry price ${entryPrice} is above max level to short:${maxLevelToShort}`, logTags);
            return 0;
        }
        let currentVwap = Models.getCurrentVwap(this.symbol);
        let minLevelToShort = this.basePlan.belowThisLevelOnlyVwapContinuation;
        if (minLevelToShort > 0) {
            if (entryPrice > currentVwap && entryPrice < minLevelToShort) {
                Firestore.logError(`below this level only vwap continuation: entry price ${entryPrice} is above vwap:${currentVwap} and below min level to short:${minLevelToShort}`, logTags);
                return 0;
            }
        }

        // Use basic global entry rules
        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            this.symbol, false, entryPrice, stopOutPrice, useMarketOrder,
            this.basePlan, false, logTags);

        if (entryPrice > currentVwap) {
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
        return true; // TODO: Implement enable/disable logic
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
        return [
            'default',
            'HOD'
        ];
    }
}
