/**
 * Handles priceSelect events from the Bookmap plugin.
 * Routes key+click combinations to specific trading actions.
 */

import * as Firestore from "../firestore";
import * as Helper from "../utils/helper";
import * as OrderFlow from "../controllers/orderFlow";
import * as Handler from "../controllers/handler";
import * as Models from "../models/models";
import { BookmapBigWallBreakout } from "../tradebooks/bookmapBigWallBreakout";
import { BookmapBigWallBreakdownFailLong } from "../tradebooks/bookmapBigWallBreakdownFailLong";
import { PremarketHighRejection } from "../tradebooks/premarketHighRejection";
import * as TradebooksManager from "../tradebooks/tradebooksManager";

export interface PriceSelectEvent {
    symbol: string;
    price: number;
    keyCode: string;
    timestamp: number;
}

/**
 * Main router for priceSelect events from Bookmap.
 * Dispatches to the appropriate handler based on keyCode.
 */
export const handlePriceSelect = (event: PriceSelectEvent) => {
    const { symbol, price, keyCode } = event;
    const rawKey = keyCode.toLowerCase().trim();
    // Normalize "1+alt" -> "1" so plugin can send either format.
    const key = rawKey.replace(/\+alt$/, '');
    const digit = parseDigitHotkey(key);
    let newPrice = price;
    Firestore.logInfo(`[Bookmap Processed] Price selected [${symbol}]: $${price}, rawKey=${keyCode} keyCode=${key}`);
    if (!Helper.isInActiveHoursOfMarket()) {
        //return;
    }

    if (key === "cmd" || key === "ctrl" || key === "control" || key === "meta") {
        setStopLossFromBookmap(symbol, price);
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

    if (isLong) {
        const tradebookId = `${Models.TradebookFamilyName.GapAndGo}-${BookmapBigWallBreakout.bookmapBigWallBreakoutLong}`;
        const tradebook = TradebooksManager.getTradebookByID(symbol, tradebookId);
        if (!tradebook) {
            Firestore.logError(`[BookmapActions] BookmapBigWallBreakout long tradebook not found for ${symbol} (id: ${tradebookId})`, logTags);
            return;
        }
        if (!(tradebook instanceof BookmapBigWallBreakout) || !tradebook.isLong) {
            Firestore.logError(`[BookmapActions] tradebook ${tradebookId} is not a long BookmapBigWallBreakout`, logTags);
            return;
        }
        if (!tradebook.isEnabled()) {
            Firestore.logError(`[BookmapActions] BookmapBigWallBreakout long tradebook disabled for ${symbol}`, logTags);
            return;
        }
        Firestore.logInfo(`[BookmapActions] bookmapEntry long: ${tradebookId} stop=$${stopLossPrice}`, logTags);
        tradebook.triggerEntryFromBookmap(useMarketOrder, stopLossPrice);
    } else {
        const tradebookId = `${Models.TradebookFamilyName.GapAndCrap}-${PremarketHighRejection.gapAndCrapShort}`;
        const tradebook = TradebooksManager.getTradebookByID(symbol, tradebookId);
        if (!tradebook) {
            Firestore.logError(`[BookmapActions] GapAndCrap tradebook not found for ${symbol} (id: ${tradebookId})`, logTags);
            return;
        }
        if (!tradebook.isEnabled()) {
            Firestore.logError(`[BookmapActions] GapAndCrap tradebook disabled for ${symbol}`, logTags);
            return;
        }
        Firestore.logInfo(`[BookmapActions] bookmapEntry short: ${tradebookId} stop=$${stopLossPrice}`, logTags);
        tradebook.startEntry(useMarketOrder, false, Models.getDefaultEntryParameters());
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

/** Same composite IDs as Tradebook.buildID for long bookmap strategies. */
const BOOKMAP_BIG_WALL_LONG_TRADEBOOK_IDS: string[] = [
    `${Models.TradebookFamilyName.GapAndGo}-${BookmapBigWallBreakout.bookmapBigWallBreakoutLong}`,
    `${Models.TradebookFamilyName.GapDownAndGoUp}-${BookmapBigWallBreakout.bookmapBigWallBreakoutLong}`,
];


/** Same composite IDs as Tradebook.buildID(familyName, BookmapBigWallBreakoutShort). */
const BOOKMAP_BIG_WALL_SHORT_TRADEBOOK_IDS: string[] = [
    `${Models.TradebookFamilyName.GapAndCrap}-${BookmapBigWallBreakout.bookmapBigWallBreakoutShort}`,
    `${Models.TradebookFamilyName.GapDownAndGoDown}-${BookmapBigWallBreakout.bookmapBigWallBreakoutShort}`,
];

