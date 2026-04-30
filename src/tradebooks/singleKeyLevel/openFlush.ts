import { SingleKeyLevelTradebook } from './singleKeyLevelTradebook'
import type * as TradingPlansModels from '../../models/tradingPlans/tradingPlansModels'
import * as CommonRules from './commonRules'
import * as Chart from '../../ui/chart';
import * as Firestore from '../../firestore';
import * as Models from '../../models/models';
import * as Helper from '../../utils/helper';
import * as Patterns from '../../algorithms/patterns';
import * as OrderFlow from '../../controllers/orderFlow';
import * as GlobalSettings from '../../config/globalSettings';

export class OpenFlush extends SingleKeyLevelTradebook {
    public static readonly openFlushLong: string = 'openFlushLong';
    public static readonly openFlushShort: string = 'openFlushShort';
    public getID(): string {
        return this.buildID(this.isLong ? OpenFlush.openFlushLong : OpenFlush.openFlushShort);
    }

    constructor(familyName: string, symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
        levelMomentumPlan: TradingPlansModels.LevelMomentumPlan
    ) {
        let tradebookName = isLong ? 'Long Open Flush' : 'Short Open Flush';
        let buttonLabel = 'Open Flush';
        super(familyName, symbol, isLong, keyLevel, levelMomentumPlan, tradebookName, buttonLabel)
        this.init()
    }

    private init(): void {
        // Initialize any specific properties or state for OpenFlush
    }

    refreshLiveStats(): void {
        if (!this.isEnabled() || !GlobalSettings.allowLiveStats) {
            Helper.updateHtmlIfChanged(this.htmlStats, '');
            return;
        }
        let symbol = this.symbol;
        let isLong = this.isLong;
        let hasPremarketBreakout = Patterns.hasPremarketBreakout(symbol, !isLong);
        let openExtensionFromVwapInAtr = Patterns.getOpenExtensionFromVwapInAtr(symbol, isLong);
        let liveStats = this.getCommonLiveStats();
        liveStats += `vwap from open: ${openExtensionFromVwapInAtr} atr, premkt b/o: ${hasPremarketBreakout}`;
        Helper.updateHtmlIfChanged(this.htmlStats, liveStats);
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let logTagName = this.isLong ? '_open-flush' : '_open-flush';
        let logTags = Models.generateLogTags(this.symbol, `${this.symbol}_${logTagName}`);

        let symbol = this.symbol;
        let isLong = this.isLong;
        let plan = this.levelMomentumPlan;

        let hasPremarketBreakout = Patterns.hasPremarketBreakout(symbol, !isLong);
        let openExtensionFromVwapInAtr = Patterns.getOpenExtensionFromVwapInAtr(symbol, isLong);
        let atrThreshold = Models.getAtrThreshold(symbol);
        let extensionMeetThreshold = openExtensionFromVwapInAtr > atrThreshold;
        if (!hasPremarketBreakout && !extensionMeetThreshold) {
            Firestore.logError(`no premarket breakout and vwap extension is too short`, logTags);
            return 0;
        }

        let symbolData = Models.getSymbolData(symbol);
        let entryPrice = useMarketOrder ? Models.getCurrentPrice(symbol) : symbolData.lowOfDay;
        let wideStopLoss = Math.max(symbolData.premktHigh, symbolData.highOfDay);
        let chart = Models.getChartWidget(symbol);
        if (chart && chart.stopLossPriceLine) {
            if (chart.stopLossPriceLine.options().price > 0) {
                wideStopLoss = chart.stopLossPriceLine.options().price;
            }
        }
        let tightStopLoss = symbolData.highOfDay;

        let allowedSize = this.validateEntry(entryPrice, wideStopLoss, useMarketOrder, logTags);
        if (allowedSize === 0) {
            Firestore.logError(`${this.symbol} not allowed entry`, logTags);
            return 0;
        }

        let tightenStopResult = OrderFlow.tightenStop(entryPrice, wideStopLoss, tightStopLoss, allowedSize);
        let newSize = tightenStopResult.newSize;
        if (hasPremarketBreakout && extensionMeetThreshold) {
            newSize = newSize * 0.8;
        } else {
            newSize = newSize * 0.4;
        }
        let newPlan = {
            ...plan,
        }

        newPlan.planConfigs.alwaysAllowFlatten = true;
        newPlan.planConfigs.alwaysAllowMoveStop = true;
        newPlan.targets.initialTargets.rrr = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        newPlan.targets.initialTargets.dailyRanges = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

        this.submitEntryOrders(dryRun, useMarketOrder, entryPrice, tightStopLoss, newSize, "", logTags);
        return newSize;
    }

    private validateEntry(entryPrice: number, stopOutPrice: number, useMarketOrder: boolean, logTags: Models.LogTags): number {
        let seconds = Helper.getSecondsSinceMarketOpen(new Date());
        if (seconds > 300) {
            // extend to first 5 minutes due to some stocks has no volume in the first few minutes
            Firestore.logError(`only allowed for first 5 minutes`, logTags);
            return 0;
        }
        let allowedSize = CommonRules.validateCommonEntryRules(
            this.symbol, this.isLong, entryPrice, stopOutPrice, useMarketOrder, this.keyLevel, this.levelMomentumPlan, true, false, logTags);
        return allowedSize;
    }

    getEntryMethods(): string[] {
        return [];
    }
} 