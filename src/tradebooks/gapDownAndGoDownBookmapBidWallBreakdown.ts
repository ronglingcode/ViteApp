import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import { TradebookID } from './tradebookIds';

export class GapDownAndGoDownBookmapBidWallBreakdown extends Tradebook {
    private basePlan: TradingPlansModels.GapDownAndGoDownPlan;

    constructor(symbol: string, basePlan: TradingPlansModels.GapDownAndGoDownPlan) {
        super(symbol, false, 'Short Gap Down & Go Down Bookmap Bid Wall Breakdown', `${Models.TradebookFamilyName.GapDownAndGoDown} bookmap`);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    getID(): string {
        return TradebookID.GapDownAndGoDownBookmapBidWallBreakdown;
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
        let symbol = this.symbol;
        let logTags = Models.generateLogTags(symbol, `${symbol}_bookmap_bid_wall_breakdown`);

        let entryPrice = Chart.getBreakoutEntryPrice(symbol, false, useMarketOrder, Models.getDefaultEntryParameters());
        let stopOutPrice = Chart.getCustomStopLossPrice(symbol, false);
        if (stopOutPrice == 0) {
            Firestore.logError(`no custom stop loss`, logTags);
            return 0;
        }
        return this.triggerEntryCommon(dryRun, useMarketOrder, entryPrice, stopOutPrice, logTags);
    }

    triggerEntryFromBookmap(useMarketOrder: boolean, stopOutPrice: number): number {
        let symbol = this.symbol;
        let logTags = Models.generateLogTags(symbol, `${symbol}_bookmap_bid_wall_breakdown`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, false, useMarketOrder, Models.getDefaultEntryParameters());

        return this.triggerEntryCommon(false, useMarketOrder, entryPrice, stopOutPrice, logTags);
    }

    getAllowedReasonToAddPartial(symbol: string, entryPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        return {
            allowed: false,
            reason: "default is no add",
        };
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
