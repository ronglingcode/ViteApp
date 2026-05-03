import * as Models from "../models/models";
import * as TradingPlans from "../models/tradingPlans/tradingPlans";
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import type { Tradebook } from "./baseTradebook";
import { VwapContinuationFailed } from "./singleKeyLevel/vwapContinuationFailed";
import * as Helper from "../utils/helper";
import { GapDownAndGoDown } from "./gapDownAndGoDown";
import { GapDownAndGoUpBookmapOfferWallBreakout } from "./gapDownAndGoUpBookmapOfferWallBreakout";
import { GapAndGoBookmapOfferWallBreakout } from "./gapAndGoBookmapOfferWallBreakout";
import { GapAndCrapBookmapBidWallBreakdown } from "./gapAndCrapBookmapBidWallBreakdown";
import { GapAndCrapBookmapRejection } from "./gapAndCrapBookmapRejection";
import { GapDownAndGoDownBookmapBidWallBreakdown } from "./gapDownAndGoDownBookmapBidWallBreakdown";

export const createAllTradebooks = (symbol: string) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    let shortPlan = plan.short.levelMomentumPlan;
    let scopeIsLong = false;

    let tradebooksMap = new Map<string, Tradebook>();

    if (plan.long.gapAndGoPlan) {
        let gapAndGoBookmapOfferWallBreakout = new GapAndGoBookmapOfferWallBreakout(symbol, plan.long.gapAndGoPlan);
        tradebooksMap.set(gapAndGoBookmapOfferWallBreakout.getID(), gapAndGoBookmapOfferWallBreakout);
    }

    if (plan.short.gapAndCrapPlan) {
        let maxPrice = plan.short.gapAndCrapPlan.aboveThisLevelNoMoreShort;
        let maxPriceKeyLevel: TradingPlansModels.LevelArea = {
            high: maxPrice,
            low: maxPrice
        };

        if (shortPlan) {
            let gapAndCrapVwapBounceFail = new VwapContinuationFailed(true, symbol, scopeIsLong, maxPriceKeyLevel, shortPlan);
            gapAndCrapVwapBounceFail.enableByDefault = true;
            tradebooksMap.set(gapAndCrapVwapBounceFail.getID(), gapAndCrapVwapBounceFail);

            let gapAndCrapBookmapBidWallBreakdown = new GapAndCrapBookmapBidWallBreakdown(symbol, shortPlan);
            tradebooksMap.set(gapAndCrapBookmapBidWallBreakdown.getID(), gapAndCrapBookmapBidWallBreakdown);

            let gapAndCrapBookmapRejection = new GapAndCrapBookmapRejection(symbol, shortPlan);
            tradebooksMap.set(gapAndCrapBookmapRejection.getID(), gapAndCrapBookmapRejection);
        }
    }

    if (plan.short.gapDownAndGoDownPlan) {
        let gapDownAndGoDown = new GapDownAndGoDown(symbol, false, plan.short.gapDownAndGoDownPlan);
        tradebooksMap.set(gapDownAndGoDown.getID(), gapDownAndGoDown);

        let maxPriceKeyLevel: TradingPlansModels.LevelArea = {
            high: plan.short.gapDownAndGoDownPlan.buyersTrappedBelowThisLevel || 0,
            low: plan.short.gapDownAndGoDownPlan.buyersTrappedBelowThisLevel || 0
        };
        if (shortPlan) {
            let gapDownAndGoDownVwapBounceFail = new VwapContinuationFailed(false, symbol, false, maxPriceKeyLevel, shortPlan);
            gapDownAndGoDownVwapBounceFail.enableByDefault = true;
            tradebooksMap.set(gapDownAndGoDownVwapBounceFail.getID(), gapDownAndGoDownVwapBounceFail);
        }

        let gapDownAndGoDownBookmapBidWallBreakdown = new GapDownAndGoDownBookmapBidWallBreakdown(symbol, plan.short.gapDownAndGoDownPlan);
        tradebooksMap.set(gapDownAndGoDownBookmapBidWallBreakdown.getID(), gapDownAndGoDownBookmapBidWallBreakdown);
    }

    if (plan.long.gapDownAndGoUpPlan) {
        let gapDownAndGoUpBookmapOfferWallBreakout = new GapDownAndGoUpBookmapOfferWallBreakout(symbol, plan.long.gapDownAndGoUpPlan);
        tradebooksMap.set(gapDownAndGoUpBookmapOfferWallBreakout.getID(), gapDownAndGoUpBookmapOfferWallBreakout);
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
