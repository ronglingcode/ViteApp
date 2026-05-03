import { Tradebook } from './baseTradebook';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as Helper from '../utils/helper';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';

/**
 * Long-only tradebook: go long when a big wall breakdown fails (price reclaims above the wall).
 */
import { TradebookID } from './tradebookIds';

export class BookmapBigWallBreakdownFailLong extends Tradebook {
    private basePlan: TradingPlansModels.BookmapBigWallBreakdownFailLongPlan;

    public getID(): string {
        return this.buildID(TradebookID.BookmapBigWallBreakdownFailLong);
    }

    constructor(symbol: string, basePlan: TradingPlansModels.BookmapBigWallBreakdownFailLongPlan) {
        super(symbol, true, 'Long Bookmap Big Wall Breakdown Fail', 'BM Wall Fail');
        this.basePlan = basePlan;
        this.enableByDefault = true;
    }

    refreshLiveStats(): void {
        let currentPrice = Models.getCurrentPrice(this.symbol);
        let distance = Math.abs(currentPrice - this.basePlan.bigWallLevel);
        let atr = Models.getAtr(this.symbol).average;
        let distanceInAtr = (distance / atr * 100).toFixed(0);
        let above = currentPrice > this.basePlan.bigWallLevel ? 'above' : 'below';
        Helper.updateHtmlIfChanged(this.htmlStats, `wall: ${this.basePlan.bigWallLevel}, ${above}, dist: ${distanceInAtr}% atr`);
    }

    triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        let symbol = this.symbol;
        let logTagName = '_bookmap_big_wall_breakdown_fail_long';
        let logTags = Models.generateLogTags(symbol, `${symbol}_${logTagName}`);

        let entryPrice = Chart.getBreakoutEntryPrice(symbol, true, useMarketOrder, Models.getDefaultEntryParameters());

        if (entryPrice < this.basePlan.bigWallLevel) {
            Firestore.logError(`entry price ${entryPrice} is below big wall level ${this.basePlan.bigWallLevel}`, logTags);
            return 0;
        }

        let stopOutPrice = Chart.getStopLossPrice(symbol, true, true, null);
        let riskLevelPrice = Models.chooseRiskLevel(symbol, true, entryPrice, stopOutPrice, TradingPlans.getAnalysisDefaultRiskLevels(symbol));

        let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
            symbol, true, entryPrice, stopOutPrice, useMarketOrder,
            this.basePlan, false, logTags);

        if (allowedSize === 0) {
            Firestore.logError(`${symbol} not allowed entry`, logTags);
            return 0;
        }

        let planCopy = JSON.parse(JSON.stringify(this.basePlan)) as TradingPlansModels.BasePlan;
        this.submitEntryOrdersBase(
            dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, planCopy, logTags);

        return allowedSize;
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

    onNewTimeSalesData(): void {
    }
}
