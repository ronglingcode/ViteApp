import * as Models from "../models/models";
import * as TradingPlans from "../models/tradingPlans/tradingPlans";
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import type { Tradebook } from "./baseTradebook";
import { VwapContinuationFailed } from "./singleKeyLevel/vwapContinuationFailed";
import * as Helper from "../utils/helper";
import { BookmapWallBreak } from "./bookmapWallBreak";
import { BookmapWallReversal } from "./bookmapWallReversal";
import { TradebookID } from "./tradebookIds";

export const createTradebooksForGapAndGo = (symbol: string, gapAndGoPlan: TradingPlansModels.GapAndGoPlan, tradebooksMap: Map<string, Tradebook>) => {
    let gapAndGoBookmapOfferWallBreakout = new BookmapWallBreak(
        symbol, TradebookID.GapAndGoBookmapOfferWallBreakout, gapAndGoPlan, gapAndGoPlan.mustOpenAboveVwap, gapAndGoPlan.support.low);
    tradebooksMap.set(gapAndGoBookmapOfferWallBreakout.getID(), gapAndGoBookmapOfferWallBreakout);
    let gapGiveAndGo = new BookmapWallReversal(
        symbol, TradebookID.GapGiveAndGoBookmapReversal, gapAndGoPlan, gapAndGoPlan.support.low,
    );
    tradebooksMap.set(TradebookID.GapGiveAndGoBookmapReversal, gapGiveAndGo);
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
        let gapAndCrapVwapBounceFail = new VwapContinuationFailed(
            symbol, TradebookID.GapAndCrapShortVwapBounceFailed, true, scopeIsLong, maxPriceKeyLevel, shortPlan);
        gapAndCrapVwapBounceFail.enableByDefault = true;
        tradebooksMap.set(gapAndCrapVwapBounceFail.getID(), gapAndCrapVwapBounceFail);

        let gapAndCrapBookmapBidWallBreakdown = new BookmapWallBreak(
            symbol, TradebookID.GapAndCrapBookmapBidWallBreakdown, gapAndCrapPlan, false, maxPrice);
        tradebooksMap.set(gapAndCrapBookmapBidWallBreakdown.getID(), gapAndCrapBookmapBidWallBreakdown);

        let gapAndCrapBookmapWallReversal = new BookmapWallReversal(
            symbol, TradebookID.GapAndCrapBookmapReversal, gapAndCrapPlan, maxPrice);
        tradebooksMap.set(gapAndCrapBookmapWallReversal.getID(), gapAndCrapBookmapWallReversal);
    }
}

export const createTradebooksForGapDownAndGoDown = (symbol: string, gapPlan: TradingPlansModels.GapDownAndGoDownPlan, tradebooksMap: Map<string, Tradebook>) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    let shortPlan = plan.short.levelMomentumPlan;

    let maxPriceKeyLevel: TradingPlansModels.LevelArea = {
        high: gapPlan.buyersTrappedBelowThisLevel || 0,
        low: gapPlan.buyersTrappedBelowThisLevel || 0
    };
    if (shortPlan) {
        let gapDownAndGoDownVwapBounceFail = new VwapContinuationFailed(
            symbol, TradebookID.GapDownAndGoDownShortVwapBounceFailed, false, false, maxPriceKeyLevel, shortPlan);
        gapDownAndGoDownVwapBounceFail.enableByDefault = true;
        tradebooksMap.set(gapDownAndGoDownVwapBounceFail.getID(), gapDownAndGoDownVwapBounceFail);
    }

    let gapDownAndGoDownBookmapBidWallBreakdown = new BookmapWallBreak(
        symbol, TradebookID.GapDownAndGoDownBookmapBidWallBreakdown, gapPlan, false, maxPriceKeyLevel.high);
    tradebooksMap.set(gapDownAndGoDownBookmapBidWallBreakdown.getID(), gapDownAndGoDownBookmapBidWallBreakdown);
}

export const createTradebooksForGapDownAndGoUp = (symbol: string, gapPlan: TradingPlansModels.GapDownAndGoUpPlan, tradebooksMap: Map<string, Tradebook>) => {
    let minSupport = gapPlan.support.length > 0 ? gapPlan.support[0].low : 0;

    let gapDownAndGoUpBookmapOfferWallBreakout = new BookmapWallBreak(
        symbol, TradebookID.GapDownAndGoUpBookmapOfferWallBreakout, gapPlan, false, minSupport);
    tradebooksMap.set(gapDownAndGoUpBookmapOfferWallBreakout.getID(), gapDownAndGoUpBookmapOfferWallBreakout);

    let gapDownAndGoUpBookmapWallReversal = new BookmapWallReversal(
        symbol, TradebookID.GapDownAndGoUpBookmapReversal, gapPlan, minSupport);
    tradebooksMap.set(gapDownAndGoUpBookmapWallReversal.getID(), gapDownAndGoUpBookmapWallReversal);
}

export const createAllTradebooks = (symbol: string) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    let tradebooksMap = new Map<string, Tradebook>();

    if (plan.long.gapAndGoPlan) {
        createTradebooksForGapAndGo(symbol, plan.long.gapAndGoPlan, tradebooksMap);
    }

    if (plan.short.gapAndCrapPlan) {
        createTradebooksForGapAndCrap(symbol, plan.short.gapAndCrapPlan, tradebooksMap);
    }

    if (plan.short.gapDownAndGoDownPlan) {
        createTradebooksForGapDownAndGoDown(symbol, plan.short.gapDownAndGoDownPlan, tradebooksMap);
    }

    if (plan.long.gapDownAndGoUpPlan) {
        createTradebooksForGapDownAndGoUp(symbol, plan.long.gapDownAndGoUpPlan, tradebooksMap);
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

export const onNewTimeAndSalesDataForSymbol = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    let tradebooksMap = widget.tradebooks;
    tradebooksMap.forEach(tradebook => {
        tradebook.onNewTimeSalesData();
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
