import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradebookUtil from './tradebookUtil';
import * as Helper from '../utils/helper';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as VwapPatterns from '../algorithms/vwapPatterns';

export class GapAndGo extends Tradebook {
    public static readonly gapAndGoLong: string = 'GapAndGoLong';
    private basePlan: TradingPlansModels.GapAndGoPlan;

    public getID(): string {
        return GapAndGo.gapAndGoLong;
    }

    constructor(symbol: string, isLong: boolean, basePlan: TradingPlansModels.GapAndGoPlan) {
        // This tradebook only supports long positions
        if (!isLong) {
            throw new Error('GapAndGo tradebook only supports long positions');
        }
        let tradebookName = 'Long Gap and Go';
        let buttonLabel = 'Gap and Go';
        super(symbol, true, tradebookName, buttonLabel);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    refreshLiveStats(): void {
        // TODO: Implement live stats refresh if needed
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let isLong = true; // This tradebook only supports long
        let entryMethod = parameters.entryMethod;

        let logTagName = '_long_gap_and_go';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let symbolData = Models.getSymbolData(symbol);
        let stopOutPrice = symbolData.lowOfDay;
        let defaultRiskLevel = this.basePlan.defaultRiskLevel ?? stopOutPrice;
        let riskLevelPrice = Models.getRiskLevelPrice(symbol, isLong, defaultRiskLevel, entryPrice);
        if (entryMethod === 'LOD') {
            riskLevelPrice = symbolData.lowOfDay;
        }
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, useMarketOrder, logTags);

        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }

        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, logTags);
        return allowedSize;
    }

    validateEntry(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, logTags: Models.LogTags): number {
        let minSupport = this.basePlan.support.low;
        if (entryPrice < minSupport) {
            Firestore.logError(`entry price ${entryPrice} is below min daily support ${minSupport}`, logTags);
            return 0;
        }
        let openPrice = Models.getOpenPrice(this.symbol);
        let openVwap = Models.getLastVwapBeforeOpen(this.symbol);
        // if open below vwap, once it gets above it, it cannot close 2 candles below vwap to lose momentum
        if (openPrice && openVwap && openPrice < openVwap) {
            let hasReclaimedVwap = false;
            let candles = Models.getM1ClosedCandlesSinceOpen(this.symbol);
            for (let i = 0; i < candles.length; i++) {
                let candle = candles[i];
                if (candle.close > openVwap) {
                    hasReclaimedVwap = true;
                    break;
                }
            }
            let lastTwoCandlesCloseBelowVwap = false;
            if (candles.length >= 2) {
                let lastCandle = candles[candles.length - 1];
                let prevCandle = candles[candles.length - 2];
                if (lastCandle.close < openVwap && prevCandle.close < openVwap) {
                    lastTwoCandlesCloseBelowVwap = true;
                }
            }
            if (hasReclaimedVwap && lastTwoCandlesCloseBelowVwap) {
                Firestore.logError(`reclaimed vwap but now 2 candles closed below vwap, giving up M1`, logTags);
                return 0;
            }
        }
        // Use basic global entry rules
        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            this.symbol, true, entryPrice, stopOutPrice, useMarketOrder,
            this.basePlan, false, logTags);
        let currentVwap = Models.getCurrentVwap(this.symbol);
        if (entryPrice < currentVwap) {
            let notTooFar = minSupport + Models.getAtrThreshold(this.symbol) * Models.getAtr(this.symbol).average;
            if (entryPrice > notTooFar) {
                Firestore.logError(`entry price ${entryPrice} is too far from min support ${minSupport} by more than 0.5 ATR at ${notTooFar}`, logTags);
                return 0;
            } else {
                return allowedSize * 0.5;
            }
        }
        return allowedSize;
    }

    submitEntryOrders(dryRun: boolean, useMarketOrder: boolean,
        entryPrice: number, stopOutPrice: number, riskLevel: number,
        allowedSize: number, logTags: Models.LogTags): void {
        let planCopy = JSON.parse(JSON.stringify(this.basePlan)) as TradingPlansModels.BasePlan;
        this.submitEntryOrdersBase(
            dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevel, allowedSize, planCopy, logTags);
    }

    getEligibleEntryParameters(): Models.TradebookEntryParameters {
        return {
            useCurrentCandleHigh: false,
            useFirstNewHigh: false,
            useMarketOrderWithTightStop: false,
        };
    }

    refreshState(): void {
        // TODO: Implement state refresh logic if needed
    }

    transitionToState(newState: any): void {
        // TODO: Implement state transition logic if needed
    }

    isEnabled(): boolean {
        return true; // TODO: Implement enable/disable logic
    }

    getCommonLiveStats(): string {
        return super.getCommonLiveStats();
    }

    getTightStopLevels(): Models.DisplayLevel[] {
        let tightStopLevels = TradebookUtil.getTightStopLevelsForTrend(this.symbol, true);
        return tightStopLevels;
    }

    getTradebookDoc(): string {
        return "";
    }

    getTradeManagementInstructions(): Models.TradeManagementInstructions {
        let instructions = this.getTradeManagementInstructionsForLong();
        TradebookUtil.setlevelToAddInstructions(this.symbol, true, instructions);
        TradebookUtil.setFinalTargetInstructions(this.symbol, true, instructions);

        let conditionsToFail = ["new low of day, lose gap continuation momentum"];

        let result: Models.TradeManagementInstructions = {
            mapData: instructions,
            conditionsToFail: conditionsToFail,
        };
        return result;
    }

    getTradeManagementInstructionsForLong(): Map<string, string[]> {
        const instructions = new Map<string, string[]>([
            ['conditions to fail', [
                'new low of day breakdown',
                'reclaim open price (gap fill fails)',
            ]],
            ['conditions to trim', [
                'first new low after initial push',
                'M5 reversal candle',
            ]],
            ['add or re-entry', [
                'add on open price rejection if strong',
                'add on VWAP rejection',
            ]],
            ['partial targets', [
                "25-40%: first leg push toward previous close",
                "40-60%: approach previous day close",
                "60-80%: reclaim previous day close",
                "80-100%: extended target beyond previous close",
            ]]
        ]);
        return instructions;
    }

    onNewTimeSalesData(): void {

    }

    getEntryMethods(): string[] {
        return [
            'default',
            'LOD'
        ];
    }
}
