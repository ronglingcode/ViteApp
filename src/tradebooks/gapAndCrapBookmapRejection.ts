import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import { runGapAndCrapBookmapShortEntryPipeline } from './gapAndCrapBookmapShortCommon';
import * as GapAndCrapAlgo from '../algorithms/gapAndCrapAlgo';

/** Gap & crap short-only bookmap rejection — standalone tradebook (not a BookmapBigWallBreakout subtype). */
import { TradebookID } from './tradebookIds';

export class GapAndCrapBookmapRejection extends Tradebook {

    private basePlan: TradingPlansModels.BasePlan;
    private static readonly entryLogSuffix = '_gap_and_crap_bookmap_rejection';

    constructor(symbol: string, basePlan: TradingPlansModels.BasePlan) {
        super(symbol, false, 'Short Gap & Crap Bookmap Rejection', `${Models.TradebookFamilyName.GapAndCrap} bookmap rejection`);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    getID(): string {
        return TradebookID.GapAndCrapBookmapRejection;
    }

    refreshLiveStats(): void { }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let logTags = Models.generateLogTags(
            symbol,
            `${symbol}_${GapAndCrapBookmapRejection.entryLogSuffix}`
        );
        let riskMultipler = 0.15;
        if (parameters.entryMethod === 'wall reject 0.25R') {
            riskMultipler = 0.25;
        }
        let isLong = false;
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let symbolData = Models.getSymbolData(symbol);
        let stopOutPrice = symbolData.highOfDay;

        return runGapAndCrapBookmapShortEntryPipeline(
            this,
            symbol,
            this.basePlan,
            dryRun,
            useMarketOrder,
            entryPrice,
            stopOutPrice,
            riskMultipler,
            logTags
        );
    }

    getAllowedReasonToAddPartial(symbol: string, entryPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        return GapAndCrapAlgo.getAllowedReasonToAddPartial(symbol, entryPrice, logTags);
    }

    getEntryMethods(): string[] {
        return ['wall reject 0.15R', 'wall reject 0.25R'];
    }

    getEligibleEntryParameters(): Models.TradebookEntryParameters {
        return {
            useCurrentCandleHigh: false,
            useFirstNewHigh: false,
            useMarketOrderWithTightStop: false,
        };
    }

    onNewTimeSalesData(): void { }
}
