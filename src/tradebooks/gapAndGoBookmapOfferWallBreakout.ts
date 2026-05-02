import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';

export class GapAndGoBookmapOfferWallBreakout extends Tradebook {
    public static readonly id: string = 'GapAndGoBookmapOfferWallBreakout';
    private basePlan: TradingPlansModels.GapAndGoPlan;

    constructor(symbol: string, basePlan: TradingPlansModels.GapAndGoPlan) {
        let familyName = Models.TradebookFamilyName.GapAndGo;
        super(familyName, symbol, true, 'Long Gap & Go Bookmap Offer Wall Breakout', `${familyName} bookmap`);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    getID(): string {
        return this.buildID(GapAndGoBookmapOfferWallBreakout.id);
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

        if (this.basePlan.mustOpenAboveVwap) {
            let openPrice = Models.getOpenPrice(symbol);
            let openVwap = Models.getLastVwapBeforeOpen(symbol);
            if (openPrice == null || openVwap == null) {
                Firestore.logError(`mustOpenAboveVwap: need open price and VWAP at open`, logTags);
                return 0;
            }
            if (openPrice < openVwap) {
                Firestore.logError(`mustOpenAboveVwap: open ${openPrice} below VWAP at open ${openVwap}`, logTags);
                return 0;
            }
        }

        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            symbol, true, entryPrice, stopOutPrice, useMarketOrder,
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
        let logTags = Models.generateLogTags(symbol, `${symbol}_bookmap_offer_wall_breakout`);

        let entryPrice = Chart.getBreakoutEntryPrice(symbol, true, useMarketOrder, Models.getDefaultEntryParameters());
        let stopOutPrice = Chart.getCustomStopLossPrice(symbol, true);
        if (stopOutPrice == 0) {
            Firestore.logError(`no custom stop loss`, logTags);
            return 0;
        }
        return this.triggerEntryCommon(dryRun, useMarketOrder, entryPrice, stopOutPrice, logTags);
    }

    triggerEntryFromBookmap(useMarketOrder: boolean, stopOutPrice: number): number {
        let symbol = this.symbol;
        let logTags = Models.generateLogTags(symbol, `${symbol}_bookmap_offer_wall_breakout`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, true, useMarketOrder, Models.getDefaultEntryParameters());

        return this.triggerEntryCommon(false, useMarketOrder, entryPrice, stopOutPrice, logTags);
    }

    getAllowedReasonToAddPartial(symbol: string, entryPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        let symbolData = Models.getSymbolData(symbol);
        let premarketHigh = symbolData.premktHigh;
        if (entryPrice >= premarketHigh) {
            return {
                allowed: true,
                reason: "price is above premarket high, allow add",
            };
        }
        return {
            allowed: false,
            reason: "default is no add",
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

    onNewTimeSalesData(): void { }
}
