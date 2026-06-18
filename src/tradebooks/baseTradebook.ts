import * as Firestore from '../firestore';
import * as Models from '../models/models';
import * as Helper from '../utils/helper';
import * as TradingState from '../models/tradingState';
import * as EntryHandler from '../controllers/entryHandler';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as GlobalSettings from '../config/globalSettings';

// 1) Define a common interface
export abstract class Tradebook {
    // Using a dummy HTMLElement that won't be rendered
    protected htmlButtons: HTMLElement[] = [];
    protected htmlStats: HTMLElement = Object.create(HTMLElement.prototype);
    protected htmlContainer: HTMLElement | null = null;
    protected buttonLinked = false;
    protected enabled: boolean = false;
    public sizingCount: number = 10;
    public enableByDefault: boolean = false;
    constructor(
        public readonly symbol: string,
        public readonly tradebookID: string,
        public readonly isLong: boolean,
        public readonly name: string,
        public readonly buttonLabel: string,
    ) {
    }

    /** kick off whatever entry orders this strategy needs */
    abstract triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number;
    getID(): string {
        return this.tradebookID;
    }
    abstract refreshLiveStats(): void;
    abstract getEntryMethods(): string[];

    getCommonLiveStats(): string {
        return `size: ${this.sizingCount}, `;
    }

    setCoreInvalidationLevel(level: number): void {
        let breakoutTradeState = TradingState.getBreakoutTradeState(this.symbol, this.isLong);
        breakoutTradeState.coreInvalidationLevel = level;
        TradingState.update();
    }

    private getDisallowedReasonForMissingCoreInvalidationLevel(exitTier: string, logTags: Models.LogTags): Models.CheckRulesResult | null {
        let breakoutTradeState = TradingState.getBreakoutTradeState(this.symbol, this.isLong);
        if ((breakoutTradeState.coreInvalidationLevel ?? -1) !== -1) {
            return null;
        }
        let message = `coreInvalidationLevel is still -1; set the invalidation level before adjusting ${exitTier} exit orders`;
        Firestore.logError(message, logTags);
        Helper.speak("set the invalidation level");
        if (!GlobalSettings.blockExitAdjustmentsWithoutCoreInvalidationLevel) {
            return null;
        }
        return {
            allowed: false,
            reason: message,
        };
    }

    protected getDisallowedReasonForMissingCoreInvalidationLevelAtKeyIndex(
        symbol: string, keyIndex: number, basePlan: TradingPlansModels.BasePlan, logTags: Models.LogTags): Models.CheckRulesResult | null {
        let partialIndex = this.getPartialIndexForExitAdjustment(symbol, keyIndex);
        let exitTier = this.getExitTierForPartialIndex(basePlan, partialIndex);
        if (exitTier === "scalp") {
            return null;
        }
        return this.getDisallowedReasonForMissingCoreInvalidationLevel(exitTier, logTags);
    }

    protected getDisallowedReasonForMissingCoreInvalidationLevelInExitPairRange(
        symbol: string, totalPairsCount: number, basePlan: TradingPlansModels.BasePlan, logTags: Models.LogTags): Models.CheckRulesResult | null {
        for (let keyIndex = 0; keyIndex < totalPairsCount; keyIndex++) {
            let partialIndex = this.getPartialIndexForExitAdjustment(symbol, keyIndex);
            let exitTier = this.getExitTierForPartialIndex(basePlan, partialIndex);
            if (exitTier !== "scalp") {
                return this.getDisallowedReasonForMissingCoreInvalidationLevel(exitTier, logTags);
            }
        }
        return null;
    }

    // Convert the current visible exit-pair index back to the original batch slot.
    // If earlier partials have already exited, the remaining pair at keyIndex 0 may
    // now represent core/runner instead of the first scalp partial. This is the same
    // index shift handled by Helper.getBatchIndex(...).
    private getPartialIndexForExitAdjustment(symbol: string, keyIndex: number): number {
        let totalPairsCount = Models.getExitPairs(symbol).length;
        return Helper.getBatchIndex(keyIndex, GlobalSettings.batchCount, totalPairsCount);
    }

    private getExitTierForPartialIndex(basePlan: TradingPlansModels.BasePlan, partialIndex: number): string {
        let scalpCount = GlobalSettings.batchCount - basePlan.coreCount - basePlan.runnerCount;
        if (partialIndex < scalpCount) {
            return "scalp";
        }
        if (partialIndex < scalpCount + basePlan.coreCount) {
            return "core";
        }
        return "runner";
    }

    startEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number {
        Firestore.logInfo(`Starting entry for ${this.symbol} (${this.getID()})`);
        Helper.speak("is it a high quality setup?");
        return this.triggerEntry(useMarketOrder, dryRun, parameters);
    }

    linkButton(buttons: HTMLElement[], stats: HTMLElement, container: HTMLElement) {
        this.htmlButtons = buttons;
        this.htmlContainer = container;
        this.htmlStats = stats;
        this.buttonLinked = true;
    }

    getButtonForLabel(label: string): HTMLElement | null {
        for (let button of this.htmlButtons) {
            if (button.textContent === label) {
                return button;
            }
        }
        return null;
    }

    enable() {
        this.enabled = true;
        if (this.htmlContainer) {
            this.htmlContainer.style.display = 'block';
        }
    }
    public updateConfig(config: TradingPlansModels.TradebooksConfig) {

    }

    disable() {
        this.enabled = false;
        if (this.htmlContainer) {
            this.htmlContainer.style.display = 'none';
        }
    }

    isEnabled(): boolean {
        return this.enabled;
    }


    includeFirstNewHighEntry(): boolean {
        return false;
    }

    getEligibleEntryParameters(): Models.TradebookEntryParameters {
        return Models.getDefaultEntryParameters();
    }

    getDisallowedReasonToAdjustSingleLimitOrder(symbol: string, keyIndex: number, order: Models.OrderModel, pair: Models.ExitPair, newPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        Firestore.logInfo(`base tradebook check rules`, logTags);
        let result: Models.CheckRulesResult = {
            allowed: true,
            reason: "base tradebook",
        };
        return result;
    }

    getDisallowedReasonToAdjustSingleStopOrder(symbol: string, keyIndex: number, order: Models.OrderModel, pair: Models.ExitPair, newPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        Firestore.logInfo(`base tradebook check rules`, logTags);
        let result: Models.CheckRulesResult = {
            allowed: true,
            reason: "base tradebook",
        };
        return result;
    }

    getDisallowedReasonToMarketOutSingleOrder(symbol: string, keyIndex: number, logTags: Models.LogTags): Models.CheckRulesResult {
        Firestore.logInfo(`base tradebook check rules`, logTags);
        let result: Models.CheckRulesResult = {
            allowed: true,
            reason: "base tradebook",
        };
        return result;
    }
    getDisallowedReasonToFlatten(symbol: string, logTags: Models.LogTags, exitPrice: number): Models.CheckRulesResult {
        Firestore.logInfo(`base tradebook check rules`, logTags);
        let result: Models.CheckRulesResult = {
            allowed: true,
            reason: "base tradebook",
        };
        return result;
    }
    getDisallowedReasonToAdjustAllExitPairs(symbol: string, logTags: Models.LogTags, newPrice: number): Models.CheckRulesResult {
        Firestore.logInfo(`base tradebook check rules`, logTags);
        let result: Models.CheckRulesResult = {
            allowed: true,
            reason: "base tradebook",
        };
        return result;
    }
    getAllowedReasonToAddPartial(symbol: string, entryPrice: number, logTags: Models.LogTags): Models.CheckRulesResult {
        Firestore.logInfo(`base tradebook add rules`, logTags);
        let result: Models.CheckRulesResult = {
            allowed: false,
            reason: "base tradebook default disallow adds",
        };
        return result;
    }
    hasPositionForTradebook(): boolean {
        let symbol = this.symbol;
        let isLong = this.isLong;
        let netQuantity = Models.getPositionNetQuantity(symbol);
        if (netQuantity === 0) {
            return false;
        }
        if ((netQuantity > 0 && !isLong) || (netQuantity < 0 && isLong)) {
            return false;
        }

        let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
        if (!breakoutTradeState) {
            return false;
        }
        return breakoutTradeState.submitEntryResult.tradeBookID === this.getID();
    }

    submitEntryOrdersBase(
        dryRun: boolean, useMarketOrder: boolean, entryPrice: number, stopOutPrice: number, riskLevel: number,
        allowedSize: number, basePlan: TradingPlansModels.BasePlan, logTags: Models.LogTags,
        entryParameters?: Models.TradebookEntryParameters): void {
        if (dryRun) {
            Helper.speak(`${this.symbol} dry run, not submitting orders`);
            return;
        }

        basePlan.planConfigs.sizingCount = this.sizingCount;
        Firestore.logInfo(`sizing count: ${this.sizingCount}`, logTags);

        if (useMarketOrder) {
            EntryHandler.marketEntryWithoutRules(
                this.symbol, this.isLong, stopOutPrice, riskLevel, logTags, allowedSize, basePlan, this.getID(),
                entryParameters);
        } else {
            EntryHandler.breakoutEntryWithoutRules(
                this.symbol, this.isLong, entryPrice, stopOutPrice, riskLevel, logTags, allowedSize, basePlan, this.getID(), "",
                entryParameters);
        }
    }

    onNewTimeSalesData(newPrice: number): void {
        // do nothing
    }
    onNewCandleClose(): void {
        // do nothing
    }
}
