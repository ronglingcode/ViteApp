import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as GapAndCrapAlgo from '../algorithms/gapAndCrapAlgo';

import { TradebookID } from './tradebookIds';

export class GapAndCrapBookmapBidWallBreakdown extends Tradebook {
    private basePlan: TradingPlansModels.BasePlan;

    constructor(symbol: string, basePlan: TradingPlansModels.BasePlan) {
        super(symbol, false, 'Short Gap & Crap Bookmap Bid Wall Breakdown', `${Models.TradebookFamilyName.GapAndCrap} bookmap`);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    getID(): string {
        return TradebookID.GapAndCrapBookmapBidWallBreakdown;
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

        if (!GapAndCrapAlgo.allowEntryRulesForGapAndCrap(symbol, entryPrice, logTags)) {
            return 0;
        }

        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            symbol, false, entryPrice, stopOutPrice, useMarketOrder,
            this.basePlan, false, logTags);

        if (allowedSize === 0) {
            Firestore.logError(`${symbol} not allowed entry`, logTags);
            return 0;
        }
        allowedSize = allowedSize / 4;
        let planCopy = JSON.parse(JSON.stringify(this.basePlan)) as TradingPlansModels.BasePlan;
        this.submitEntryOrdersBase(
            dryRun, useMarketOrder, entryPrice, stopOutPrice, stopOutPrice, allowedSize, planCopy, logTags);

        return allowedSize;
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        Firestore.logError("only trigger entry from bookmap for bid wall breakdown", Models.generateLogTags(this.symbol, 'gap_and_crap_bookmap_bid_wall_breakdown'));
        return 0;
        /*
           let symbol = this.symbol;
           let logTags = Models.generateLogTags(symbol, `${symbol}_bookmap_bid_wall_breakdown`);
   
           let entryPrice = Chart.getBreakoutEntryPrice(symbol, false, useMarketOrder, Models.getDefaultEntryParameters());
           let stopOutPrice = Chart.getCustomStopLossPrice(symbol, false);
           if (stopOutPrice == 0) {
               Firestore.logError(`no custom stop loss`, logTags);
               return 0;
           }
           return this.triggerEntryCommon(dryRun, useMarketOrder, entryPrice, stopOutPrice, logTags);
           */
    }

    triggerEntryFromBookmap(useMarketOrder: boolean, stopOutPrice: number): number {
        let symbol = this.symbol;
        let logTags = Models.generateLogTags(symbol, `${symbol}_bookmap_bid_wall_breakdown`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, false, useMarketOrder, Models.getDefaultEntryParameters());

        return this.triggerEntryCommon(false, useMarketOrder, entryPrice, stopOutPrice, logTags);
    }

    getAllowedReasonToAddPartial(symbol: string, entryPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        return GapAndCrapAlgo.getAllowedReasonToAddPartial(symbol, entryPrice, logTags);
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
