import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as GlobalSettings from '../config/globalSettings';
import * as Helper from '../utils/helper';
import { TradebookID } from "./tradebookIds";
import * as GapAndGoAlgo from '../algorithms/gapAndGoAlgo';
import * as GapAndCrapAlgo from '../algorithms/gapAndCrapAlgo';
import * as GapDownAndGoDownAlgo from '../algorithms/gapDownAndGoDownAlgo';
import * as GapDownAndGoUpAlgo from '../algorithms/gapDownAndGoUpAlgo';
import * as SupportResistance from '../models/tradingPlans/supportResistance';

export class BookmapWallReversal extends Tradebook {
    private basePlan: TradingPlansModels.BasePlan;
    private entryArea: TradingPlansModels.SupportResistanceArea;

    constructor(symbol: string, tradebookID: string, basePlan: TradingPlansModels.BasePlan,
        entryArea: TradingPlansModels.SupportResistanceArea) {
        let isLong = false;
        let tradebookName = "unknown";
        let buttonLabel = "unknown";
        if (tradebookID == TradebookID.GapAndCrapOfferStepDownReappear) {
            isLong = false;
            tradebookName = 'Gap & Crap Offer Step Down Or Reappear';
            buttonLabel = 'Gap & Crap offer step down / reappear';
        } else if (tradebookID == TradebookID.GapAndCrapBreakdownBidSwingLow) {
            isLong = false;
            tradebookName = 'Gap & Crap breakdown bid / swing low';
            buttonLabel = 'Gap & Crap breakdown bid / swing low';
        } else if (tradebookID == TradebookID.GapDownAndGoDownOfferStepDownReappear) {
            isLong = false;
            tradebookName = 'Gap Down & Go Down Offer Step Down Or Reappear';
            buttonLabel = 'Gap Down & Go Down offer step down / reappear';
        } else if (tradebookID == TradebookID.GapDownAndGoDownBreakdownBidSwingLow) {
            isLong = false;
            tradebookName = 'Gap Down & Go Down breakdown bid / swing low';
            buttonLabel = 'Gap Down & Go Down breakdown bid / swing low';
        } else if (tradebookID == TradebookID.GapGiveAndGoBookmapReversal) {
            isLong = true;
            tradebookName = 'Gap, Give & Go'
            buttonLabel = 'Gap, give and go bookmap reversal';
        } else if (tradebookID == TradebookID.GapDownAndGoUpBookmapReversal) {
            isLong = true;
            tradebookName = 'Gap Down & Go Up Bookmap Reversal';
            buttonLabel = `gap down & go up bookmap bid reversal`;
        } else if (tradebookID == TradebookID.RangeBoundBidReversal) {
            isLong = true;
            tradebookName = 'Range Bound Bid Reversal';
            buttonLabel = 'Range Bound bid reversal';
        } else if (tradebookID == TradebookID.RangeBoundOfferReversal) {
            isLong = false;
            tradebookName = 'Range Bound Offer Reversal';
            buttonLabel = 'Range Bound offer reversal';
        } else {
            Firestore.logError(`unknow tradebook id ${tradebookID}`)
        }

        super(symbol, tradebookID, isLong, tradebookName, buttonLabel);
        this.basePlan = basePlan;
        this.enableByDefault = true;
        this.entryArea = entryArea;
    }

    refreshLiveStats(): void { }

    override setCoreInvalidationLevel(manualLevel: number): void {
        let symbolData = Models.getSymbolData(this.symbol);
        if (this.isLong) {
            super.setCoreInvalidationLevel(Math.min(symbolData.lowOfDay, manualLevel));
        } else {
            super.setCoreInvalidationLevel(Math.max(symbolData.highOfDay, manualLevel));
        }
    }

    private getBookmapLogSuffix(): string {
        return this.isLong ? 'bookmap_bid_wall_reversal' : 'bookmap_offer_wall_reversal';
    }

    triggerEntryCommon(
        dryRun: boolean,
        useMarketOrder: boolean,
        entryPrice: number,
        stopOutPrice: number,
        riskReduction: number,
        mustAlignVwap: boolean,
        logTags: Models.LogTags,
        entryParameters?: Models.TradebookEntryParameters
    ): number {
        let symbol = this.symbol;
        let currentVwap = Models.getCurrentVwap(symbol);
        if (!SupportResistance.isEntryPriceAllowed(entryPrice, this.isLong, this.entryArea)) {
            let { low, high } = SupportResistance.getNormalizedBounds(this.entryArea);
            let entryRule = this.entryArea.requireEntryWithinRange === true
                ? `inside ${low}-${high}`
                : this.isLong ? `at or above ${low}` : `at or below ${high}`;
            Firestore.logError(`entryPrice ${entryPrice} must be ${entryRule}`, logTags);
            return 0;
        }
        if (this.isLong) {
            if (mustAlignVwap && entryPrice < currentVwap) {
                Firestore.logError(`entry below vwap: ${entryPrice} < ${currentVwap}`, logTags);
                return 0;
            }
        } else {
            if (mustAlignVwap && entryPrice > currentVwap) {
                Firestore.logError(`entry above vwap: ${entryPrice} > ${currentVwap}`, logTags);
                return 0;
            }
        }

        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            symbol, this.isLong, entryPrice, stopOutPrice, useMarketOrder,
            this.basePlan, false, logTags);

        if (allowedSize === 0) {
            Firestore.logError(`${symbol} not allowed entry`, logTags);
            return 0;
        }
        allowedSize = allowedSize * riskReduction;
        let planCopy = JSON.parse(JSON.stringify(this.basePlan)) as TradingPlansModels.BasePlan;
        this.submitEntryOrdersBase(
            dryRun, useMarketOrder, entryPrice, stopOutPrice, stopOutPrice, allowedSize, planCopy, logTags,
            entryParameters);

        return allowedSize;
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let logTags = Models.generateLogTags(symbol, `${symbol}_${this.getBookmapLogSuffix()}`);

        let entryPriceOverride = parameters.entryPriceOverride;
        if (entryPriceOverride !== undefined
            && (!Number.isFinite(entryPriceOverride) || entryPriceOverride <= 0)) {
            Firestore.logError(`invalid entry price override: ${entryPriceOverride}`, logTags);
            return 0;
        }
        let entryPrice = entryPriceOverride === undefined
            ? Chart.getBreakoutEntryPrice(
                symbol, this.isLong, useMarketOrder, Models.getDefaultEntryParameters())
            : Helper.roundPrice(symbol, entryPriceOverride);
        let stopOutPrice = Chart.getCustomStopLossPrice(symbol, this.isLong);
        if (stopOutPrice == 0) {
            // default to low of the day
            let symbolData = Models.getSymbolData(symbol);
            stopOutPrice = this.isLong ? symbolData.lowOfDay : symbolData.highOfDay;
        }
        let entryMethod = parameters.entryMethod;
        let riskReduction = Helper.getRiskMultiplierFromEntryMethod(entryMethod);
        Firestore.logInfo(`risk multiplier: ${riskReduction}`, logTags);
        return this.triggerEntryCommon(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskReduction, false, logTags, parameters);

    }

    getAllowedReasonToAddPartial(symbol: string, entryPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        if (this.tradebookID === TradebookID.GapAndCrapOfferStepDownReappear ||
            this.tradebookID === TradebookID.GapAndCrapBreakdownBidSwingLow
        ) {
            return GapAndCrapAlgo.getAllowedReasonToAddPartial(symbol, entryPrice);
        } else if (this.tradebookID === TradebookID.GapDownAndGoDownOfferStepDownReappear ||
            this.tradebookID === TradebookID.GapDownAndGoDownBreakdownBidSwingLow
        ) {
            return GapDownAndGoDownAlgo.getAllowedReasonToAddPartial(symbol, entryPrice);
        } else if (this.tradebookID == TradebookID.GapGiveAndGoBookmapReversal) {
            return {
                allowed: true,
                reason: "default",
            }
        } else if (this.tradebookID == TradebookID.GapDownAndGoUpBookmapReversal) {
            return GapDownAndGoUpAlgo.getAllowedReasonToAddPartial(symbol, entryPrice);
        }
        else {
            return {
                allowed: false,
                reason: `unknown tradebook ID: ${this.tradebookID}`,
            };
        }
    }

    getEntryMethods(): string[] {
        /*
        let patterns = [];
        if (this.isLong) {
            patterns = ['bid step up', 'bid reappear'];
        } else {
            return ["0.15R", "0.25R", "0.5R", "1R"];
        }
        let entryMethods: string[] = [];
        patterns.forEach(pattern => {
            entryMethods.push(`${pattern} 0.15R`);
            entryMethods.push(`${pattern} 0.25R`);
        });
                return entryMethods;
*/
        return Helper.returnDefaultEntryMethods();
    }


    getDisallowedReasonToAdjustSingleLimitOrder(
        symbol: string, keyIndex: number, order: Models.OrderModel,
        pair: Models.ExitPair, newPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        let missingCoreInvalidationResult = this.getDisallowedReasonForMissingCoreInvalidationLevelAtKeyIndex(symbol, keyIndex, this.basePlan, logTags);
        if (missingCoreInvalidationResult) {
            return missingCoreInvalidationResult;
        }
        return { allowed: true, reason: "core target rule passed" };
    }

    getDisallowedReasonToAdjustSingleStopOrder(
        symbol: string, keyIndex: number, order: Models.OrderModel, pair: Models.ExitPair, newPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        let missingCoreInvalidationResult = this.getDisallowedReasonForMissingCoreInvalidationLevelAtKeyIndex(symbol, keyIndex, this.basePlan, logTags);
        if (missingCoreInvalidationResult) {
            return missingCoreInvalidationResult;
        }
        return { allowed: true, reason: "core target rule passed" };
    }

    getDisallowedReasonToMarketOutSingleOrder(symbol: string, keyIndex: number, logTags: Models.LogTags): Models.CheckRulesResult {
        let missingCoreInvalidationResult = this.getDisallowedReasonForMissingCoreInvalidationLevelAtKeyIndex(symbol, keyIndex, this.basePlan, logTags);
        if (missingCoreInvalidationResult) {
            return missingCoreInvalidationResult;
        }
        return { allowed: true, reason: "core target rule passed" };
    }

    getDisallowedReasonToAdjustAllExitPairs(symbol: string, logTags: Models.LogTags, newPrice: number): Models.CheckRulesResult {
        let exitCount = Models.getExitPairs(symbol).length;
        let missingCoreInvalidationResult = this.getDisallowedReasonForMissingCoreInvalidationLevelInExitPairRange(symbol, exitCount, this.basePlan, logTags);
        if (missingCoreInvalidationResult) {
            return missingCoreInvalidationResult;
        }
        return {
            allowed: true,
            reason: "allow adjust all exits",
        };
    }

    onNewTimeSalesData(newPrice: number): void { }
}
