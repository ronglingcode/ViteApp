import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradebookUtil from './tradebookUtil';
import * as Helper from '../utils/helper';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';

export class BookmapBigWallBreakout extends Tradebook {
    public static readonly bookmapBigWallBreakoutLong: string = 'BookmapBigWallBreakoutLong';
    public static readonly bookmapBigWallBreakoutShort: string = 'BookmapBigWallBreakoutShort';
    private basePlan: TradingPlansModels.BookmapBigWallBreakoutPlan;

    public getID(): string {
        return this.buildID(this.isLong ? BookmapBigWallBreakout.bookmapBigWallBreakoutLong : BookmapBigWallBreakout.bookmapBigWallBreakoutShort);
    }

    constructor(familyName: string, symbol: string, isLong: boolean, basePlan: TradingPlansModels.BookmapBigWallBreakoutPlan) {
        let tradebookName = isLong ? 'Long Bookmap Big Wall Breakout' : 'Short Bookmap Big Wall Breakdown';
        let buttonLabel = isLong ? 'BM Wall' : 'BM Wall';
        super(familyName, symbol, isLong, tradebookName, buttonLabel);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    refreshLiveStats(): void {
        let currentPrice = Models.getCurrentPrice(this.symbol);
        let distance = Math.abs(currentPrice - this.basePlan.bigWallLevel);
        let atr = Models.getAtr(this.symbol).average;
        let distanceInAtr = (distance / atr * 100).toFixed(0);
        let side = this.isLong ? 'above' : 'below';
        let priceRelation = (this.isLong && currentPrice > this.basePlan.bigWallLevel) ||
            (!this.isLong && currentPrice < this.basePlan.bigWallLevel) ? side : `not ${side}`;
        Helper.updateHtmlIfChanged(this.htmlStats, `wall: ${this.basePlan.bigWallLevel}, ${priceRelation}, dist: ${distanceInAtr}% atr`);
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let isLong = this.isLong;
        let logTagName = isLong ? '_bookmap_big_wall_breakout' : '_bookmap_big_wall_breakdown';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);

        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());

        if (isLong && entryPrice < this.basePlan.bigWallLevel) {
            Firestore.logError(`entry price ${entryPrice} is below big wall level ${this.basePlan.bigWallLevel}`, logTags);
            return 0;
        }
        if (!isLong && entryPrice > this.basePlan.bigWallLevel) {
            Firestore.logError(`entry price ${entryPrice} is above big wall level ${this.basePlan.bigWallLevel}`, logTags);
            return 0;
        }

        let stopOutPrice = Chart.getStopLossPrice(symbol, isLong, true, null);
        let riskLevelPrice = Models.chooseRiskLevel(symbol, isLong, entryPrice, stopOutPrice, this.basePlan.defaultRiskLevels);

        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            symbol, isLong, entryPrice, stopOutPrice, useMarketOrder,
            this.basePlan, false, logTags);

        if (allowedSize === 0) {
            Firestore.logError(`${symbol} not allowed entry`, logTags);
            return 0;
        }

        let planCopy = JSON.parse(JSON.stringify(this.basePlan)) as TradingPlansModels.BasePlan;
        this.submitEntryOrdersBase(
            dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, planCopy, logTags);

        setTimeout(() => {
            Helper.speak("mark your stop loss level on the chart");
        }, 3000);

        return allowedSize;
    }

    getTradeManagementInstructions(): Models.TradeManagementInstructions {
        let instructions: Map<string, string[]>;
        if (this.isLong) {
            instructions = this.getTradeManagementInstructionsForLong();
        } else {
            instructions = this.getTradeManagementInstructionsForShort();
        }
        TradebookUtil.setlevelToAddInstructions(this.symbol, this.isLong, instructions);
        TradebookUtil.setFinalTargetInstructions(this.symbol, this.isLong, instructions);

        let conditionsToFail = this.isLong ? ["lose big wall level"] : ["reclaim big wall level"];
        let result: Models.TradeManagementInstructions = {
            mapData: instructions,
            conditionsToFail: conditionsToFail,
        };
        return result;
    }

    getTradeManagementInstructionsForLong(): Map<string, string[]> {
        return new Map<string, string[]>([
            ['conditions to fail', [
                'price loses big wall level, closed candle below or breakdown with volume',
            ]],
            ['conditions to trim', [
                'deep pullback toward big wall level',
            ]],
            ['add or re-entry', [
                'reclaim of big wall level after pullback',
            ]],
            ['partial targets', [
                "10-30%: first push away from wall",
                "30-60%: second leg",
                "60-90%: extended move, 1+ ATR from wall",
            ]]
        ]);
    }

    getTradeManagementInstructionsForShort(): Map<string, string[]> {
        return new Map<string, string[]>([
            ['conditions to fail', [
                'price reclaims big wall level, closed candle above or breakout with volume',
            ]],
            ['conditions to trim', [
                'deep bounce toward big wall level',
            ]],
            ['add or re-entry', [
                'rejection at big wall level after bounce',
            ]],
            ['partial targets', [
                "10-30%: first drop away from wall",
                "30-60%: second leg down",
                "60-90%: extended move, 1+ ATR from wall",
            ]]
        ]);
    }

    refreshState(): void {
    }

    transitionToState(newState: any): void {
    }

    getTradebookDoc(): string {
        return "";
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

    getTightStopLevels(): Models.DisplayLevel[] {
        return [];
    }

    onNewTimeSalesData(): void {
    }
}
