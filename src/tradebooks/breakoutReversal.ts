import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradebookUtil from './tradebookUtil';
import * as LongDocs from './tradebookDocs/breakdownReversalLong';
import * as ShortDocs from './tradebookDocs/breakdownReversalLong';
import * as FalseBreakout from '../patterns/falseBreakout';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';

export class BreakoutReversal extends Tradebook {
    public static readonly reversalLong: string = 'ReversalLong';
    public static readonly reversalShort: string = 'ReversalShort';
    private keyLevel: number = 0;
    private reversalPlan: TradingPlansModels.ReversalPlan;
    public getID(): string {
        return this.isLong ? BreakoutReversal.reversalLong : BreakoutReversal.reversalShort;
    }
    constructor(symbol: string, isLong: boolean, reversalPlan: TradingPlansModels.ReversalPlan) {
        let tradebookName = isLong ? 'Long Reversal' : 'Short Reversal';
        let buttonLabel = isLong ? 'Reversal' : 'Reversal';
        super(symbol, isLong, tradebookName, buttonLabel)
        this.keyLevel = reversalPlan.keyLevel;
        this.reversalPlan = reversalPlan;
        this.enableByDefault = true;
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean): number {
        let symbol = this.symbol;
        let isLong = this.isLong;
        let logTagName = this.isLong ? '_long_reversal' : '_short_reversal';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let stopOutPrice = Chart.getStopLossPrice(symbol, isLong, true, null);
        let defaultRiskLevel = this.reversalPlan.defaultRiskLevel ?? stopOutPrice;
        let riskLevelPrice = Models.getRiskLevelPrice(symbol, isLong, defaultRiskLevel, entryPrice);
        let planCopy = JSON.parse(JSON.stringify(this.reversalPlan)) as TradingPlansModels.ReversalPlan;
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, useMarketOrder, planCopy, logTags);
        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }

        this.submitEntryOrdersBase(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, planCopy, logTags);
        return allowedSize;
    }
    private validateEntry(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean,
        plan: TradingPlansModels.ReversalPlan, logTags: Models.LogTags): number {
        if (!this.isEnabled()) {
            return 0;
        }

        let symbolData = Models.getSymbolData(this.symbol);
        let keyLevel = this.keyLevel;

        if (this.isLong) {
            if (entryPrice < keyLevel) {
                Firestore.logError(`entry price ${entryPrice} is not above key level ${keyLevel}`, logTags);
                return 0;
            }

        } else {
            if (entryPrice > keyLevel) {
                Firestore.logError(`entry price ${entryPrice} is not below key level ${keyLevel}`, logTags);
                return 0;
            }
        }
        // must be on the the opposite side of vwap to avoid vwap shakeout
        // reduce to 50% size if not against vwap
        let multiplier = 1;
        let currentVwap = Models.getCurrentVwap(this.symbol);
        if (this.isLong && entryPrice > currentVwap) {
            Firestore.logError(`entry price ${entryPrice} must be below vwap ${currentVwap} to avoid vwap shakeout`, logTags);
            multiplier = 0.5;
        }
        if (!this.isLong && entryPrice < currentVwap) {
            Firestore.logError(`entry price ${entryPrice} must be above vwap ${currentVwap} to avoid vwap shakeout`, logTags);
            multiplier = 0.5;
        }
        if (this.reversalPlan.requireLevelTouch) {
            if (this.isLong) {
                if (symbolData.lowOfDay > keyLevel) {
                    Firestore.logError(`has not touched key level ${keyLevel}, reduce half size`, logTags);
                    multiplier = 0.5;
                }

            } else {
                if (symbolData.highOfDay < keyLevel) {
                    Firestore.logError(`has not touched key level ${keyLevel}, reduce half size`, logTags);
                    multiplier = 0.5;
                }
            }
        }
        let candles = Models.getCandlesSinceOpenForTimeframe(this.symbol, 1);
        let found = -1;
        for (let i = 0; i < candles.length - 1; i++) {
            let candle = candles[i];
            if (this.isLong) {
                if (candle.high >= keyLevel && candle.low <= keyLevel) {
                    found = i;
                    break;
                }
            } else {
                if (candle.low <= keyLevel && candle.high >= keyLevel) {
                    found = i;
                    break;
                }
            }
        }
        if (found != 1) {
            if (found + 2 < candles.length) {
                //Firestore.logError(`passed time window for reversal setup, ${found}th candle above key level`, logTags);
                //return 0;
                // if we can to re-enable this rule, we should use the last testing candle, 
                // not the first testing candel
            }
        }

        // if closed 3 candles above level, disable this tradebook for the day
        // should use a default risk level to avoid risking too big
        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            this.symbol, this.isLong, entryPrice, stopOutPrice, useMarketOrder, plan, false, logTags);
        return allowedSize * multiplier;
    }

    refreshLiveStats(): void {
        // TODO: Implement live stats refresh
    }

    refreshState(): void {
        // TODO: Implement state refresh
    }

    isEnabled(): boolean {
        return true; // TODO: Implement enable/disable logic
    }

    getCommonLiveStats(): string {
        return ''; // TODO: Implement common live stats
    }

    transitionToState(newState: any): void {
        // TODO: Implement state transition logic
    }

    getTradeManagementInstructions(): Models.TradeManagementInstructions {
        let instructions = new Map<string, string[]>();
        if (this.isLong) {
            instructions = this.getTradeManagementInstructionsForLong();
        } else {
            instructions = this.getTradeManagementInstructionsForShort();
        }
        TradebookUtil.setlevelToAddInstructions(this.symbol, this.isLong, instructions);
        TradebookUtil.setFinalTargetInstructions(this.symbol, this.isLong, instructions);
        let conditionsToFail = this.isLong ? ["lose level"] : ["reclaim level"];
        let result: Models.TradeManagementInstructions = {
            mapData: instructions,
            conditionsToFail: conditionsToFail,
        }
        return result;
    }

    getTradeManagementInstructionsForLong(): Map<string, string[]> {
        const instructions = new Map<string, string[]>([[
            'conditions to fail', [
                "low of day",
            ]], [
            'conditions to trim', [
                "decide how much and whether to trim on first new low below vwap",
            ]], [
            'add or re-entry', [
                "vwap pushdown fail, add back previous partials",
            ]], [
            'partial targets', [
                "about 50%: push to vwap",
            ]]
        ]);
        return instructions;
    }

    getTradeManagementInstructionsForShort(): Map<string, string[]> {
        const instructions = new Map<string, string[]>([[
            'conditions to fail', [
                "high of day",
            ]], [
            'conditions to trim', [
                "decide how much and whether to trim on first new high above vwap",
            ]], [
            'add or re-entry', [
                "vwap bounce fail, add back previous partials",
            ]], [
            'partial targets', [
                "about 50%: dip to vwap",
            ]]
        ]);
        return instructions;
    }
    /** Minimal doc method for now — returns empty string. */
    getTradebookDoc(): string {
        if (this.isLong) {
            return LongDocs.tradebookText;
        } else {
            return ShortDocs.tradebookText;
        }
    }

    getEntryMethods(): string[] {
        return [];
    }

    getNumberOfMinutesSinceBreakout(): number {
        let candles = Models.getM1ClosedCandlesSinceOpen(this.symbol);
        let breakoutDirection = !this.isLong;
        let breakoutCandleIndex = -1;
        for (let i = 0; i < candles.length; i++) {
            let candle = candles[i];
            if (breakoutDirection && candle.close > this.keyLevel) {
                breakoutCandleIndex = i;
                break;
            }
            if (!breakoutDirection && candle.close < this.keyLevel) {
                breakoutCandleIndex = i;
                break;
            }
        }
        if (breakoutCandleIndex == -1) {
            return 0;
        }
        return candles.length - breakoutCandleIndex;
    }
    checkEarlyExits(): Models.CheckRulesResult {
        if (FalseBreakout.isConfirmedFalseBreakout(this.symbol, this.isLong, this.keyLevel)) {
            let numberOfMinutesSinceBreakout = this.getNumberOfMinutesSinceBreakout();
            if (numberOfMinutesSinceBreakout < 5) {
                return {
                    allowed: false,
                    reason: "confirmed false breakout within 5 minutes",
                };
            }
        }
        let result: Models.CheckRulesResult = {
            allowed: true,
            reason: "reversal tradebook",
        };
        return result;
    }

    getDisallowedReasonToAdjustSingleLimitOrder(symbol: string, keyIndex: number, order: Models.OrderModel, pair: Models.ExitPair, newPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        return this.checkEarlyExits();
    }

    getDisallowedReasonToAdjustSingleStopOrder(symbol: string, keyIndex: number, order: Models.OrderModel, pair: Models.ExitPair, newPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        return this.checkEarlyExits();
    }

    getDisallowedReasonToMarketOutSingleOrder(symbol: string, keyIndex: number, logTags: Models.LogTags): Models.CheckRulesResult {
        return this.checkEarlyExits();
    }
    onNewCandleClose(): void {

        // consider making a pop out or add a time limit
        return;
        let breakoutDirection = !this.isLong;
        let closedCandles = Models.getM1ClosedCandlesSinceOpen(this.symbol);
        if (FalseBreakout.isBreakoutOnFirstRally(closedCandles, this.keyLevel, breakoutDirection)) {
            FalseBreakout.oneClosedAboveNextClosedBelowJustHappened(closedCandles, this.keyLevel, breakoutDirection);
            // trigger auto entry
            let logTagName = this.isLong ? '_long_reversal' : '_short_reversal';
            let logTags = Models.generateLogTags(this.symbol, `${this.symbol}_${logTagName}`);

            let lastClosedCandle = closedCandles[closedCandles.length - 1];
            let entryPrice = this.isLong ? lastClosedCandle.high : lastClosedCandle.low;
            let symbolData = Models.getSymbolData(this.symbol);
            let stopOutPrice = this.isLong ? symbolData.lowOfDay : symbolData.highOfDay;
            let defaultRiskLevel = this.reversalPlan.defaultRiskLevel ?? stopOutPrice;
            let riskLevelPrice = Models.getRiskLevelPrice(this.symbol, this.isLong, defaultRiskLevel, entryPrice);
            let allowedSize = this.validateEntry(entryPrice, stopOutPrice, false, this.reversalPlan, logTags);
            if (allowedSize === 0) {
                Firestore.logError(`${this.symbol} not allowed entry`, logTags);
                return;
            }
            let planCopy = JSON.parse(JSON.stringify(this.reversalPlan)) as TradingPlansModels.ReversalPlan;
            this.submitEntryOrdersBase(false, false, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, this.reversalPlan, logTags);
        }
    }
}