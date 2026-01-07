import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradebookUtil from './tradebookUtil';
import * as Helper from '../utils/helper';
import * as ShortDocs from './tradebookDocs/openProfitTakingShort';
import * as Rules from '../algorithms/rules';

export class OpenProfitTaking extends Tradebook {
    public static readonly openProfitTakingLong: string = 'OpenProfitTakingLong';
    public static readonly openProfitTakingShort: string = 'OpenProfitTakingShort';
    private openProfitTakingPlan: TradingPlansModels.OpenProfitTakingPlan;

    public getID(): string {
        return this.isLong ? OpenProfitTaking.openProfitTakingLong : OpenProfitTaking.openProfitTakingShort;
    }
    isEnabled(): boolean {
        return true; // TODO: Implement enable/disable logic
    }
    constructor(symbol: string, isLong: boolean, profitTakingPlan: TradingPlansModels.OpenProfitTakingPlan) {
        let tradebookName = isLong ? 'Long Open Profit Taking' : 'Short Open Profit Taking';
        let buttonLabel = 'Open Profit Taking';
        super(symbol, isLong, tradebookName, buttonLabel);
        this.openProfitTakingPlan = profitTakingPlan;
        this.enableByDefault = true;
    }

    refreshLiveStats(): void {
        // TODO: Implement live stats refresh if needed
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let isLong = this.isLong;
        let logTagName = this.isLong ? '_long_open_profit_taking' : '_short_open_profit_taking';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let symbolData = Models.getSymbolData(symbol);
        let stopOutPrice = isLong ? symbolData.lowOfDay : symbolData.highOfDay;
        let riskLevel = Models.getRiskLevelPrice(symbol, this.openProfitTakingPlan.defaultRiskLevel);
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, useMarketOrder, logTags);

        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }

        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevel, allowedSize, logTags);
        return allowedSize;
    }

    validateEntry(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, logTags: Models.LogTags): number {
        // TODO: Add more validation rules as needed
        let openPrice = Models.getCurrentPrice(this.symbol);
        if (this.isLong) {
            if (openPrice < this.openProfitTakingPlan.mustOpenWithin) {
                Firestore.logError(`open price ${openPrice} < threshold ${this.openProfitTakingPlan.mustOpenWithin}`, logTags);
                return 0;
            }
        } else {
            if (openPrice > this.openProfitTakingPlan.mustOpenWithin) {
                Firestore.logError(`open price ${openPrice} > threshold ${this.openProfitTakingPlan.mustOpenWithin}`, logTags);
                return 0;
            }
        }

        if (useMarketOrder) {
            let currentCandle = Models.getCurrentCandle(this.symbol);
            if ((!this.isLong && currentCandle.close > currentCandle.open) ||
            (this.isLong && currentCandle.close < currentCandle.open)) {
                Firestore.logError(`current candle is against momentum, use stop order instead`, logTags);
                return 0;
            }
        }

        if (!Rules.isAllowedByVwapContinuation(this.symbol, this.isLong, entryPrice)) {
            Firestore.logError(`entry price is not allowed by vwap continuation`, logTags);
            return 0;
        }

        return 0.21;
    }

    submitEntryOrders(dryRun: boolean, useMarketOrder: boolean,
        entryPrice: number, stopOutPrice: number, riskLevel: number,
        allowedSize: number, logTags: Models.LogTags): void {
        let planCopy = JSON.parse(JSON.stringify(this.openProfitTakingPlan)) as TradingPlansModels.OpenProfitTakingPlan;
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

    getCommonLiveStats(): string {
        return super.getCommonLiveStats();
    }

    getTightStopLevels(): Models.DisplayLevel[] {
        let tightStopLevels = TradebookUtil.getTightStopLevelsForTrend(this.symbol, this.isLong);
        return tightStopLevels;
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

        let conditionsToFail = this.isLong
            ? ["new low of day, lose key support"]
            : ["new high of day, reclaim key resistance"];

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
                'lose open price',
            ]],
            ['conditions to trim', [
                'first new low after initial bounce',
                'M5 reversal candle',
            ]],
            ['add or re-entry', [
                'add on open price reclaim if strong',
                'add on VWAP hold',
            ]],
            ['partial targets', [
                "25-40%: first leg bounce toward open",
                "40-60%: approach open price",
                "60-80%: reclaim open and push to VWAP",
                "80-100%: VWAP reclaim, extended target",
            ]]
        ]);
        return instructions;
    }

    getTradeManagementInstructionsForShort(): Map<string, string[]> {
        const instructions = new Map<string, string[]>([
            ['conditions to fail', [
                'new high of day breakout',
                'reclaim open price',
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
                "25-40%: first leg fade toward open",
                "40-60%: approach open price",
                "60-80%: lose open and drop to VWAP",
                "80-100%: VWAP breakdown, extended target",
            ]]
        ]);
        return instructions;
    }

    onNewTimeSalesData(): void {
        // Monitor for optimal entry conditions
        let candles = Models.getCandlesFromM1SinceOpen(this.symbol);
        if (candles.length === 0) {
            return;
        }

        // Disable after first 60 minutes
        let secondsSinceOpen = Helper.getSecondsSinceMarketOpen(new Date());
        if (secondsSinceOpen > 3600) {
            if (this.isEnabled()) {
                this.disable();
            }
            return;
        }
    }

    getTradebookDoc(): string {
        if (this.isLong) {
            return "";
        } else {
            return ShortDocs.tradebookText;
        }
    }

    getEntryMethods(): string[] {
        return [];
    }
}

