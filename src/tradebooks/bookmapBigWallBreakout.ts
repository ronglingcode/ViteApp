import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';

export class BookmapBigWallBreakout extends Tradebook {
    public static readonly bookmapBigWallBreakoutLong: string = 'BookmapBigWallBreakoutLong';
    public static readonly bookmapBigWallBreakoutShort: string = 'BookmapBigWallBreakoutShort';
    private basePlan: TradingPlansModels.BasePlan;

    public getID(): string {
        return this.buildID(this.isLong ? BookmapBigWallBreakout.bookmapBigWallBreakoutLong : BookmapBigWallBreakout.bookmapBigWallBreakoutShort);
    }

    constructor(familyName: string, symbol: string, isLong: boolean, basePlan: TradingPlansModels.BasePlan) {
        let tradebookName = isLong ? 'Long Bookmap Big Wall Breakout' : 'Short Bookmap Big Wall Breakdown';
        let buttonLabel = "bookmap";
        if (familyName && familyName.length > 0) {
            buttonLabel = `${familyName} ${buttonLabel}`;
        }
        super(familyName, symbol, isLong, tradebookName, buttonLabel);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    refreshLiveStats(): void {
    }

    triggerEntryCommon(dryRun: boolean, useMarketOrder: boolean, entryPrice: number, stopOutPrice: number, logTags: Models.LogTags): number {
        let symbol = this.symbol;
        let isLong = this.isLong;
        let riskLevelPrice = stopOutPrice;

        if (this.familyName === Models.TradebookFamilyName.GapAndCrap) {
            if (!EntryRulesChecker.allowEntryRulesForGapAndCrap(symbol, entryPrice, logTags)) {
                return 0;
            }
        }

        if (this.familyName === Models.TradebookFamilyName.GapAndGo) {
            let gapPlan = this.basePlan as TradingPlansModels.GapAndGoPlan;
            if (gapPlan.mustOpenAboveVwap) {
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
        }

        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            symbol, isLong, entryPrice, stopOutPrice, useMarketOrder,
            this.basePlan, false, logTags);

        if (allowedSize === 0) {
            Firestore.logError(`${symbol} not allowed entry`, logTags);
            return 0;
        }
        allowedSize = allowedSize / 4;
        let planCopy = JSON.parse(JSON.stringify(this.basePlan)) as TradingPlansModels.BasePlan;
        this.submitEntryOrdersBase(
            dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, planCopy, logTags);

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
        if (this.familyName == Models.TradebookFamilyName.GapAndGo) {
            let symbolData = Models.getSymbolData(symbol);
            let premarketHigh = symbolData.premktHigh;
            if (entryPrice >= premarketHigh) {
                return {
                    allowed: true,
                    reason: "price is above premarket high, allow add",
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

    onNewTimeSalesData(): void {
    }
}
