import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as GlobalSettings from '../config/globalSettings';
import * as ExitRulesCheckerNew from '../controllers/exitRulesCheckerNew';
import * as Helper from '../utils/helper';
import { TradebookID } from "./tradebookIds";
import * as GapAndGoAlgo from '../algorithms/gapAndGoAlgo';
import * as GapAndCrapAlgo from '../algorithms/gapAndCrapAlgo';
import * as GapDownAndGoDownAlgo from '../algorithms/gapDownAndGoDownAlgo';
import * as GapDownAndGoUpAlgo from '../algorithms/gapDownAndGoUpAlgo';

export class BookmapWallBreak extends Tradebook {
    private basePlan: TradingPlansModels.BasePlan;
    private scalpMinCount = 0;
    private coreMinCount = 0;
    private minMaxEntryLevel: number;

    constructor(symbol: string, tradebookID: string, basePlan: TradingPlansModels.BasePlan,
        minMaxEntryLevel: number) {
        let isLong = true;
        let tradebookName = "unknown";
        let buttonLabel = "unknown";
        if (tradebookID == TradebookID.GapAndGoBookmapOfferWallBreakout) {
            tradebookName = 'Gap & Go Bookmap Offer Wall Breakout';
            buttonLabel = 'Gap & Go bookmap';
        } else if (tradebookID == TradebookID.GapAndCrapBookmapBidWallBreakdown) {
            isLong = false;
            tradebookName = 'Gap & Crap Bookmap Bid Wall Breakdown';
            buttonLabel = 'Gap & Crap bookmap';
        } else if (tradebookID == TradebookID.GapDownAndGoDownBookmapBidWallBreakdown) {
            isLong = false;
            tradebookName = 'gap down & go down bookmap';
            buttonLabel = 'gap down & go down bookmap';
        } else if (tradebookID == TradebookID.GapDownAndGoUpBookmapOfferWallBreakout) {
            isLong = true;
            tradebookName = 'Gap Down & Go Up Bookmap Offer Wall Breakout';
            buttonLabel = `gap down and go up bookmap breakout`;
        } else {
            Firestore.logError(`unknow tradebook id ${tradebookID}`)
        }

        super(symbol, tradebookID, isLong, tradebookName, buttonLabel);
        this.basePlan = basePlan;
        this.enableByDefault = true;
        let scalpCount = GlobalSettings.batchCount - basePlan.coreCount - basePlan.runnerCount;
        this.scalpMinCount = GlobalSettings.batchCount - scalpCount;
        this.coreMinCount = GlobalSettings.batchCount - scalpCount - basePlan.coreCount;
        this.minMaxEntryLevel = minMaxEntryLevel;
    }

    refreshLiveStats(): void { }

    private getBookmapLogSuffix(): string {
        return this.isLong ? 'bookmap_offer_wall_breakout' : 'bookmap_bid_wall_breakdown';
    }

    triggerEntryCommon(
        dryRun: boolean,
        useMarketOrder: boolean,
        entryPrice: number,
        stopOutPrice: number,
        logTags: Models.LogTags
    ): number {
        let symbol = this.symbol;
        if (this.isLong) {
            if (entryPrice < this.minMaxEntryLevel) {
                Firestore.logError(`entryPrice ${entryPrice} below min level ${this.minMaxEntryLevel}`, logTags);
                return 0;
            }
        } else {
            if (entryPrice > this.minMaxEntryLevel) {
                Firestore.logError(`entryPrice ${entryPrice} above max level ${this.minMaxEntryLevel}`, logTags);
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
        allowedSize = allowedSize / 4;
        let planCopy = JSON.parse(JSON.stringify(this.basePlan)) as TradingPlansModels.BasePlan;
        this.submitEntryOrdersBase(
            dryRun, useMarketOrder, entryPrice, stopOutPrice, stopOutPrice, allowedSize, planCopy, logTags);

        return allowedSize;
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let logTags = Models.generateLogTags(symbol, `${symbol}_${this.getBookmapLogSuffix()}`);

        let entryPrice = Chart.getBreakoutEntryPrice(symbol, this.isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let stopOutPrice = Chart.getCustomStopLossPrice(symbol, this.isLong);
        if (stopOutPrice == 0) {
            // default to low of the day
            let symbolData = Models.getSymbolData(symbol);
            stopOutPrice = this.isLong ? symbolData.lowOfDay : symbolData.highOfDay;
        }
        return this.triggerEntryCommon(dryRun, useMarketOrder, entryPrice, stopOutPrice, logTags);

    }

    triggerEntryFromBookmap(useMarketOrder: boolean, stopOutPrice: number): number {
        let symbol = this.symbol;
        let logTags = Models.generateLogTags(symbol, `${symbol}_${this.getBookmapLogSuffix()}`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, this.isLong, useMarketOrder, Models.getDefaultEntryParameters());

        return this.triggerEntryCommon(false, useMarketOrder, entryPrice, stopOutPrice, logTags);
    }

    getAllowedReasonToAddPartial(symbol: string, entryPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        if (this.tradebookID === TradebookID.GapAndGoBookmapOfferWallBreakout) {
            return GapAndGoAlgo.getAllowedReasonToAddPartial(symbol, entryPrice);
        } else if (this.tradebookID === TradebookID.GapAndCrapBookmapBidWallBreakdown) {
            return GapAndCrapAlgo.getAllowedReasonToAddPartial(symbol, entryPrice);
        } else if (this.tradebookID == TradebookID.GapDownAndGoDownBookmapBidWallBreakdown) {
            return GapDownAndGoDownAlgo.getAllowedReasonToAddPartial(symbol, entryPrice);
        } else if (this.tradebookID == TradebookID.GapDownAndGoUpBookmapOfferWallBreakout) {
            return GapDownAndGoUpAlgo.getAllowedReasonToAddPartial(symbol, entryPrice);
        } else {
            return {
                allowed: false,
                reason: `unknown tradebook ID: ${this.tradebookID}`,
            };
        }
    }

    getEntryMethods(): string[] {
        return ['default'];
    }

    getDisallowedReasonToAdjustSingleLimitOrder(
        symbol: string, keyIndex: number, order: Models.OrderModel,
        pair: Models.ExitPair, newPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        let isMarketOrder = false;
        let newResult = ExitRulesCheckerNew.isAllowedForLimitOrderForAllTradebooks(
            symbol, this.isLong, isMarketOrder, newPrice, keyIndex, pair, logTags);
        if (newResult.allowed) {
            return newResult;
        }
        let exitCount = Models.getExitPairs(symbol).length;
        if (exitCount >= this.scalpMinCount) {
            // manage scalp position
            let allowedReason: Models.CheckRulesResult = {
                allowed: true,
                reason: `allow adjust stop for scalps: ${exitCount} > ${this.scalpMinCount}`,
            };
            return allowedReason;
        } else if (exitCount >= this.coreMinCount) {
            // manage core position
            let minutesSinceOpen = Helper.getMinutesSinceMarketOpen(new Date());
            if (minutesSinceOpen >= 10) {
                let allowedReason: Models.CheckRulesResult = {
                    allowed: true,
                    reason: "alow core exit after 10 minutes from open",
                };
                return allowedReason;
            }
            if ((this.isLong && newPrice >= this.basePlan.coreTarget) || (!this.isLong && newPrice <= this.basePlan.coreTarget)) {
                let allowedReason: Models.CheckRulesResult = {
                    allowed: true,
                    reason: `allow adjust exit for core if new price ${newPrice} is above core target ${this.basePlan.coreTarget}`,
                };
                return allowedReason;
            }
        } else {
            let minutesSinceOpen = Helper.getMinutesSinceMarketOpen(new Date());
            if (minutesSinceOpen >= 14) {
                let allowedReason: Models.CheckRulesResult = {
                    allowed: true,
                    reason: "alow runner exit after 14 minutes from open",
                };
                return allowedReason;
            }
        }
        return newResult;
    }

    getDisallowedReasonToAdjustSingleStopOrder(
        symbol: string, keyIndex: number, order: Models.OrderModel, pair: Models.ExitPair, newPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        let isMarketOrder = false;
        let newResult = ExitRulesCheckerNew.isAllowedForSingleOrderForAllTradebooks(
            symbol, this.isLong, isMarketOrder, newPrice, keyIndex, logTags);
        if (newResult.allowed) {
            return newResult;
        }

        let exitCount = Models.getExitPairs(symbol).length;
        if (exitCount >= this.scalpMinCount) {
            // manage scalp position
            let allowedReason: Models.CheckRulesResult = {
                allowed: true,
                reason: `allow adjust stop for scalps: ${exitCount} > ${this.scalpMinCount}`,
            };
            return allowedReason;
        } else if (exitCount >= this.coreMinCount) {
            // manage core position
            let minutesSinceOpen = Helper.getMinutesSinceMarketOpen(new Date());
            if (minutesSinceOpen >= 10) {
                let allowedReason: Models.CheckRulesResult = {
                    allowed: true,
                    reason: "alow core exit after 10 minutes from open",
                };
                return allowedReason;
            }
            if ((this.isLong && newPrice >= this.basePlan.coreTarget) || (!this.isLong && newPrice <= this.basePlan.coreTarget)) {
                let allowedReason: Models.CheckRulesResult = {
                    allowed: true,
                    reason: `allow adjust stop for core if new price ${newPrice} is above core target ${this.basePlan.coreTarget}`,
                };
                return allowedReason;
            }
        } else {
            let minutesSinceOpen = Helper.getMinutesSinceMarketOpen(new Date());
            if (minutesSinceOpen >= 14) {
                let allowedReason: Models.CheckRulesResult = {
                    allowed: true,
                    reason: "alow runner exit after 14 minutes from open",
                };
                return allowedReason;

            }
        }
        return newResult;
    }

    getDisallowedReasonToMarketOutSingleOrder(symbol: string, keyIndex: number, logTags: Models.LogTags): Models.CheckRulesResult {
        let isMarketOrder = true;
        let currentPrice = Models.getCurrentPrice(symbol);
        let newResult = ExitRulesCheckerNew.isAllowedForSingleOrderForAllTradebooks(
            symbol, this.isLong, isMarketOrder, currentPrice, keyIndex, logTags);
        if (newResult.allowed) {
            return newResult;
        }
        let newPrice = Models.getCurrentPrice(symbol);
        let exitCount = Models.getExitPairs(symbol).length;
        if (exitCount >= this.scalpMinCount) {
            // manage scalp position
            let allowedReason: Models.CheckRulesResult = {
                allowed: true,
                reason: `allow market out for scalps: ${exitCount} > ${this.scalpMinCount}`,
            };
            return allowedReason;
        } else if (exitCount >= this.coreMinCount) {
            // manage core position
            let minutesSinceOpen = Helper.getMinutesSinceMarketOpen(new Date());
            if (minutesSinceOpen >= 10) {
                let allowedReason: Models.CheckRulesResult = {
                    allowed: true,
                    reason: "alow core exit after 10 minutes from open",
                };
                return allowedReason;
            }
            if ((this.isLong && newPrice >= this.basePlan.coreTarget) || (!this.isLong && newPrice <= this.basePlan.coreTarget)) {
                let allowedReason: Models.CheckRulesResult = {
                    allowed: true,
                    reason: `allow market out for core if new price ${newPrice} is above core target ${this.basePlan.coreTarget}`,
                };
                return allowedReason;
            }
        } else {
            let minutesSinceOpen = Helper.getMinutesSinceMarketOpen(new Date());
            if (minutesSinceOpen >= 14) {
                let allowedReason: Models.CheckRulesResult = {
                    allowed: true,
                    reason: "alow runner exit after 14 minutes from open",
                };
                return allowedReason;
            }
        }
        return newResult;
    }

    onNewTimeSalesData(): void { }
}
