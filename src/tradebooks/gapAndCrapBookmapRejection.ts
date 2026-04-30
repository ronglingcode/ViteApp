import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import { runGapAndCrapBookmapShortEntryPipeline } from './gapAndCrapBookmapShortCommon';

/** Gap & crap short-only bookmap rejection — standalone tradebook (not a BookmapBigWallBreakout subtype). */
export class GapAndCrapBookmapRejection extends Tradebook {
    public static readonly gapAndCrapBookmapRejectionId: string = 'GapAndCrapBookmapRejection';

    private basePlan: TradingPlansModels.BasePlan;
    private static readonly entryLogSuffix = '_gap_and_crap_bookmap_rejection';

    constructor(symbol: string, basePlan: TradingPlansModels.BasePlan) {
        let fn = Models.TradebookFamilyName.GapAndCrap;
        super(fn, symbol, false, 'Short Gap & Crap Bookmap Rejection', `${fn} bookmap rejection`);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    getID(): string {
        return this.buildID(GapAndCrapBookmapRejection.gapAndCrapBookmapRejectionId);
    }

    refreshLiveStats(): void {}

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let logTags = Models.generateLogTags(
            symbol,
            `${symbol}_${GapAndCrapBookmapRejection.entryLogSuffix}`
        );

        let entryPrice = Chart.getBreakoutEntryPrice(symbol, false, useMarketOrder, Models.getDefaultEntryParameters());
        let stopOutPrice = Chart.getCustomStopLossPrice(symbol, false);
        if (stopOutPrice == 0) {
            Firestore.logError(`no custom stop loss`, logTags);
            return 0;
        }
        return runGapAndCrapBookmapShortEntryPipeline(
            this,
            symbol,
            this.basePlan,
            dryRun,
            useMarketOrder,
            entryPrice,
            stopOutPrice,
            logTags
        );
    }

    triggerEntryFromBookmap(useMarketOrder: boolean, stopOutPrice: number): number {
        let symbol = this.symbol;
        let logTags = Models.generateLogTags(
            symbol,
            `${symbol}_${GapAndCrapBookmapRejection.entryLogSuffix}`
        );
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, false, useMarketOrder, Models.getDefaultEntryParameters());

        return runGapAndCrapBookmapShortEntryPipeline(
            this,
            symbol,
            this.basePlan,
            false,
            useMarketOrder,
            entryPrice,
            stopOutPrice,
            logTags
        );
    }

    getAllowedReasonToAddPartial(symbol: string, entryPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        return {
            allowed: false,
            reason: 'default is no add',
        };
    }

    getTradebookDoc(): string {
        return '';
    }

    getEntryMethods(): string[] {
        return ['default'];
    }

    getEligibleEntryParameters(): Models.TradebookEntryParameters {
        return {
            useCurrentCandleHigh: false,
            useFirstNewHigh: false,
            useMarketOrderWithTightStop: false,
        };
    }

    getTightStopLevels(): Models.DisplayLevel[] {
        return [];
    }

    onNewTimeSalesData(): void {}
}
