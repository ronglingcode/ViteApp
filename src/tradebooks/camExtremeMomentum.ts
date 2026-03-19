import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradebookUtil from './tradebookUtil';
import * as Helper from '../utils/helper';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';

export class CamExtremeMomentum extends Tradebook {
    public static readonly camExtremeMomentumLong: string = 'CamExtremeMomentumLong';
    public static readonly camExtremeMomentumShort: string = 'CamExtremeMomentumShort';
    private basePlan: TradingPlansModels.CamExtremeMomentumPlan;

    public getID(): string {
        if (this.isLong) {
            return this.buildID(CamExtremeMomentum.camExtremeMomentumLong);
        } else {
            return this.buildID(CamExtremeMomentum.camExtremeMomentumShort);
        }
    }

    constructor(familyName: string, symbol: string, isLong: boolean, basePlan: TradingPlansModels.CamExtremeMomentumPlan) {
        let tradebookName = isLong ? 'Long R6 Momentum' : 'Short R6 Momentum';
        let buttonLabel = isLong ? 'Long R6' : 'Short S6';
        super(familyName, symbol, isLong, tradebookName, buttonLabel);
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    refreshLiveStats(): void {
        let symbolData = Models.getSymbolData(this.symbol);
        let camPivots = symbolData.camPivots;
        let pivotLevel = this.isLong ? camPivots.R6 : camPivots.S6;
        let openPrice = Models.getOpenPrice(this.symbol);
        let currentPrice = Models.getCurrentPrice(this.symbol);
        let entryPrice = currentPrice;
        let stopOutPrice = this.isLong ? camPivots.R5 : camPivots.S5;
        let riskLevel = Models.chooseRiskLevel(this.symbol, this.isLong, entryPrice, stopOutPrice, this.basePlan.defaultRiskLevels);
        let label = this.isLong ? 'R6' : 'S6';
        Helper.updateHtmlIfChanged(this.htmlStats,
            `${label}: ${pivotLevel}, open: ${openPrice ?? '?'}, risk: ${riskLevel}`);
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let isLong = this.isLong;

        let logTagName = isLong ? '_long_cam_r6_momentum' : '_short_cam_s6_momentum';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);
        let entryPrice = Chart.getBreakoutEntryPrice(symbol, isLong, useMarketOrder, Models.getDefaultEntryParameters());
        let symbolData = Models.getSymbolData(symbol);
        let camPivots = symbolData.camPivots;
        let stopOutPrice = isLong ? camPivots.R5 : camPivots.S5;
        let riskLevelPrice = Models.chooseRiskLevel(symbol, isLong, entryPrice, stopOutPrice, this.basePlan.defaultRiskLevels);

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
        let camPivots = symbolData.camPivots;
        let openPrice = Models.getOpenPrice(this.symbol);

        if (!openPrice) {
            Firestore.logError(`no open price available`, logTags);
            return 0;
        }

        if (this.isLong) {
            // open must be above R6 for long entry
            if (openPrice <= camPivots.R6) {
                Firestore.logError(`open ${openPrice} is not above R6 ${camPivots.R6}, no long entry`, logTags);
                return 0;
            }
            // entry must be above R6
            if (entryPrice <= camPivots.R6) {
                Firestore.logError(`entry ${entryPrice} is not above R6 ${camPivots.R6}`, logTags);
                return 0;
            }
        } else {
            // open must be below S6 for short entry
            if (openPrice >= camPivots.S6) {
                Firestore.logError(`open ${openPrice} is not below S6 ${camPivots.S6}, no short entry`, logTags);
                return 0;
            }
            // entry must be below S6
            if (entryPrice >= camPivots.S6) {
                Firestore.logError(`entry ${entryPrice} is not below S6 ${camPivots.S6}`, logTags);
                return 0;
            }
        }

        if (camPivots.R6 === 0 || camPivots.S6 === 0) {
            Firestore.logError(`cam pivots not calculated yet`, logTags);
            return 0;
        }

        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            this.symbol, this.isLong, entryPrice, stopOutPrice, useMarketOrder,
            this.basePlan, false, logTags);
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
    }

    transitionToState(newState: any): void {
    }

    getTightStopLevels(): Models.DisplayLevel[] {
        return TradebookUtil.getTightStopLevelsForTrend(this.symbol, this.isLong);
    }

    getTradebookDoc(): string {
        return "";
    }

    getTradeManagementInstructions(): Models.TradeManagementInstructions {
        let instructions = this.isLong
            ? this.getTradeManagementInstructionsForLong()
            : this.getTradeManagementInstructionsForShort();
        TradebookUtil.setlevelToAddInstructions(this.symbol, this.isLong, instructions);
        TradebookUtil.setFinalTargetInstructions(this.symbol, this.isLong, instructions);

        let conditionsToFail = this.isLong
            ? ["price breaks back below R6, lose extreme momentum"]
            : ["price breaks back above S6, lose extreme momentum"];

        return {
            mapData: instructions,
            conditionsToFail: conditionsToFail,
        };
    }

    getTradeManagementInstructionsForLong(): Map<string, string[]> {
        return new Map<string, string[]>([
            ['conditions to fail', [
                'price closes back below R6',
                'loses momentum above R6',
            ]],
            ['conditions to trim', [
                'first pullback after initial push',
                'M5 reversal candle',
            ]],
            ['add or re-entry', [
                'add on R6 retest hold',
            ]],
            ['partial targets', [
                "25-50%: first push extension",
                "50-75%: extended move",
                "75-100%: trail remainder",
            ]]
        ]);
    }

    getTradeManagementInstructionsForShort(): Map<string, string[]> {
        return new Map<string, string[]>([
            ['conditions to fail', [
                'price closes back above S6',
                'loses momentum below S6',
            ]],
            ['conditions to trim', [
                'first bounce after initial push down',
                'M5 reversal candle',
            ]],
            ['add or re-entry', [
                'add on S6 retest rejection',
            ]],
            ['partial targets', [
                "25-50%: first push extension",
                "50-75%: extended move",
                "75-100%: trail remainder",
            ]]
        ]);
    }

    onNewTimeSalesData(): void {
    }

    getEntryMethods(): string[] {
        return ['default'];
    }
}
