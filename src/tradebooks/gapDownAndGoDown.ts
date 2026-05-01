import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';

import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as Helper from '../utils/helper';

export class GapDownAndGoDown extends Tradebook {
    public static readonly gapDownAndGoDownShort: string = 'GapDownAndGoDownShort';
    private basePlan: TradingPlansModels.GapDownAndGoDownPlan;

    /**
     * Returns true if at least one reason is set on the gap-down-and-go-down plan.
     * Otherwise logs error and returns false.
     */
    public static hasAtLeastOneReasonSet(plan: TradingPlansModels.GapDownAndGoDownPlan, symbol: string): boolean {
        const hasOne =
            !!plan.nearBelowConsolidationRange ||
            !!plan.nearBelowConsolidationRangeTop ||
            !!plan.buyersTrappedBelowThisLevel ||
            !!plan.previousInsideDay;
        if (!hasOne) {
            Firestore.logError(`${symbol} missing one reason set for gap down and go down plan`);
            return false;
        }
        return true;
    }

    public getID(): string {
        return this.buildID(GapDownAndGoDown.gapDownAndGoDownShort);
    }

    constructor(familyName: string, symbol: string, isLong: boolean, basePlan: TradingPlansModels.GapDownAndGoDownPlan) {
        if (isLong) {
            throw new Error('GapDownAndGoDown tradebook only supports short positions');
        }
        let tradebookName = 'Short Gap Down and Go Down';
        let buttonLabel = 'Gap Down Go Down';
        super(familyName, symbol, false, tradebookName, buttonLabel);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    refreshLiveStats(): void {
        let entryPrice = Models.getCurrentPrice(this.symbol);
        let symbolData = Models.getSymbolData(this.symbol);
        let stopOutPrice = symbolData.highOfDay;
        let riskLevel = Models.chooseRiskLevel(this.symbol, this.isLong, entryPrice, stopOutPrice, TradingPlans.getAnalysisDefaultRiskLevels(this.symbol));
        Helper.updateHtmlIfChanged(this.htmlStats, `risk level: ${riskLevel}`);
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let isLong = false;
        let logTagName = '_short_gap_down_go_down';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let symbolData = Models.getSymbolData(symbol);
        let stopOutPrice = symbolData.highOfDay;
        let riskLevelPrice = Models.chooseRiskLevel(symbol, isLong, entryPrice, stopOutPrice, TradingPlans.getAnalysisDefaultRiskLevels(this.symbol));
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

    isEnabled(): boolean {
        return true;
    }

    getCommonLiveStats(): string {
        return super.getCommonLiveStats();
    }

    getTradebookDoc(): string {
        return "";
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
