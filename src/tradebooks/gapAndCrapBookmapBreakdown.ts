import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as GapAndCrapAlgo from '../algorithms/gapAndCrapAlgo';

/**
 * Gap & crap short bookmap breakdown — parallels {@link BookmapBigWallBreakout} for family GapAndCrap, isLong false:
 * same entry pipeline, logs, and adds policy as that bookmap tradebook.
 */
export class GapAndCrapBookmapBreakdown extends Tradebook {
    public static readonly gapAndCrapBookmapBreakdownId: string = 'GapAndCrapBookmapBreakdown';

    private basePlan: TradingPlansModels.BasePlan;

    constructor(symbol: string, basePlan: TradingPlansModels.BasePlan) {
        let familyName = Models.TradebookFamilyName.GapAndCrap;
        let isLong = false;
        let tradebookName = 'Short Bookmap Big Wall Breakdown';
        let buttonLabel = 'bookmap';
        if (familyName && familyName.length > 0) {
            buttonLabel = `${familyName} ${buttonLabel}`;
        }
        super(familyName, symbol, isLong, tradebookName, buttonLabel);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    getID(): string {
        return this.buildID(GapAndCrapBookmapBreakdown.gapAndCrapBookmapBreakdownId);
    }

    refreshLiveStats(): void { }

    triggerEntryCommon(
        dryRun: boolean,
        useMarketOrder: boolean,
        entryPrice: number,
        stopOutPrice: number,
        logTags: Models.LogTags
    ): number {
        let symbol = this.symbol;
        let isLong = this.isLong;
        let riskLevelPrice = stopOutPrice;

        if (this.familyName === Models.TradebookFamilyName.GapAndCrap) {
            if (!EntryRulesChecker.allowEntryRulesForGapAndCrap(symbol, entryPrice, logTags)) {
                return 0;
            }
        }

        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            symbol,
            isLong,
            entryPrice,
            stopOutPrice,
            useMarketOrder,
            this.basePlan,
            false,
            logTags
        );

        if (allowedSize === 0) {
            Firestore.logError(`${symbol} not allowed entry`, logTags);
            return 0;
        }
        allowedSize = allowedSize / 4;
        let planCopy = JSON.parse(JSON.stringify(this.basePlan)) as TradingPlansModels.BasePlan;
        this.submitEntryOrdersBase(
            dryRun,
            useMarketOrder,
            entryPrice,
            stopOutPrice,
            riskLevelPrice,
            allowedSize,
            planCopy,
            logTags
        );

        return allowedSize;
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let isLong = this.isLong;
        let logTagName = isLong ? '_bookmap_big_wall_breakout' : '_bookmap_big_wall_breakdown';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);

        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let stopOutPrice = Chart.getCustomStopLossPrice(symbol, isLong);
        if (stopOutPrice == 0) {
            Firestore.logError(`no custom stop loss`, logTags);
            return 0;
        }
        return this.triggerEntryCommon(dryRun, useMarketOrder, entryPrice, stopOutPrice, logTags);
    }

    triggerEntryFromBookmap(useMarketOrder: boolean, stopOutPrice: number): number {
        let symbol = this.symbol;
        let isLong = this.isLong;
        let logTagName = isLong ? '_bookmap_big_wall_breakout' : '_bookmap_big_wall_breakdown';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());

        return this.triggerEntryCommon(false, useMarketOrder, entryPrice, stopOutPrice, logTags);
    }

    getAllowedReasonToAddPartial(symbol: string, entryPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        return GapAndCrapAlgo.getAllowedReasonToAddPartial(symbol, entryPrice, logTags);
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

    onNewTimeSalesData(): void { }
}
