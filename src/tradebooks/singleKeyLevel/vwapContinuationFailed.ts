import { SingleKeyLevelTradebook } from './singleKeyLevelTradebook'
import type * as TradingPlansModels from '../../models/tradingPlans/tradingPlansModels'
import * as CommonRules from './commonRules'
import * as Chart from '../../ui/chart';
import * as Firestore from '../../firestore';
import * as Models from '../../models/models';
import * as Helper from '../../utils/helper';
import * as Patterns from '../../algorithms/patterns';
import * as TradingPlans from '../../models/tradingPlans/tradingPlans';
import * as Calculator from '../../utils/calculator';
import * as ExitRulesCheckerNew from '../../controllers/exitRulesCheckerNew';
import * as Rules from '../../algorithms/rules';
import * as GlobalSettings from '../../config/globalSettings';
import * as LongDocs from '../tradebookDocs/vwapPushdownFail';
import * as ShortDocs from '../tradebookDocs/vwapBounceFail';
import * as VwapPatterns from '../../algorithms/vwapPatterns';
enum EntryMethod {
    ClosedCandle = 'Closed Candle',
    LiveCandle = 'Live Candle',
    M5NewHighLow = 'M5 NewHighLow',
    M15NewHighLow = 'M15 NewHighLow',
    M30NewHighLow = 'M30 NewHighLow',
}
export class VwapContinuationFailed extends SingleKeyLevelTradebook {
    public static readonly longVwapPushDownFailed: string = 'LongVwapPushdownFailed';
    public static readonly shortVwapBounceFailed: string = 'ShortVwapBounceFailed';
    public waitForClose: boolean = true;
    public disableExitRules: boolean = false;
    public getID(): string {
        return this.buildID(this.isLong ? VwapContinuationFailed.longVwapPushDownFailed : VwapContinuationFailed.shortVwapBounceFailed);
    }
    constructor(familyName: string, symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
        levelMomentumPlan: TradingPlansModels.LevelMomentumPlan) {
        let tradebookName = isLong ? 'Long VWAP Bounce Failed' : 'Short VWAP Pushdown Failed';
        let buttonLabel = isLong ? 'Vwap Pushdown Fail' : 'Vwap Bounce Fail';
        if (familyName == Models.TradebookFamilyName.GapAndCrap) {
            tradebookName = 'Gap and Crap Short VWAP Bounce Fail';
            buttonLabel = `${Models.TradebookFamilyName.GapAndCrap} VWAP Bounce Fail`;
        }
        super(familyName, symbol, isLong, keyLevel, levelMomentumPlan, tradebookName, buttonLabel);
    }

    public updateConfig(config: TradingPlansModels.TradebooksConfig): void {
        if (this.isLong) {
            if (!config.vwap_level_open.longVwapPushdownFail.waitForClose) {
                this.waitForClose = false;
            }
            if (!config.vwap_open_level.longVwapPushdownFail.waitForClose) {
                this.waitForClose = false;
            }
        } else {
            if (!config.level_open_vwap.shortVwapBounceFail.waitForClose) {
                this.waitForClose = false;
            }
            if (!config.open_level_vwap.shortVwapBounceFail.waitForClose) {
                this.waitForClose = false;
            }
        }
    }

    refreshLiveStats(): void {
        if (!this.isEnabled() || !GlobalSettings.allowLiveStats) {
            Helper.updateHtmlIfChanged(this.htmlStats, '');
            return;
        }
        let symbol = this.symbol;

        let topPlan = TradingPlans.getTradingPlans(symbol);
        let atr = topPlan.atr.average;
        let currentVwap = Models.getCurrentVwap(symbol);
        let distanceFromKeyLevelToVwap = Math.abs(this.getKeyLevel() - currentVwap);
        let distanceFromKeyLevelToVwapInAtrPercentageString = Calculator.getPercentageString(distanceFromKeyLevelToVwap, atr, 0);
        let liveStats = this.getCommonLiveStats();
        liveStats += `level to vwap: ${distanceFromKeyLevelToVwapInAtrPercentageString} atr`;
        Helper.updateHtmlIfChanged(this.htmlStats, liveStats);
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let logTagName = this.isLong ? '_vwap-continuation-failed' : '_vwap-continuation-failed';
        let logTags = Models.generateLogTags(this.symbol, `${this.symbol}_${logTagName}`);
        let entryMethod = parameters.entryMethod;
        if (!entryMethod) {
            Firestore.logError(`${this.symbol} entry method is missing`, logTags);
            return 0;
        }
        parameters.useCurrentCandleHigh = false;
        parameters.useFirstNewHigh = false;
        parameters.useMarketOrderWithTightStop = false;

        let entryPrice = Chart.getBreakoutEntryPrice(this.symbol, this.isLong, useMarketOrder, parameters);
        let stopOutPrice = Chart.getStopLossPrice(this.symbol, this.isLong, true, null);

        let allowedSize = 0;
        if (entryMethod == EntryMethod.ClosedCandle) {
            allowedSize = this.validateEntry(entryPrice, stopOutPrice, useMarketOrder, true, logTags);
        } else if (entryMethod == EntryMethod.LiveCandle) {
            allowedSize = this.validateEntry(entryPrice, stopOutPrice, useMarketOrder, false, logTags);
        } else if (entryMethod == EntryMethod.M5NewHighLow) {
            allowedSize = this.validateEntryForHigherTimeframe(entryPrice, stopOutPrice, useMarketOrder, 5, logTags);
        } else if (entryMethod == EntryMethod.M15NewHighLow) {
            allowedSize = this.validateEntryForHigherTimeframe(entryPrice, stopOutPrice, useMarketOrder, 15, logTags);
        } else if (entryMethod == EntryMethod.M30NewHighLow) {
            allowedSize = this.validateEntryForHigherTimeframe(entryPrice, stopOutPrice, useMarketOrder, 30, logTags);
        }
        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }

        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, stopOutPrice, allowedSize, entryMethod, logTags);
        return allowedSize;
    }
    private validateEntryForHigherTimeframe(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean,
        timeframe: number, logTags: Models.LogTags): number {
        let symbol = this.symbol;
        let isLong = this.isLong;
        let candles = Models.getCandlesSinceOpenForTimeframe(symbol, timeframe);
        let vwaps = Models.getVwapsSinceOpenForTimeframe(symbol, timeframe);
        let entryPriceBreaksCandleAndVwap = false;
        for (let i = 0; i < candles.length - 1; i++) {
            let candle = candles[i];
            let vwap = vwaps[i];
            // candle must has one side favor vwap
            if (isLong) {
                if (entryPrice >= candle.high && candle.high >= vwap.value) {
                    entryPriceBreaksCandleAndVwap = true;
                    break;
                }
            } else {
                if (entryPrice <= candle.low && candle.low <= vwap.value) {
                    entryPriceBreaksCandleAndVwap = true;
                    break;
                }
            }
        }
        if (!entryPriceBreaksCandleAndVwap) {
            Firestore.logError(`${this.symbol} entry price ${entryPrice} does not break candle and vwap for M${timeframe}`, logTags);
            return 0;
        }
        let allowedSize = CommonRules.validateCommonEntryRules(
            this.symbol, this.isLong, entryPrice, stopOutPrice, useMarketOrder, this.keyLevel, this.levelMomentumPlan, false, true, logTags);
        return allowedSize;
    }
    private validateEntry(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, waitForClose: boolean, logTags: Models.LogTags): number {
        // must be on the momentum side of vwap
        let symbol = this.symbol;
        let isLong = this.isLong;
        let vwap = Models.getCurrentVwap(symbol);
        if (isLong && entryPrice < vwap) {
            Firestore.logError(`checkRule: entry price ${entryPrice} is below vwap for long`, logTags);
            Helper.speak(`not above vwap yet`);
        }
        if (!isLong && entryPrice > vwap) {
            Firestore.logError(`checkRule: entry price ${entryPrice} is above vwap for short`, logTags);
            Helper.speak(`not below vwap yet`);
        }
        if (Rules.isReverseOfMomentumCandle(this.symbol, this.isLong, useMarketOrder)) {
            let errorMessage = "cannot market long when current candle is red";
            if (!this.isLong) {
                errorMessage = "cannot market short when current candle is green";
            }
            Firestore.logError(`checkRule: ${errorMessage}`, logTags);
            return 0;
        }
        if (waitForClose) {
            if (this.isLong) {
                let vwapPatternSatus = VwapPatterns.getStatusForVwapPushdownFail(this.symbol);
                Firestore.logInfo(`vwap pattern status: ${JSON.stringify(vwapPatternSatus)}`, logTags);
                if (vwapPatternSatus != "pushing down from vwap") {
                    Firestore.logError(`not pushing down from vwap yet`, logTags);
                    return 0;
                }
            } else {
                let vwapPatternSatus = VwapPatterns.getStatusForVwapBounceFail(this.symbol);
                Firestore.logInfo(`vwap pattern status: ${JSON.stringify(vwapPatternSatus)}`, logTags);
                if (vwapPatternSatus != "bouncing off vwap") {
                    Firestore.logError(`not bouncing off vwap yet`, logTags);
                    return 0;
                }
            }
        }

        let allowedSize = CommonRules.validateCommonEntryRules(
            this.symbol, this.isLong, entryPrice, stopOutPrice, useMarketOrder, this.keyLevel, this.levelMomentumPlan, false, true, logTags);
        return allowedSize;
    }

    getDisallowedReasonToAdjustSingleLimitOrder(
        symbol: string, keyIndex: number, order: Models.OrderModel,
        pair: Models.ExitPair, newPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        if (this.disableExitRules) {
            return {
                allowed: true,
                reason: "disabled",
            };
        }
        let result: Models.CheckRulesResult = {
            allowed: false,
            reason: "default disallow",
        };
        let isMarketOrder = false;

        let newResult = ExitRulesCheckerNew.isAllowedForLimitOrderForAllTradebooks(
            symbol, this.isLong, isMarketOrder, newPrice, keyIndex, pair, logTags);
        if (newResult.allowed) {
            return newResult;
        }
        if (Patterns.isPriceWorseThanVwap(symbol, this.isLong, newPrice)) {
            result.reason = "lose vwap";
            result.allowed = true;
            return result;
        }

        return result;
    }

    getDisallowedReasonToAdjustSingleStopOrder(
        symbol: string, keyIndex: number, order: Models.OrderModel, pair: Models.ExitPair, newPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        if (this.disableExitRules) {
            return {
                allowed: true,
                reason: "disabled",
            };
        }
        let result: Models.CheckRulesResult = {
            allowed: false,
            reason: "default disallow",
        };
        let isMarketOrder = false;
        let newResult = ExitRulesCheckerNew.isAllowedForSingleOrderForAllTradebooks(
            symbol, this.isLong, isMarketOrder, newPrice, keyIndex, logTags);
        if (newResult.allowed) {
            return newResult;
        }

        if (Patterns.isPriceWorseThanVwap(symbol, this.isLong, newPrice)) {
            result.reason = "new price is worse than vwap";
            result.allowed = true;
            return result;
        }

        return result;
    }

    getDisallowedReasonToMarketOutSingleOrder(symbol: string, keyIndex: number, logTags: Models.LogTags): Models.CheckRulesResult {
        if (this.disableExitRules) {
            return {
                allowed: true,
                reason: "disabled",
            };
        }
        let result: Models.CheckRulesResult = {
            allowed: false,
            reason: "default disallow",
        };
        let isMarketOrder = true;
        let currentPrice = Models.getCurrentPrice(symbol);
        let newResult = ExitRulesCheckerNew.isAllowedForSingleOrderForAllTradebooks(
            symbol, this.isLong, isMarketOrder, currentPrice, keyIndex, logTags);
        if (newResult.allowed) {
            return newResult;
        }
        if (Patterns.isPriceWorseThanVwap(symbol, this.isLong, currentPrice)) {
            result.reason = "lose vwap";
            result.allowed = true;
            return result;
        }

        return result;
    }

    getEligibleEntryParameters(): Models.TradebookEntryParameters {
        return {
            useCurrentCandleHigh: true,
            useFirstNewHigh: true,
            useMarketOrderWithTightStop: false,
        }
    }

    getTradebookDoc(): string {
        if (this.isLong) {
            return LongDocs.tradebookText;
        } else {
            return ShortDocs.tradebookText;
        }
    }

    getEntryMethods(): string[] {
        let methods1: string[] = [
            EntryMethod.ClosedCandle,
            EntryMethod.M5NewHighLow,
            EntryMethod.M15NewHighLow,
            EntryMethod.M30NewHighLow
        ];
        let methods2 = [
            EntryMethod.LiveCandle,
            ...methods1
        ];
        if (this.waitForClose) {
            return methods1;
        } else {
            return methods2;
        }
    }
}