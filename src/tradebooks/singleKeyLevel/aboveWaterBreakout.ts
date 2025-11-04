import { BaseBreakoutTradebook } from './baseBreakoutTradebook'
import type * as TradingPlansModels from '../../models/tradingPlans/tradingPlansModels'
import * as Chart from '../../ui/chart';
import * as Models from '../../models/models';
import * as Helper from '../../utils/helper';
import * as Patterns from '../../algorithms/patterns';
import * as Firestore from '../../firestore';
import * as TradebookUtil from '../tradebookUtil';
import * as OrderFlow from '../../controllers/orderFlow';
import * as TradingPlans from '../../models/tradingPlans/tradingPlans';
import * as ExitRulesCheckerNew from '../../controllers/exitRulesCheckerNew';

export class AboveWaterBreakout extends BaseBreakoutTradebook {
    public static readonly aboveWaterBreakout: string = 'aboveWaterBreakout';
    public static readonly belowWaterBreakdown: string = 'belowWaterBreakdown';
    public getID(): string {
        return this.isLong ? AboveWaterBreakout.aboveWaterBreakout : AboveWaterBreakout.belowWaterBreakdown;
    }

    constructor(symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
        levelMomentumPlan: TradingPlansModels.LevelMomentumPlan) {
        let tradebookName = isLong ? 'Long Above Water Breakout' : 'Short Below Water Breakdown';
        let buttonLabel = isLong ? 'Abv Wtr' : 'Blw Wtr';
        super(symbol, isLong, keyLevel, levelMomentumPlan, tradebookName, buttonLabel);
    }

    getEligibleEntryParameters(): Models.TradebookEntryParameters {
        return {
            useCurrentCandleHigh: true,
            useFirstNewHigh: false,
            useMarketOrderWithTightStop: true,
        }
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let logTagName = this.isLong ? '_above-water-breakout' : '_below-water-breakdown';
        let logTags = Models.generateLogTags(this.symbol, `${this.symbol}_${logTagName}`);
        let keyLevel = this.getKeyLevel();
        if (parameters.useMarketOrderWithTightStop) {
            useMarketOrder = true;
        }
        let entryPrice = Chart.getBreakoutEntryPrice(this.symbol, this.isLong, useMarketOrder, parameters);
        let stopOutPrice = Chart.getStopLossPrice(this.symbol, this.isLong, true, null);
        let symbolData = Models.getSymbolData(this.symbol);
        let firstBreakoutCandle = Patterns.getFirstBreakoutCandle(this.symbol, this.isLong, keyLevel);
        if (firstBreakoutCandle && firstBreakoutCandle.minutesSinceMarketOpen < 5) {
            if (this.isLong) {
                if (firstBreakoutCandle.low > symbolData.lowOfDay) {
                    //stopOutPrice = firstBreakoutCandle.low;
                    Helper.speak(`breakout in first 5 minutes, use tight stop`);
                }
            } else {
                if (firstBreakoutCandle.high < symbolData.highOfDay) {
                    //stopOutPrice = firstBreakoutCandle.high;
                    Helper.speak(`breakout in first 5 minutes, use tight stop`);
                }
            }
        }
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, logTags);
        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }
        if (parameters.useMarketOrderWithTightStop) {
            let currentCandle = Models.getCurrentCandle(this.symbol);
            let tightStopPrice = currentCandle.low;
            if (!this.isLong) {
                tightStopPrice = currentCandle.high;
            }
            let tighenStopResult = OrderFlow.tightenStop(entryPrice, stopOutPrice, tightStopPrice, allowedSize);
            stopOutPrice = tighenStopResult.newStop;
            allowedSize = tighenStopResult.newSize;
        }

        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, stopOutPrice, allowedSize, logTags);
        return allowedSize;
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
                'next new low after closed a candle (M1, M5, M15) below key level',
                'break below the low of breakout candle (M1, M5, M15)',
            ]], [
            'conditions to trim', [
                'deep pullback, partial some during bounce to half way or near double top'
            ]], [
            'add or re-entry', [
                'reclaim of previous exit levels',
                'after vwap cross above key level, pullback to vwap holds',
            ]], [
            'partial targets', [
                "10-30%: 1 minute push, 1st leg up",
                "30-60%: 5 minute push, 2nd leg up",
                "60-90%: 15 minute push, 3rd leg up, 1+ ATR",
            ]]
        ]);
        return instructions;
    }

    getTradeManagementInstructionsForShort(): Map<string, string[]> {
        const instructions = new Map<string, string[]>([[
            'conditions to fail', [
                'next new high after closed a candle (M1, M5, M15) above key level',
                'break above the high of breakdown candle (M1, M5, M15)',
            ]], [
            'conditions to trim', [
                'deep pullback, partial some during pushdown to half way or near double bottom'
            ]], [
            'add or re-entry', [
                'reclaim of previous exit levels',
                'after vwap cross below key level, pullback to vwap holds',
            ]], [
            'partial targets', [
                "10-30%: 1 minute drop, 1st leg down",
                "30-60%: 5 minute drop, 2nd leg down",
                "60-90%: 15 minute drop, 3rd leg down, 1+ ATR",
            ]]
        ]);
        return instructions;
    }


    getDisallowedReasonToAdjustSingleLimitOrder(
        symbol: string, keyIndex: number, order: Models.OrderModel,
        pair: Models.ExitPair, newPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        Firestore.logInfo(`breakout tradebook check rules`, logTags);
        let result: Models.CheckRulesResult = {
            allowed: false,
            reason: "default reason",
        };
        let isMarketOrder = false;
        result.allowed = ExitRulesCheckerNew.isAllowedForLimitOrderForAllTradebooks(
            symbol, this.isLong, isMarketOrder, newPrice, keyIndex, pair, logTags);
        if (result.allowed) {
            result.reason = "allowed by all";
            return result;
        }
        let targets = TradingPlans.calculateTargets(symbol, this.isLong);
        let minTargets = TradingPlans.populateTargets(targets, this.isLong);
        let threshold = minTargets[keyIndex];
        if (threshold == -1) {
            result.reason = "no target for first few partials";
            result.allowed = true;
            return result;
        }
        // use 0.1 ATR as buffer
        let buffer = Models.getAtr(symbol).average * 0.1;
        let thresholdWithBuffer = this.isLong ? threshold - buffer : threshold + buffer;
        if ((this.isLong && newPrice >= thresholdWithBuffer) || (!this.isLong && newPrice <= thresholdWithBuffer)) {
            result.allowed = true;
            result.reason = `meet min target, threshold: ${threshold}, with buffer: ${thresholdWithBuffer}`;
            return result;
        }

        // TODO: if lost key level after entry
        /*
        if (Patterns.hasLostKeyLevel(symbol, this.isLong, this.getKeyLevel())) {
            result.reason = "lost key level";
            result.allowed = true;
            return result;
        }*/

        return result;
    }
}