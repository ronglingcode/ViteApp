import { SingleKeyLevelTradebook } from './singleKeyLevelTradebook'
import type * as TradingPlansModels from '../../models/tradingPlans/tradingPlansModels'
import * as CommonRules from './commonRules'
import * as Chart from '../../ui/chart';
import * as Firestore from '../../firestore';
import * as Models from '../../models/models';
import * as Helper from '../../utils/helper';
import { TradebookState } from '../tradebookStates';
import * as Patterns from '../../algorithms/patterns';
import * as TradingPlans from '../../models/tradingPlans/tradingPlans';
import * as Calculator from '../../utils/calculator';
import * as ExitRulesCheckerNew from '../../controllers/exitRulesCheckerNew';
import * as Rules from '../../algorithms/rules';
import * as TradebookUtil from '../tradebookUtil';
import * as GlobalSettings from '../../config/globalSettings';
import * as LongDocs from '../tradebookDocs/vwapPushdownFail';
import * as ShortDocs from '../tradebookDocs/vwapBounceFail';
import * as VwapPatterns from '../../algorithms/vwapPatterns';

export class VwapContinuationFailed extends SingleKeyLevelTradebook {
    public static readonly longVwapPushDownFailed: string = 'LongVwapPushdownFailed';
    public static readonly shortVwapBounceFailed: string = 'ShortVwapBounceFailed';
    public waitForClose: boolean = true;
    public legCounter: number = 0;
    public lowOfDayToBreak: number = 0;
    public disableExitRules: boolean = false;
    public getID(): string {
        return this.isLong ? VwapContinuationFailed.longVwapPushDownFailed : VwapContinuationFailed.shortVwapBounceFailed;
    }
    constructor(symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
        levelMomentumPlan: TradingPlansModels.LevelMomentumPlan) {
        let tradebookName = isLong ? 'Long VWAP Bounce Failed' : 'Short VWAP Pushdown Failed';
        let buttonLabel = isLong ? 'Vwap Fail' : 'Vwap Fail';
        super(symbol, isLong, keyLevel, levelMomentumPlan, tradebookName, buttonLabel);
        this.init();
    }

    public updateConfig(config: TradingPlansModels.TradebooksConfig): void {
        if (!this.isLong) {
            if (!config.level_open_vwap.shortVwapBounceFail.waitForClose) {
                this.waitForClose = false;
            }
            if (!config.open_level_vwap.shortVwapBounceFail.waitForClose) {
                this.waitForClose = false;
            }
        }
    }

    private init(): void {
        this.legCounter = 0;
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
        let stateDescription = this.stateToString();
        let liveStats = this.getCommonLiveStats();
        liveStats += `state: ${stateDescription}, level to vwap: ${distanceFromKeyLevelToVwapInAtrPercentageString} atr`;
        Helper.updateHtmlIfChanged(this.htmlStats, liveStats);
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let logTagName = this.isLong ? '_vwap-continuation-failed' : '_vwap-continuation-failed';
        let logTags = Models.generateLogTags(this.symbol, `${this.symbol}_${logTagName}`);
        let entryPrice = Chart.getBreakoutEntryPrice(this.symbol, this.isLong, useMarketOrder, parameters);
        let stopOutPrice = Chart.getStopLossPrice(this.symbol, this.isLong, true, null);
        let allowedSize = this.validateEntry(entryPrice, stopOutPrice, useMarketOrder, logTags);
        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }

        let doubleCheckMessage = `make sure vwap bounced with a lower high, all 3 parts triggered`;
        if (!this.isLong) {
            doubleCheckMessage = "make sure vwap pushed down with a higher low, all 3 parts triggered";
        }
        Helper.speak(doubleCheckMessage);

        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, stopOutPrice, allowedSize, logTags);
        return allowedSize;
    }

    private validateEntry(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, logTags: Models.LogTags): number {
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
        if (!this.isLong) {
            let vwapPatternSatus = VwapPatterns.getStatusForVwapBounceFail(this.symbol);
            Firestore.logInfo(`vwap pattern status: ${JSON.stringify(vwapPatternSatus)}`, logTags);
            if (vwapPatternSatus != "bouncing off vwap" && this.waitForClose) {
                Helper.speak(`not bouncing off vwap yet`);
            }
        }

        let allowedSize = CommonRules.validateCommonEntryRules(
            this.symbol, this.isLong, entryPrice, stopOutPrice, useMarketOrder, this.keyLevel, this.levelMomentumPlan, false, true, logTags);
        return allowedSize;
    }

    private stateToString(): string {
        if (this.state === TradebookState.OBSERVING) {
            return 'observing';
        } else if (this.state === TradebookState.LOST_VWAP) {
            return this.isLong ? 'vwap pushdown failed' : 'vwap bounce failed';
        } else if (this.state === TradebookState.BOUNCE) {
            return this.isLong ? 'vwap pullback to vwap' : 'bounce to vwap';
        } else if (this.state === TradebookState.RECLAIMED_VWAP) {
            return this.isLong ? 'pushed down below vwap' : 'bounced above vwap';
        } else if (this.state === TradebookState.LEG_DOWN) {
            let legText = this.isLong ? 'leg up' : 'leg down';
            return `${legText} ${this.legCounter}`;
        }
        return 'unknown';
    }

    refreshState(): void {
        if (!this.isEnabled()) {
            return;
        }

        if (this.state === TradebookState.OBSERVING) {
            this.checkForPosition();
        } else if (this.state === TradebookState.LOST_VWAP) {
            this.checkWhenLostVwap();
        } else if (this.state === TradebookState.BOUNCE) {
            this.checkWhenBounce();
        } else if (this.state === TradebookState.RECLAIMED_VWAP) {
            this.checkForPosition();
        } else if (this.state === TradebookState.LEG_DOWN) {
            this.checkWhenLegDown();
        }
    }

    transitionToState(newState: TradebookState): void {
        if (this.state === newState) {
            return;
        }
        this.state = newState;
        let symbolData = Models.getSymbolData(this.symbol);
        if (newState === TradebookState.LOST_VWAP) {
            this.legCounter = 0;
            this.lowOfDayToBreak = this.isLong ? symbolData.highOfDay : symbolData.lowOfDay;
            Helper.speak(`expect future bounce, scale out 10-30%`);
        } else if (newState === TradebookState.LEG_DOWN) {
            this.legCounter++;
            Helper.speak(`expect future bounce, scale out 10-30%`);
        } else if (newState === TradebookState.RECLAIMED_VWAP) {
            Helper.speak(`exit the trade`);
        } else if (newState === TradebookState.BOUNCE) {
            this.lowOfDayToBreak = this.isLong ? symbolData.highOfDay : symbolData.lowOfDay;
            Helper.speak(`evaluate bounce height, look for recycle shares`);
        }
    }
    checkForPosition(): void {
        if (this.hasPositionForTradebook()) {
            this.transitionToState(TradebookState.LOST_VWAP);
        } else {
            this.transitionToState(TradebookState.OBSERVING);
        }
    }
    checkWhenBounce(): void {
        if (!this.hasPositionForTradebook()) {
            this.transitionToState(TradebookState.OBSERVING);
        }
        let candles = Models.getUndefinedCandlesSinceOpen(this.symbol);
        if (candles.length < 2) {
            return;
        }
        let lastCandle = candles[candles.length - 1];
        let previousCandle = candles[candles.length - 2];
        let currentVwap = Models.getCurrentVwap(this.symbol);
        let reclaimedVwap = (!this.isLong && previousCandle.close > currentVwap) || (this.isLong && previousCandle.close < currentVwap);
        let isNewHigh = (!this.isLong && lastCandle.high > previousCandle.high) || (this.isLong && lastCandle.low < previousCandle.low);
        if (isNewHigh && reclaimedVwap) {
            this.transitionToState(TradebookState.RECLAIMED_VWAP);
            return;
        }
        let symbolData = Models.getSymbolData(this.symbol);
        let lowOfDay = this.isLong ? symbolData.highOfDay : symbolData.lowOfDay;
        if ((!this.isLong && lowOfDay < this.lowOfDayToBreak) || (this.isLong && lowOfDay > this.lowOfDayToBreak)) {
            this.transitionToState(TradebookState.LEG_DOWN);
            return;
        }
    }
    checkWhenLostVwap(): void {
        if (!this.hasPositionForTradebook()) {
            this.transitionToState(TradebookState.OBSERVING);
        }
        let candles = Models.getUndefinedCandlesSinceOpen(this.symbol);
        if (candles.length < 2) {
            return;
        }
        let lastCandle = candles[candles.length - 1];
        let previousCandle = candles[candles.length - 2];
        let currentVwap = Models.getCurrentVwap(this.symbol);
        let reclaimedVwap = (!this.isLong && previousCandle.close > currentVwap) || (this.isLong && previousCandle.close < currentVwap);
        let isNewHigh = (!this.isLong && lastCandle.high > previousCandle.high) || (this.isLong && lastCandle.low < previousCandle.low);
        if (isNewHigh) {
            if (reclaimedVwap) {
                this.transitionToState(TradebookState.RECLAIMED_VWAP);
            } else {
                this.transitionToState(TradebookState.BOUNCE);
            }
            return;
        }
        let symbolData = Models.getSymbolData(this.symbol);
        let lowOfDay = this.isLong ? symbolData.highOfDay : symbolData.lowOfDay;
        if ((!this.isLong && lowOfDay < this.lowOfDayToBreak) ||
            (this.isLong && lowOfDay > this.lowOfDayToBreak)) {
            this.transitionToState(TradebookState.LEG_DOWN);
            return;
        }
    }
    checkWhenLegDown(): void {
        if (!this.hasPositionForTradebook()) {
            this.transitionToState(TradebookState.OBSERVING);
        }
        let candles = Models.getUndefinedCandlesSinceOpen(this.symbol);
        if (candles.length < 2) {
            return;
        }
        let lastCandle = candles[candles.length - 1];
        let previousCandle = candles[candles.length - 2];
        let isNewHigh = (!this.isLong && lastCandle.high > previousCandle.high) || (this.isLong && lastCandle.low < previousCandle.low);
        if (isNewHigh) {
            this.transitionToState(TradebookState.BOUNCE);
            return;
        }
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
        if (this.legCounter == 2 && keyIndex <= 5) {
            result.reason = "leg 2";
            result.allowed = true;
            return result;
        }
        if (this.legCounter >= 3) {
            result.reason = "leg 3+";
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
        if (this.legCounter == 2 && keyIndex <= 6) {
            result.reason = "leg 2";
            result.allowed = true;
            return result;
        }
        if (this.legCounter >= 3) {
            result.reason = "leg 3+";
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
        if (this.legCounter == 2 && keyIndex <= 6) {
            result.reason = "leg 2";
            result.allowed = true;
            return result;
        }
        if (this.legCounter >= 3) {
            result.reason = "leg 3+";
            result.allowed = true;
            return result;
        }

        return result;
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
        let conditionsToFail = this.isLong ? ["lose vwap"] : ["reclaim vwap"];
        let result: Models.TradeManagementInstructions = {
            mapData: instructions,
            conditionsToFail: conditionsToFail,
        }
        return result;
    }
    getTradeManagementInstructionsForLong(): Map<string, string[]> {
        const instructions = new Map<string, string[]>([[
            'conditions to fail', [
                'lose vwap: a new candle (M1,5,15) close below vwap then makes a new low',
                'lose vwap: dip to vwap and bounced, then gets below bounce low',
            ]], [
            'conditions to trim', [
                '50%: the next level above holds',
                '10-30%: M5/M15 new low',
                'deep pullback, partial some during 50% bounce or near double top',
            ]], [
            'add or re-entry', [
                'reclaim of previous exit levels',
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
                'reclaim vwap: a new candle (M1,5,15) close above vwap then makes a new high',
                'reclaim vwap: pop to vwap and rejected, then gets above rejection high',
            ]], [
            'conditions to trim', [
                '50%: the next level below holds',
                '10-30%: M5/M15 new high',
                'deep pullback, partial some during 50% pushdown or near double bottom',
            ]], [
            'add or re-entry', [
                'reclaim of previous exit levels',
            ]], [
            'partial targets', [
                "10-30%: 1 minute drop, 1st leg down",
                "30-60%: 5 minute drop, 2nd leg down",
                "60-90%: 15 minute drop, 3rd leg down, 1+ ATR",
            ]]
        ]);
        return instructions;
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
}