import { Tradebook } from '../baseTradebook';
import type * as TradingPlansModels from '../../models/tradingPlans/tradingPlansModels';
import * as Models from '../../models/models';
import * as Helper from '../../utils/helper';
export abstract class SingleKeyLevelTradebook extends Tradebook {
    public keyLevel: TradingPlansModels.LevelArea;
    public levelMomentumPlan: TradingPlansModels.LevelMomentumPlan;

    constructor(symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
        plan: TradingPlansModels.LevelMomentumPlan, tradebookName: string, buttonLabel: string) {
        super(symbol, isLong, tradebookName, buttonLabel);
        this.keyLevel = keyLevel;
        this.levelMomentumPlan = plan;
        if (this.levelMomentumPlan.planConfigs.sizingCount) {
            this.sizingCount = this.levelMomentumPlan.planConfigs.sizingCount;
        }
    }

    refreshLiveStats(): void {
        Helper.updateHtmlIfChanged(this.htmlStats, '');
    }

    protected getKeyLevel(): number {
        return this.isLong ? this.keyLevel.high : this.keyLevel.low;
    }

    protected submitEntryOrders(dryRun: boolean,
        useMarketOrder: boolean, entryPrice: number, stopOutPrice: number, allowedSize: number, logTags: Models.LogTags): void {
        let planCopy = JSON.parse(JSON.stringify(this.levelMomentumPlan)) as TradingPlansModels.LevelMomentumPlan;
        let riskLevelPrice = Models.getRiskLevelPrice(this.symbol, stopOutPrice);
        this.submitEntryOrdersBase(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, planCopy, logTags);
    }

    protected submitEntryOrdersWithCustomRiskLevelPrice(dryRun: boolean,
        useMarketOrder: boolean, entryPrice: number, stopOutPrice: number, riskLevelPrice: number, allowedSize: number, logTags: Models.LogTags): void {
        let planCopy = JSON.parse(JSON.stringify(this.levelMomentumPlan)) as TradingPlansModels.LevelMomentumPlan;
        this.submitEntryOrdersBase(dryRun, useMarketOrder, entryPrice, stopOutPrice, riskLevelPrice, allowedSize, planCopy, logTags);
    }

    /**
     * Minimal doc method for now — returns empty string.
     */
    getTradebookDoc(): string {
        return "";
    }

    getEntryMethods(): string[] {
        return [];
    }
} 