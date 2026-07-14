import * as Models from "../models/models";
import * as TradingPlans from "../models/tradingPlans/tradingPlans";
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import type { Tradebook } from "./baseTradebook";
import { VwapContinuationFailed } from "./singleKeyLevel/vwapContinuationFailed";
import * as Helper from "../utils/helper";
import { BookmapWallBreak } from "./bookmapWallBreak";
import { BookmapWallReversal } from "./bookmapWallReversal";
import { TradebookID } from "./tradebookIds";

export interface BookmapTradebookButtonDefinition {
    id: string,
    label: string,
    side: "long" | "short",
    tradebookId: string,
    tradebookName: string,
    entryMethods: string[],
}

const isDirectionEnabled = (directionPlan: TradingPlansModels.SingleDirectionPlans) => {
    return directionPlan.enabled !== false;
}

export const createTradebooksForGapAndGo = (symbol: string, gapAndGoPlan: TradingPlansModels.GapAndGoPlan, tradebooksMap: Map<string, Tradebook>) => {
    if (gapAndGoPlan.enableOfferBreakout) {
        let gapAndGoBookmapOfferWallBreakout = new BookmapWallBreak(
            symbol, TradebookID.GapAndGoBookmapOfferWallBreakout, gapAndGoPlan, gapAndGoPlan.support.low, gapAndGoPlan.waitForPullback);
        tradebooksMap.set(gapAndGoBookmapOfferWallBreakout.getID(), gapAndGoBookmapOfferWallBreakout);
    }
    if (gapAndGoPlan.enableBidReversal) {
        let gapGiveAndGo = new BookmapWallReversal(
            symbol, TradebookID.GapGiveAndGoBookmapReversal, gapAndGoPlan, gapAndGoPlan.support.low,
        );
        tradebooksMap.set(TradebookID.GapGiveAndGoBookmapReversal, gapGiveAndGo);
    }
};
export const createTradebooksForGapAndCrap = (symbol: string, gapAndCrapPlan: TradingPlansModels.GapAndCrapPlan, tradebooksMap: Map<string, Tradebook>) => {
    let maxPrice = gapAndCrapPlan.aboveThisLevelNoMoreShort;
    let maxPriceKeyLevel: TradingPlansModels.LevelArea = {
        high: maxPrice,
        low: maxPrice
    };
    let scopeIsLong = false;
    let shortPlan = TradingPlans.getTradingPlans(symbol).short.levelMomentumPlan;

    if (shortPlan) {
        let bookmapBreakdown = new BookmapWallBreak(
            symbol, TradebookID.GapAndCrapBookmapBidWallBreakdown, gapAndCrapPlan, maxPrice, gapAndCrapPlan.waitForPullback);
        tradebooksMap.set(bookmapBreakdown.getID(), bookmapBreakdown);

        let bookmapReversal1 = new BookmapWallReversal(
            symbol, TradebookID.GapAndCrapOfferStepDownReappear, gapAndCrapPlan, maxPrice);
        tradebooksMap.set(bookmapReversal1.getID(), bookmapReversal1);
        let bookmapReversal2 = new BookmapWallReversal(
            symbol, TradebookID.GapAndCrapBreakdownBidSwingLow, gapAndCrapPlan, maxPrice);
        tradebooksMap.set(bookmapReversal2.getID(), bookmapReversal2);
    }
}

export const createTradebooksForGapDownAndGoDown = (symbol: string, gapPlan: TradingPlansModels.GapDownAndGoDownPlan, tradebooksMap: Map<string, Tradebook>) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    let shortPlan = plan.short.levelMomentumPlan;

    let maxPriceKeyLevel: TradingPlansModels.LevelArea = {
        high: gapPlan.buyersTrappedBelowThisLevel || 0,
        low: gapPlan.buyersTrappedBelowThisLevel || 0
    };

    let gapDownAndGoDownBookmapBidWallBreakdown = new BookmapWallBreak(
        symbol, TradebookID.GapDownAndGoDownBookmapBidWallBreakdown, gapPlan, maxPriceKeyLevel.high, gapPlan.waitForPullback);
    tradebooksMap.set(gapDownAndGoDownBookmapBidWallBreakdown.getID(), gapDownAndGoDownBookmapBidWallBreakdown);

    let gapDownAndGoDownBookmapReversal1 = new BookmapWallReversal(
        symbol, TradebookID.GapDownAndGoDownOfferStepDownReappear, gapPlan, maxPriceKeyLevel.high);
    tradebooksMap.set(gapDownAndGoDownBookmapReversal1.getID(), gapDownAndGoDownBookmapReversal1);
    let gapDownAndGoDownBookmapReversal2 = new BookmapWallReversal(
        symbol, TradebookID.GapDownAndGoDownBreakdownBidSwingLow, gapPlan, maxPriceKeyLevel.high);
    tradebooksMap.set(gapDownAndGoDownBookmapReversal2.getID(), gapDownAndGoDownBookmapReversal2);
}

export const createTradebooksForGapDownAndGoUp = (symbol: string, gapPlan: TradingPlansModels.GapDownAndGoUpPlan, tradebooksMap: Map<string, Tradebook>) => {
    let minSupport = gapPlan.support.length > 0 ? gapPlan.support[0].low : 0;

    let gapDownAndGoUpBookmapOfferWallBreakout = new BookmapWallBreak(
        symbol, TradebookID.GapDownAndGoUpBookmapOfferWallBreakout, gapPlan, minSupport, gapPlan.waitForPullback);
    tradebooksMap.set(gapDownAndGoUpBookmapOfferWallBreakout.getID(), gapDownAndGoUpBookmapOfferWallBreakout);

    let gapDownAndGoUpBookmapWallReversal = new BookmapWallReversal(
        symbol, TradebookID.GapDownAndGoUpBookmapReversal, gapPlan, minSupport);
    tradebooksMap.set(gapDownAndGoUpBookmapWallReversal.getID(), gapDownAndGoUpBookmapWallReversal);
}

export const createTradebooksForRangeBoundReversal = (
    symbol: string,
    rangeBoundPlan: TradingPlansModels.RangeBoundReversalPlan,
    tradebooksMap: Map<string, Tradebook>) => {
    let rawSupport = rangeBoundPlan.support;
    let rawResistance = rangeBoundPlan.resistance;
    if (!rawSupport || !Number.isFinite(rawSupport.low) || !Number.isFinite(rawSupport.high) ||
        !rawResistance || !Number.isFinite(rawResistance.low) || !Number.isFinite(rawResistance.high)) {
        return;
    }
    let support: TradingPlansModels.LevelArea = {
        low: Math.min(rawSupport.low, rawSupport.high),
        high: Math.max(rawSupport.low, rawSupport.high),
    };
    let resistance: TradingPlansModels.LevelArea = {
        low: Math.min(rawResistance.low, rawResistance.high),
        high: Math.max(rawResistance.low, rawResistance.high),
    };
    if (support.low <= 0 || support.low === support.high ||
        resistance.low <= 0 || resistance.low === resistance.high ||
        support.high >= resistance.low) {
        return;
    }

    let bidReversal = new BookmapWallReversal(
        symbol, TradebookID.RangeBoundBidReversal, rangeBoundPlan, support.low);
    tradebooksMap.set(bidReversal.getID(), bidReversal);

    let offerRejection = new BookmapWallReversal(
        symbol, TradebookID.RangeBoundOfferReversal, rangeBoundPlan, resistance.high);
    tradebooksMap.set(offerRejection.getID(), offerRejection);
}

export const createAllTradebooks = (symbol: string) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    let tradebooksMap = new Map<string, Tradebook>();

    if (isDirectionEnabled(plan.long)) {
        if (plan.long.gapAndGoPlan) {
            createTradebooksForGapAndGo(symbol, plan.long.gapAndGoPlan, tradebooksMap);
        }

        if (plan.long.gapDownAndGoUpPlan) {
            createTradebooksForGapDownAndGoUp(symbol, plan.long.gapDownAndGoUpPlan, tradebooksMap);
        }
    }

    if (isDirectionEnabled(plan.short)) {
        if (plan.short.gapAndCrapPlan) {
            createTradebooksForGapAndCrap(symbol, plan.short.gapAndCrapPlan, tradebooksMap);
        }

        if (plan.short.gapDownAndGoDownPlan) {
            createTradebooksForGapDownAndGoDown(symbol, plan.short.gapDownAndGoDownPlan, tradebooksMap);
        }
    }

    if (plan.rangeBoundReversalPlan) {
        createTradebooksForRangeBoundReversal(symbol, plan.rangeBoundReversalPlan, tradebooksMap);
    }

    return tradebooksMap;
}

export const updateTradebooksStatusHighLevelCall = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (widget) {
        let openPriceToUse = Models.getCurrentPrice(symbol);
        let vwapToUse = Models.getCurrentVwap(symbol);
        let seconds = Helper.getSecondsSinceMarketOpen(new Date());
        if (seconds > 0) {
            let openPrice = Models.getOpenPrice(symbol);
            if (openPrice > 0) {
                openPriceToUse = openPrice;
            }
            let lastVwapBeforeOpen = Models.getLastVwapBeforeOpen(symbol);
            vwapToUse = lastVwapBeforeOpen;
        }
        updateTradebooksStatus(symbol, widget.tradebooks, openPriceToUse, vwapToUse);
    }
}

export const updateTradebooksStatus = (symbol: string, tradebooksMap: Map<string, Tradebook>, openPrice: number, lastVwapBeforeOpen: number) => {
    tradebooksMap.forEach(tradebook => {
        if (tradebook.enableByDefault) {
            tradebook.enable();
        } else {
            tradebook.disable();
        }
    });
}

export const refreshTradebooksStatus = () => {
    let wl = Models.getWatchlist();
    for (let i = 0; i < wl.length; i++) {
        refreshTradebooksStatusForSymbol(wl[i].symbol);
    }
}

export const refreshTradebooksStatusForSymbol = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    let tradebooksMap = widget.tradebooks;
    tradebooksMap.forEach(tradebook => {
        tradebook.refreshLiveStats();
    });
}

export const getTradebookByID = (symbol: string, tradebookID: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return null;
    }
    let tradebooksMap = widget.tradebooks;
    return tradebooksMap.get(tradebookID);
}

export const getBookmapTradebookButtonDefinitions = (symbol: string): BookmapTradebookButtonDefinition[] => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return [];
    }

    return getBookmapTradebookButtonDefinitionsFromMap(symbol, widget.tradebooks);
}

export const getBookmapTradebookButtonDefinitionsFromMap = (
    symbol: string,
    tradebooksMap: Map<string, Tradebook>
): BookmapTradebookButtonDefinition[] => {
    let tradebooks: BookmapTradebookButtonDefinition[] = [];
    tradebooksMap.forEach(tradebook => {
        if (!tradebook.isEnabled() && !tradebook.enableByDefault) {
            return;
        }

        let entryMethods = tradebook.getEntryMethods();
        if (entryMethods.length > 0) {
            tradebooks.push(createBookmapTradebookButtonDefinition(symbol, tradebook, entryMethods));
        }
    });
    return tradebooks;
}

const createBookmapTradebookButtonDefinition = (
    symbol: string,
    tradebook: Tradebook,
    entryMethods: string[],
): BookmapTradebookButtonDefinition => {
    return {
        id: `${symbol}:${tradebook.getID()}`,
        label: tradebook.buttonLabel,
        side: tradebook.isLong ? "long" : "short",
        tradebookId: tradebook.getID(),
        tradebookName: tradebook.name,
        entryMethods: entryMethods,
    };
}

export const onNewTimeAndSalesDataForSymbol = (symbol: string, newPrice: number) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    let tradebooksMap = widget.tradebooks;
    tradebooksMap.forEach(tradebook => {
        tradebook.onNewTimeSalesData(newPrice);
    });
}

export const onNewCandleCloseForSymbol = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    let tradebooksMap = widget.tradebooks;
    tradebooksMap.forEach(tradebook => {
        tradebook.onNewCandleClose();
    });
}
