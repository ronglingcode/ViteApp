/**
 * Handles priceSelect events from the Bookmap plugin.
 * Routes key+click combinations to specific trading actions.
 */

import * as Firestore from "../firestore";
import * as Helper from "../utils/helper";
import * as OrderFlow from "../controllers/orderFlow";
import * as Handler from "../controllers/handler";
import * as Models from "../models/models";
import { GapAndGoBookmapOfferWallBreakout } from "../tradebooks/gapAndGoBookmapOfferWallBreakout";
import { GapDownAndGoDownBookmapBidWallBreakdown } from "../tradebooks/gapDownAndGoDownBookmapBidWallBreakdown";
import { GapDownAndGoUpBookmapOfferWallBreakout } from "../tradebooks/gapDownAndGoUpBookmapOfferWallBreakout";
import { TradebookID } from "../tradebooks/tradebookIds";
import * as TradebooksManager from "../tradebooks/tradebooksManager";
import * as TradingPlans from "../models/tradingPlans/tradingPlans";
import * as Chart from "../ui/chart";
import { GapAndCrapBookmapBidWallBreakdown } from "../tradebooks/gapAndCrapBookmapBidWallBreakdown";

export interface PriceSelectEvent {
    symbol: string;
    price: number;
    keyCode: string;
    timestamp: number;
}

/** remove keys like ctrl, alt */
const cleanKeys = (keys: string[]) => {
    return keys.filter(k => k !== "ctrl" && k !== "control" && k !== "meta" && k !== "alt");
};

/**
 * Main router for priceSelect events from Bookmap.
 * Dispatches to the appropriate handler based on keyCode.
 */
export const handlePriceSelect = (event: PriceSelectEvent) => {
    const { symbol, price, keyCode } = event;
    const rawKey = keyCode.toLowerCase().trim();
    const splitKeys = rawKey.split('+').map(k => k.trim());
    const cleanedKeys = cleanKeys(splitKeys);
    if (cleanedKeys.length !== 1) {
        Firestore.logError(`[BookmapActions] Unexpected combination of keys in priceSelect. rawKey=${rawKey}`);
        return;
    }

    // Normalize "1+alt" -> "1" so plugin can send either format.
    const key = cleanedKeys[0];
    const digit = parseDigitHotkey(key);
    let newPrice = price;
    Firestore.logInfo(`[Bookmap Processed] Price selected [${symbol}]: $${price}, keyCode=${key}`);

    if (key === "e") {
        Chart.drawEntry(symbol, price);
    } else if (key === "b") {
        bookmapEntry(symbol, true, price);
    } else if (key === "s") {
        bookmapEntry(symbol, false, price);
    } else if (key === "g") {
        let logTags = Models.generateLogTags(symbol, `${symbol}-bookmap-g`);
        let positionIsLong = Models.getPositionNetQuantity(symbol) > 0;
        let isStopLeg = OrderFlow.isStopLeg(symbol, newPrice);
        let exitPairs = Models.getExitPairs(symbol);
        for (let i = 0; i < exitPairs.length / 2; i++) {
            let pair = exitPairs[i];
            OrderFlow.adjustExitPairsWithNewPrice(symbol, [pair], newPrice, isStopLeg, positionIsLong, logTags);
        }
    } else if (key === "t") {
        console.log("trying bookmap actions for t");
        let logTags = Models.generateLogTags(symbol, `${symbol}-bookmap-t`);
        Handler.adjustAllExits(symbol, newPrice, logTags);
    } else if (digit !== null) {
        adjustSingleExitFromBookmap(symbol, price, digit);
    } else {
        console.log(`[BookmapActions] unhandled Price selected [${symbol}]: $${price} keyCode=${keyCode}`);
    }
};

const bookmapEntry = (symbol: string, useMarketOrder: boolean, stopLossPrice: number) => {
    let currentPrice = Models.getCurrentPrice(symbol);
    let isLong = stopLossPrice < currentPrice;
    const logTags = Models.generateLogTags(symbol, `${symbol}-bookmap-entry`);
    const gapUp = Models.isGappedUp(symbol);
    let minutes = Helper.getMinutesSinceMarketOpen(new Date());
    let isTestMode = minutes < 0 || minutes > (60 * 3);

    if (isLong) {
        if (gapUp) {
            const directionPlan = TradingPlans.getTradingPlansForSingleDirection(symbol, true);
            if (!directionPlan.gapAndGoPlan) {
                Firestore.logError(`[BookmapActions] no gapAndGoPlan in trading plan for ${symbol}`, logTags);
                return;
            }
            const tradebookId = TradebookID.GapAndGoBookmapOfferWallBreakout;
            const tradebook = TradebooksManager.getTradebookByID(symbol, tradebookId);
            if (!tradebook) {
                Firestore.logError(`[BookmapActions] GapAndGoBookmapOfferWallBreakout tradebook not found for ${symbol} (id: ${tradebookId})`, logTags);
                return;
            }
            if (!(tradebook instanceof GapAndGoBookmapOfferWallBreakout)) {
                Firestore.logError(`[BookmapActions] tradebook ${tradebookId} is not a GapAndGoBookmapOfferWallBreakout`, logTags);
                return;
            }
            if (!tradebook.isEnabled()) {
                Firestore.logError(`[BookmapActions] GapAndGoBookmapOfferWallBreakout tradebook disabled for ${symbol}`, logTags);
                return;
            }
            Firestore.logInfo(`[BookmapActions] bookmapEntry long gap up: ${tradebookId} stop=$${stopLossPrice}`, logTags);
            if (!isTestMode) {
                tradebook.triggerEntryFromBookmap(useMarketOrder, stopLossPrice);
            }
        } else {
            const directionPlan = TradingPlans.getTradingPlansForSingleDirection(symbol, true);
            if (!directionPlan.gapDownAndGoUpPlan) {
                Firestore.logError(`[BookmapActions] no gapDownAndGoUpPlan in trading plan for ${symbol}`, logTags);
                return;
            }
            const tradebookId = TradebookID.GapDownAndGoUpBookmapOfferWallBreakout;
            const tradebook = TradebooksManager.getTradebookByID(symbol, tradebookId);
            if (!tradebook) {
                Firestore.logError(`[BookmapActions] GapDownAndGoUpBookmapOfferWallBreakout tradebook not found for ${symbol} (id: ${tradebookId})`, logTags);
                return;
            }
            if (!(tradebook instanceof GapDownAndGoUpBookmapOfferWallBreakout)) {
                Firestore.logError(`[BookmapActions] tradebook ${tradebookId} is not a GapDownAndGoUpBookmapOfferWallBreakout`, logTags);
                return;
            }
            if (!tradebook.isEnabled()) {
                Firestore.logError(`[BookmapActions] GapDownAndGoUpBookmapOfferWallBreakout tradebook disabled for ${symbol}`, logTags);
                return;
            }
            Firestore.logInfo(`[BookmapActions] bookmapEntry long gap down: ${tradebookId} stop=$${stopLossPrice}`, logTags);
            if (!isTestMode) {
                tradebook.triggerEntryFromBookmap(useMarketOrder, stopLossPrice);
            }
        }
    } else {
        if (gapUp) {
            const directionPlan = TradingPlans.getTradingPlansForSingleDirection(symbol, false);
            if (!directionPlan.gapAndCrapPlan) {
                Firestore.logError(`[BookmapActions] no gapAndCrapPlan in trading plan for ${symbol}`, logTags);
                return;
            }
            const tradebookId = TradebookID.GapAndCrapBookmapBidWallBreakdown;
            const tradebook = TradebooksManager.getTradebookByID(symbol, tradebookId);
            if (!tradebook) {
                Firestore.logError(`[BookmapActions] GapAndCrap tradebook not found for ${symbol} (id: ${tradebookId})`, logTags);
                return;
            }
            if (!(tradebook instanceof GapAndCrapBookmapBidWallBreakdown)) {
                Firestore.logError(`[BookmapActions] tradebook ${tradebookId} is not a GapAndCrapBookmapBidWallBreakdown`, logTags);
                return;
            }
            if (!tradebook.isEnabled()) {
                Firestore.logError(`[BookmapActions] GapAndCrap tradebook disabled for ${symbol}`, logTags);
                return;
            }
            Firestore.logInfo(`[BookmapActions] bookmapEntry short gap up: ${tradebookId} stop=$${stopLossPrice}`, logTags);
            if (!isTestMode) {
                tradebook.triggerEntryFromBookmap(useMarketOrder, stopLossPrice);
            }
        } else {
            const directionPlan = TradingPlans.getTradingPlansForSingleDirection(symbol, false);
            if (!directionPlan.gapDownAndGoDownPlan) {
                Firestore.logError(`[BookmapActions] no gapDownAndGoDownPlan in trading plan for ${symbol}`, logTags);
                return;
            }
            const tradebookId = TradebookID.GapDownAndGoDownBookmapBidWallBreakdown;
            const tradebook = TradebooksManager.getTradebookByID(symbol, tradebookId);
            if (!tradebook) {
                Firestore.logError(`[BookmapActions] GapDownAndGoDownBookmapBidWallBreakdown tradebook not found for ${symbol} (id: ${tradebookId})`, logTags);
                return;
            }
            if (!(tradebook instanceof GapDownAndGoDownBookmapBidWallBreakdown)) {
                Firestore.logError(`[BookmapActions] tradebook ${tradebookId} is not a GapDownAndGoDownBookmapBidWallBreakdown`, logTags);
                return;
            }
            if (!tradebook.isEnabled()) {
                Firestore.logError(`[BookmapActions] GapDownAndGoDownBookmapBidWallBreakdown tradebook disabled for ${symbol}`, logTags);
                return;
            }
            Firestore.logInfo(`[BookmapActions] bookmapEntry short gap down: ${tradebookId} stop=$${stopLossPrice}`, logTags);
            if (!isTestMode) {
                tradebook.triggerEntryFromBookmap(useMarketOrder, stopLossPrice);
            }
        }
    }
}

const parseDigitHotkey = (key: string): number | null => {
    // After normalization, accept plain digits "0" .. "9".
    if (/^[0-9]$/.test(key)) {
        return parseInt(key, 10);
    }
    // Also accept "alt+0" .. "alt+9" if it ever shows up.
    let m = key.match(/^alt\+([0-9])$/);
    if (!m) return null;
    let digit = parseInt(m[1], 10);
    return Number.isFinite(digit) ? digit : null;
};

const adjustSingleExitFromBookmap = (symbol: string, newPrice: number, digit: number) => {
    let logTags = Models.generateLogTags(symbol, `${symbol}-bookmap-alt-${digit}`);
    Firestore.logInfo("adjustSingleExitFromBookmap", logTags);
    let widget = Models.getChartWidget(symbol);
    if (!widget || !widget.exitOrderPairs || widget.exitOrderPairs.length <= 0) {
        return;
    }

    // Match keyboard behavior: 1->first pair ... 9->ninth pair, 0->tenth pair
    let number = digit === 0 ? 10 : digit;
    let index = number - 1;
    if (index < 0 || widget.exitOrderPairs.length <= index) {
        Firestore.logError(`exit pair index out of range for ${symbol}: digit=${digit}, pairs=${widget.exitOrderPairs.length}`, logTags);
        return;
    }

    let pair = widget.exitOrderPairs[index];

    Firestore.logInfo(`[Bookmap] Adjust exit pair ${number}: $${newPrice}`, logTags);

    let positionIsLong = Models.getPositionNetQuantity(symbol) > 0;
    let useStopLeg = OrderFlow.isStopLeg(symbol, newPrice);
    OrderFlow.adjustExitPairsWithNewPrice(symbol, [pair], newPrice, useStopLeg, positionIsLong, logTags);
};

/** Cmd+Click or Ctrl+Click: set stop loss at the selected price. */
const setStopLossFromBookmap = (symbol: string, newPrice: number) => {
    let logTags = Models.generateLogTags(symbol, `set_stop_loss_from_bookmap`);
    Firestore.logInfo(`[Bookmap] Set stop loss: $${newPrice}`, logTags);
    let positionIsLong = Models.getPositionNetQuantity(symbol) > 0;
    let exitPairs = Models.getExitPairs(symbol);
    for (let i = 0; i < exitPairs.length / 2; i++) {
        let pair = exitPairs[i];
        OrderFlow.adjustExitPairsWithNewPrice(symbol, [pair], newPrice, true, positionIsLong, logTags);
    }
};


