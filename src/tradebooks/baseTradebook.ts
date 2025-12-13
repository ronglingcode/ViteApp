import * as Firestore from '../firestore';
import * as Models from '../models/models';
import { TradebookState } from './tradebookStates';
import * as Helper from '../utils/helper';
import * as TradingState from '../models/tradingState';
import * as EntryHandler from '../controllers/entryHandler';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';

// 1) Define a common interface
export abstract class Tradebook {
    // Using a dummy HTMLElement that won't be rendered
    protected htmlButtons: HTMLElement[] = [];
    protected htmlStats: HTMLElement = Object.create(HTMLElement.prototype);
    protected htmlContainer: HTMLElement | null = null;
    protected buttonLinked = false;
    protected enabled: boolean = false;
    protected state: TradebookState = TradebookState.OBSERVING;
    public sizingCount: number = 10;
    public enableByDefault: boolean = false;
    constructor(
        public readonly symbol: string,
        public readonly isLong: boolean,
        public readonly name: string,
        public readonly buttonLabel: string,
    ) {
    }

    /** kick off whatever entry orders this strategy needs */
    abstract triggerEntry(useMarketOrder: boolean, dryRun: boolean, parameters: Models.TradebookEntryParameters): number;
    abstract getID(): string;
    abstract getTradebookDoc(): string;
    abstract refreshLiveStats(): void;
    abstract refreshState(): void;
    abstract transitionToState(newState: TradebookState): void;
    abstract getTradeManagementInstructions(): Models.TradeManagementInstructions;

    getCommonLiveStats(): string {
        return `size: ${this.sizingCount}, `;
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
        allowedSize: number, basePlan: TradingPlansModels.BasePlan, logTags: Models.LogTags): void {
        if (dryRun) {
            Helper.speak(`${this.symbol} dry run, not submitting orders`);
            return;
        }

        basePlan.planConfigs.sizingCount = this.sizingCount;
        Firestore.logInfo(`sizing count: ${this.sizingCount}`, logTags);

        if (useMarketOrder) {
            EntryHandler.marketEntryWithoutRules(
                this.symbol, this.isLong, stopOutPrice, riskLevel, logTags, allowedSize, basePlan, this.getID());
        } else {
            EntryHandler.breakoutEntryWithoutRules(
                this.symbol, this.isLong, entryPrice, stopOutPrice, riskLevel, logTags, allowedSize, basePlan, this.getID(), "");
        }
    }

    getTightStopLevels(): Models.DisplayLevel[] {
        return [];
    }
    onNewTimeSalesData(): void {
        // do nothing
    }
}
