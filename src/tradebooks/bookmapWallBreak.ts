import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as GlobalSettings from '../config/globalSettings';
import * as ExitRulesCheckerNew from '../controllers/exitRulesCheckerNew';
import * as Helper from '../utils/helper';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
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
    private inPullbackPhase = false;
    private hasPullbackPhase = false;
    private recentPullbackPrice = 0;
    public waitForPullback: boolean = true;

    constructor(symbol: string, tradebookID: string, basePlan: TradingPlansModels.BasePlan,
        minMaxEntryLevel: number, waitForPullback: boolean) {
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
        this.waitForPullback = waitForPullback;
        let scalpCount = GlobalSettings.batchCount - basePlan.coreCount - basePlan.runnerCount;
        this.scalpMinCount = GlobalSettings.batchCount - scalpCount;
        this.coreMinCount = GlobalSettings.batchCount - scalpCount - basePlan.coreCount;
        this.minMaxEntryLevel = minMaxEntryLevel;
    }

    refreshLiveStats(): void {
        if (!this.isEnabled() || !GlobalSettings.allowLiveStats) {
            Helper.updateHtmlIfChanged(this.htmlStats, '');
            return;
        }

        let liveStats = this.getCommonLiveStats();
        if (GlobalSettings.enableBookmapWallBreakSwingPullback) {
            let symbol = this.symbol;
            let symbolData = Models.getSymbolData(symbol);
            let defaultPullbackPrice = this.isLong ? symbolData.lowOfDay : symbolData.highOfDay;
            let recentPullbackPrice = this.recentPullbackPrice || defaultPullbackPrice;
            let pullbackPrice = Helper.roundPrice(symbol, recentPullbackPrice);
            let pullbackLabel = this.isLong ? 'pullback low' : 'popup high';
            liveStats += `${pullbackLabel}: ${pullbackPrice}`;
            if (this.inPullbackPhase) {
                liveStats += ' (pulling back)';
            }
        }
        Helper.updateHtmlIfChanged(this.htmlStats, liveStats);
    }

    private getBookmapLogSuffix(): string {
        return this.isLong ? 'bookmap_offer_wall_breakout' : 'bookmap_bid_wall_breakdown';
    }

    triggerEntryCommon(
        dryRun: boolean,
        useMarketOrder: boolean,
        entryPrice: number,
        stopOutPrice: number,
        riskReduction: number,
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
        if (this.waitForPullback) {
            if (this.isLong) {
                Helper.speak('wait for pullback to below the wall');
            } else {
                Helper.speak('wait for pullback to above the wall');
            }
        }

        allowedSize = allowedSize * riskReduction;
        // if entry against vwap, further reduce size by half
        let currentVwap = Models.getCurrentVwap(symbol);
        if (this.isLong) {
            if (entryPrice < currentVwap) {
                Firestore.logInfo(`entry below vwap, reduce size by half`, logTags);
                allowedSize = allowedSize / 2;
            }
        } else {
            if (entryPrice > currentVwap) {
                Firestore.logInfo(`entry above vwap, reduce size by half`, logTags);
                allowedSize = allowedSize / 2;
            }
        }
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
        if (stopOutPrice == 0 && GlobalSettings.enableBookmapWallBreakSwingPullback) {
            // default to swing high/low
            stopOutPrice = this.recentPullbackPrice;
        }
        if (stopOutPrice == 0) {
            // default to high/low of the day
            let symbolData = Models.getSymbolData(symbol);
            stopOutPrice = this.isLong ? symbolData.lowOfDay : symbolData.highOfDay;
        }
        let riskReduction = Helper.getRiskMultiplierFromEntryMethod(parameters.entryMethod);
        Firestore.logInfo(`risk multiplier: ${riskReduction}`, logTags);
        return this.triggerEntryCommon(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskReduction, logTags);
    }

    triggerEntryFromBookmap(useMarketOrder: boolean, stopOutPrice: number): number {
        let symbol = this.symbol;
        let logTags = Models.generateLogTags(symbol, `${symbol}_${this.getBookmapLogSuffix()}`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, this.isLong, useMarketOrder, Models.getDefaultEntryParameters());

        return this.triggerEntryCommon(false, useMarketOrder, entryPrice, stopOutPrice, 0.25, logTags);
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
        //return ["0.25R", "0.5R", "1R"];
        return Helper.returnDefaultEntryMethods();
    }

    getDisallowedReasonToAdjustSingleLimitOrder(
        symbol: string, keyIndex: number, order: Models.OrderModel,
        pair: Models.ExitPair, newPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        let exitCount = Models.getExitPairs(symbol).length;
        let missingCoreInvalidationResult = this.getDisallowedReasonForMissingCoreInvalidationLevelAtKeyIndex(symbol, keyIndex, this.basePlan, logTags);
        if (missingCoreInvalidationResult) {
            return missingCoreInvalidationResult;
        }
        let isMarketOrder = false;
        let newResult = ExitRulesCheckerNew.isAllowedForLimitOrderForAllTradebooks(
            symbol, this.isLong, isMarketOrder, newPrice, keyIndex, pair, logTags);
        if (newResult.allowed) {
            return newResult;
        }
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
        let exitCount = Models.getExitPairs(symbol).length;
        let missingCoreInvalidationResult = this.getDisallowedReasonForMissingCoreInvalidationLevelAtKeyIndex(symbol, keyIndex, this.basePlan, logTags);
        if (missingCoreInvalidationResult) {
            return missingCoreInvalidationResult;
        }
        let isMarketOrder = false;
        let newResult = ExitRulesCheckerNew.isAllowedForSingleOrderForAllTradebooks(
            symbol, this.isLong, isMarketOrder, newPrice, keyIndex, logTags);
        if (newResult.allowed) {
            return newResult;
        }

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
        let exitCount = Models.getExitPairs(symbol).length;
        let missingCoreInvalidationResult = this.getDisallowedReasonForMissingCoreInvalidationLevelAtKeyIndex(symbol, keyIndex, this.basePlan, logTags);
        if (missingCoreInvalidationResult) {
            return missingCoreInvalidationResult;
        }
        let isMarketOrder = true;
        let currentPrice = Models.getCurrentPrice(symbol);
        let newResult = ExitRulesCheckerNew.isAllowedForSingleOrderForAllTradebooks(
            symbol, this.isLong, isMarketOrder, currentPrice, keyIndex, logTags);
        if (newResult.allowed) {
            return newResult;
        }
        let newPrice = Models.getCurrentPrice(symbol);
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

    onNewTimeSalesData(newPrice: number): void {
        if (!GlobalSettings.enableBookmapWallBreakSwingPullback) {
            return;
        }

        let secondsSinceOpen = Helper.getSecondsSinceMarketOpen(new Date());
        if (secondsSinceOpen < 60) {
            return;
        }

        let symbol = this.symbol;
        let symbolData = Models.getSymbolData(symbol);
        let atr = TradingPlans.getTradingPlans(symbol).atr.average;
        if (atr <= 0 || newPrice <= 0) {
            return;
        }

        if (this.isLong) {
            if (symbolData.highOfDay <= 0 || symbolData.lowOfDay <= 0 || symbolData.lowOfDay >= 99999999) {
                return;
            }
            if (!this.hasPullbackPhase) {
                this.recentPullbackPrice = symbolData.lowOfDay;
            }
            let pullbackThreshold = symbolData.highOfDay - atr * 0.1;
            if (this.inPullbackPhase) {
                this.recentPullbackPrice = Math.min(this.recentPullbackPrice, newPrice);
                if (newPrice >= symbolData.highOfDay) {
                    this.inPullbackPhase = false;
                }
            } else if (newPrice <= pullbackThreshold) {
                this.inPullbackPhase = true;
                this.hasPullbackPhase = true;
                this.recentPullbackPrice = newPrice;
            }
        } else {
            if (symbolData.lowOfDay <= 0 || symbolData.lowOfDay >= 99999999 || symbolData.highOfDay <= 0) {
                return;
            }
            if (!this.hasPullbackPhase) {
                this.recentPullbackPrice = symbolData.highOfDay;
            }
            let popupThreshold = symbolData.lowOfDay + atr * 0.1;
            if (this.inPullbackPhase) {
                this.recentPullbackPrice = Math.max(this.recentPullbackPrice, newPrice);
                if (newPrice <= symbolData.lowOfDay) {
                    this.inPullbackPhase = false;
                }
            } else if (newPrice >= popupThreshold) {
                this.inPullbackPhase = true;
                this.hasPullbackPhase = true;
                this.recentPullbackPrice = newPrice;
            }
        }
    }
}
