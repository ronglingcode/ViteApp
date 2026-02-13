import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradebookUtil from './tradebookUtil';
import * as Helper from '../utils/helper';
import * as Rules from '../algorithms/rules';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';

export class GapAndCrapAcceleration extends Tradebook {
    public static readonly gapAndCrapAccelerationShort: string = 'G_crap Acc';
    private gapAndCrapAccelerationPlan: TradingPlansModels.GapAndCrapAccelerationPlan;

    public getID(): string {
        return GapAndCrapAcceleration.gapAndCrapAccelerationShort;
    }

    constructor(symbol: string, isLong: boolean, plan: TradingPlansModels.GapAndCrapAccelerationPlan) {
        // This tradebook only supports short positions
        if (isLong) {
            throw new Error('GapAndCrapAcceleration tradebook only supports short positions');
        }
        let tradebookName = 'Gap and Crap Acceleration';
        let buttonLabel = 'G_crap Acc';
        super(symbol, false, tradebookName, buttonLabel);
        this.gapAndCrapAccelerationPlan = plan;
        this.enableByDefault = false;
    }

    refreshLiveStats(): void {
        // TODO: Implement live stats refresh if needed
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let isLong = false; // This tradebook only supports short
        let logTagName = '_short_gap_and_crap_acceleration';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let symbolData = Models.getSymbolData(symbol);
        let stopOutPrice = symbolData.highOfDay;
        let riskLevelPrice = Models.chooseRiskLevel(symbol, isLong, entryPrice, stopOutPrice, this.gapAndCrapAccelerationPlan.defaultRiskLevels);
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
        let accelerationLevel = this.gapAndCrapAccelerationPlan.accelerationLevel;

        if (!openPrice) {
            Firestore.logError(`missing open price`, logTags);
            return 0;
        }

        // Entry must be below acceleration level
        if (entryPrice >= accelerationLevel) {
            Firestore.logError(`entry price ${entryPrice} must be below acceleration level ${accelerationLevel}`, logTags);
            return 0;
        }

        // If open is above acceleration level, need to wait for 1 minute close below it
        if (openPrice >= accelerationLevel) {
            let closedCandles = Models.getM1ClosedCandlesSinceOpen(this.symbol);
            let hasClosedBelow = false;
            for (let i = 0; i < closedCandles.length; i++) {
                if (closedCandles[i].close < accelerationLevel) {
                    hasClosedBelow = true;
                    break;
                }
            }
            if (!hasClosedBelow) {
                Firestore.logError(`open ${openPrice} is above acceleration level ${accelerationLevel}, waiting for 1 minute close below it`, logTags);
                return 0;
            }
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
            this.gapAndCrapAccelerationPlan, false, logTags);
        return allowedSize;
    }

    submitEntryOrders(dryRun: boolean, useMarketOrder: boolean,
        entryPrice: number, stopOutPrice: number, riskLevel: number,
        allowedSize: number, logTags: Models.LogTags): void {
        let planCopy = JSON.parse(JSON.stringify(this.gapAndCrapAccelerationPlan)) as TradingPlansModels.GapAndCrapAccelerationPlan;
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
