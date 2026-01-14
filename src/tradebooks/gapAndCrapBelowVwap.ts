import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradebookUtil from './tradebookUtil';
import * as Helper from '../utils/helper';
import * as Rules from '../algorithms/rules';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';

export class GapAndCrapBelowVwap extends Tradebook {
    public static readonly gapAndCrapBelowVwapShort: string = 'G_crap BelowVwap';
    private gapAndCrapPlan: TradingPlansModels.GapAndCrapPlan;

    public getID(): string {
        return GapAndCrapBelowVwap.gapAndCrapBelowVwapShort;
    }

    constructor(symbol: string, isLong: boolean, plan: TradingPlansModels.GapAndCrapPlan) {
        // This tradebook only supports short positions
        if (isLong) {
            throw new Error('GapAndCrapBelowVwap tradebook only supports short positions');
        }
        let tradebookName = 'Gap and Crap Below VWAP';
        let buttonLabel = 'G_crap BelowVwap';
        super(symbol, false, tradebookName, buttonLabel);
        this.gapAndCrapPlan = plan;
        this.enableByDefault = false;
    }

    refreshLiveStats(): void {
        // TODO: Implement live stats refresh if needed
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let isLong = false; // This tradebook only supports short
        let logTagName = '_short_gap_and_crap_below_vwap';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let symbolData = Models.getSymbolData(symbol);
        let stopOutPrice = symbolData.highOfDay;
        let riskLevelPrice = Models.getRiskLevelPrice(symbol, isLong, this.gapAndCrapPlan.defaultRiskLevel, entryPrice);
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, useMarketOrder, logTags);

        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }

        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, logTags);
        return allowedSize;
    }

    validateEntry(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, logTags: Models.LogTags): number {
        let symbolData = Models.getSymbolData(this.symbol);
        let openPrice = Models.getOpenPrice(this.symbol);
        let lastVwapBeforeOpen = Models.getLastVwapBeforeOpen(this.symbol);

        if (!openPrice) {
            Firestore.logError(`missing open price`, logTags);
            return 0;
        }

        // Open must be below VWAP
        if (openPrice >= lastVwapBeforeOpen) {
            Firestore.logError(`open ${openPrice} must be below VWAP ${lastVwapBeforeOpen}`, logTags);
            return 0;
        }

        // Check if price has started to reverse (crap part)
        // For short, price should be moving down from the gap up open
        let currentPrice = Models.getCurrentPrice(this.symbol);
        if (currentPrice >= openPrice) {
            Firestore.logError(`price not reversing down from gap up, current: ${currentPrice}, open: ${openPrice}`, logTags);
            return 0;
        }

        // Check timing - should be within first hour
        let secondsSinceOpen = Helper.getSecondsSinceMarketOpen(new Date());
        if (secondsSinceOpen > 3600) {
            Firestore.logError(`too late for gap and crap, ${secondsSinceOpen} seconds since open`, logTags);
            return 0;
        }

        if (useMarketOrder) {
            let currentCandle = Models.getCurrentCandle(this.symbol);
            if (currentCandle.close > currentCandle.open) {
                Firestore.logError(`current candle is against momentum, use stop order instead`, logTags);
                return 0;
            }
        }

        // Use basic global entry rules
        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            this.symbol, false, entryPrice, stopOutPrice, useMarketOrder,
            this.gapAndCrapPlan, false, logTags);
        return allowedSize;
    }

    submitEntryOrders(dryRun: boolean, useMarketOrder: boolean,
        entryPrice: number, stopOutPrice: number, riskLevel: number,
        allowedSize: number, logTags: Models.LogTags): void {
        let planCopy = JSON.parse(JSON.stringify(this.gapAndCrapPlan)) as TradingPlansModels.GapAndCrapPlan;
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
        let tightStopLevels = TradebookUtil.getTightStopLevelsForTrend(this.symbol, false);
        return tightStopLevels;
    }

    getTradebookDoc(): string {
        return "";
    }

    getTradeManagementInstructions(): Models.TradeManagementInstructions {
        let instructions = this.getTradeManagementInstructionsForShort();
        TradebookUtil.setlevelToAddInstructions(this.symbol, false, instructions);
        TradebookUtil.setFinalTargetInstructions(this.symbol, false, instructions);

        let conditionsToFail = ["new high of day, lose gap reversal momentum"];

        let result: Models.TradeManagementInstructions = {
            mapData: instructions,
            conditionsToFail: conditionsToFail,
        };
        return result;
    }

    getTradeManagementInstructionsForShort(): Map<string, string[]> {
        const instructions = new Map<string, string[]>([
            ['conditions to fail', [
                'new high of day breakout',
                'reclaim open price (gap fill fails)',
            ]],
            ['conditions to trim', [
                'first new high after initial fade',
                'M5 reversal candle',
            ]],
            ['add or re-entry', [
                'add on open price rejection if weak',
                'add on VWAP rejection',
            ]],
            ['partial targets', [
                "25-40%: first leg fade toward previous close",
                "40-60%: approach previous day close",
                "60-80%: reclaim previous day close",
                "80-100%: extended target beyond previous close",
            ]]
        ]);
        return instructions;
    }

    onNewTimeSalesData(): void {
        // Disable after first 60 minutes
        let secondsSinceOpen = Helper.getSecondsSinceMarketOpen(new Date());
        if (secondsSinceOpen > 3600) {
            if (this.isEnabled()) {
                this.disable();
            }
            return;
        }
    }

    getEntryMethods(): string[] {
        return [];
    }
}
