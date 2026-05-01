import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';

import * as Helper from '../utils/helper';
import * as Rules from '../algorithms/rules';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';

export class PremarketHighRejection extends Tradebook {
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
        return this.buildID(PremarketHighRejection.gapAndCrapShort);
    }

    constructor(familyName: string, symbol: string, isLong: boolean, basePlan: TradingPlansModels.GapAndCrapPlan) {
        // This tradebook only supports short positions
        if (isLong) {
            throw new Error('PremarketHighRejection tradebook only supports short positions');
        }
        let tradebookName = 'Short Gap and Crap';
        let buttonLabel = "pm high reject";
        if (familyName && familyName.length > 0) {
            buttonLabel = `${familyName} ${buttonLabel}`;
        }
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
        let isLong = false; // This tradebook only supports short
        let logTagName = '_short_gap_and_crap';
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

        if (this.familyName == Models.TradebookFamilyName.GapAndCrap) {
            if (!EntryRulesChecker.allowEntryRulesForGapAndCrap(this.symbol, entryPrice, logTags)) {
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

    isEnabled(): boolean {
        return true; // TODO: Implement enable/disable logic
    }

    getAllowedReasonToAddPartial(symbol: string, entryPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        if (this.familyName == Models.TradebookFamilyName.GapAndCrap) {
            let vwap = Models.getCurrentVwap(symbol);
            if (entryPrice < vwap) {
                return {
                    allowed: true,
                    reason: "price is below vwap, allow add",
                };
            }
        }
        return {
            allowed: false,
            reason: "default is no add",
        };
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
