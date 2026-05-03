import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as Helper from '../utils/helper';
import { TradebookID } from './tradebookIds';

export class GapDownAndGoUpBookmapOfferWallBreakout extends Tradebook {
    private basePlan: TradingPlansModels.GapDownAndGoUpPlan;

    constructor(symbol: string, basePlan: TradingPlansModels.GapDownAndGoUpPlan) {
        super(symbol, true, 'Long Gap Down & Go Up Bookmap Offer Wall Breakout', `${Models.TradebookFamilyName.GapDownAndGoUp} bookmap`);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    getID(): string {
        return TradebookID.GapDownAndGoUpBookmapOfferWallBreakout;
    }

    refreshLiveStats(): void {
        let entryPrice = Models.getCurrentPrice(this.symbol);
        let symbolData = Models.getSymbolData(this.symbol);
        let stopOutPrice = symbolData.lowOfDay;
        let riskLevel = Models.chooseRiskLevel(this.symbol, this.isLong, entryPrice, stopOutPrice, TradingPlans.getAnalysisDefaultRiskLevels(this.symbol));
        Helper.updateHtmlIfChanged(this.htmlStats, `risk level: ${riskLevel}`);
    }

    triggerEntryCommon(
        dryRun: boolean,
        useMarketOrder: boolean,
        entryPrice: number,
        stopOutPrice: number,
        logTags: Models.LogTags
    ): number {
        let symbol = this.symbol;
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, useMarketOrder, logTags);

        if (allowedSize === 0) {
            Firestore.logError(`${symbol} not allowed entry`, logTags);
            return 0;
        }
        allowedSize = allowedSize / 4;
        let riskLevelPrice = Models.chooseRiskLevel(symbol, true, entryPrice, stopOutPrice, TradingPlans.getAnalysisDefaultRiskLevels(symbol));
        let planCopy = JSON.parse(JSON.stringify(this.basePlan)) as TradingPlansModels.BasePlan;
        this.submitEntryOrdersBase(
            dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, planCopy, logTags);

        return allowedSize;
    }

    private validateEntry(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, logTags: Models.LogTags): number {
        let currentVwap = Models.getCurrentVwap(this.symbol);
        if (this.basePlan.support.length > 0) {
            let support = this.basePlan.support[0];
            if (entryPrice < support.low) {
                Firestore.logError(`entry price ${entryPrice} is below support ${support.low}`, logTags);
                return 0;
            }

            if (entryPrice < currentVwap) {
                let atr = Models.getAtr(this.symbol).average;
                let maxPrice = support.high + 0.5 * atr;
                if (entryPrice > maxPrice) {
                    Firestore.logError(`entry price ${entryPrice} is above max price ${maxPrice}`, logTags);
                    return 0;
                }
            }
        }

        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            this.symbol, true, entryPrice, stopOutPrice, useMarketOrder,
            this.basePlan, false, logTags);

        if (entryPrice < currentVwap) {
            return allowedSize * 0.5;
        }
        return allowedSize;
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        Firestore.logError("only trigger from bookmap");
        return 0;
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
