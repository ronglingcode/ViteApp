import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradebookUtil from './tradebookUtil';

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
        let riskLevelPrice = Models.getRiskLevelPrice(symbol, stopOutPrice);
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, logTags);
        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }

        this.submitEntryOrdersBase(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, this.reversalPlan, logTags);
        return allowedSize;
    }
    private validateEntry(entryPrice: number, stopOutPrice: number, logTags: Models.LogTags): number {
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
        let currentVwap = Models.getCurrentVwap(this.symbol);
        if (this.isLong && entryPrice > currentVwap) {
            Firestore.logError(`entry price ${entryPrice} must be below vwap ${currentVwap} to avoid vwap shakeout`, logTags);
            return 0;
        }
        if (!this.isLong && entryPrice < currentVwap) {
            Firestore.logError(`entry price ${entryPrice} must be above vwap ${currentVwap} to avoid vwap shakeout`, logTags);
            return 0;
        }
        // TODO: check more global rules
        // TODO: if closed multiple candles above level, disable this tradebook for the day
        return 0.21 / 2;
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
        return "";
    }
}