import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as GlobalSettings from '../config/globalSettings';
import * as ExitRulesCheckerNew from '../controllers/exitRulesCheckerNew';
import * as Helper from '../utils/helper';

export class BookmapWallBreak extends Tradebook {
    private basePlan: TradingPlansModels.GapAndGoPlan;
    private scalpMinCount = 0;
    private coreMinCount = 0;


    constructor(symbol: string, tradebookID: string, basePlan: TradingPlansModels.GapAndGoPlan) {
        super(symbol, tradebookID, true, 'Long Gap & Go Bookmap Offer Wall Breakout', `${Models.TradebookFamilyName.GapAndGo} bookmap`);
        this.basePlan = basePlan;
        this.enableByDefault = true;
        let scalpCount = GlobalSettings.batchCount - basePlan.coreCount - basePlan.runnerCount;
        this.scalpMinCount = GlobalSettings.batchCount - scalpCount;
        this.coreMinCount = GlobalSettings.batchCount - scalpCount - basePlan.coreCount;

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
            if (openVwap == null) {
                Firestore.logError(`mustOpenAboveVwap: need VWAP at open`, logTags);
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
            // default to low of the day
            let symbolData = Models.getSymbolData(symbol);
            stopOutPrice = symbolData.lowOfDay;
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
            reason: "wait for premarket high",
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
            if (newPrice >= this.basePlan.coreTarget) {
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
                    reason: "alow core exit after 10 minutes from open",
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
            if (newPrice >= this.basePlan.coreTarget) {
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
                    reason: "alow core exit after 10 minutes from open",
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
            if (newPrice >= this.basePlan.coreTarget) {
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
                    reason: "alow core exit after 10 minutes from open",
                };
                return allowedReason;

            }
        }
        return newResult;
    }

    onNewTimeSalesData(): void { }
}
