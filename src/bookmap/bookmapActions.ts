/**
 * Handles priceSelect events from the Bookmap plugin.
 * Routes key+click combinations to specific trading actions.
 */

import * as Firestore from "../firestore";
import * as Helper from "../utils/helper";
import * as OrderFlow from "../controllers/orderFlow";
import * as Models from "../models/models";

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
    console.log(`[BookmapActions] Price selected [${symbol}]: $${price} keyCode=${keyCode}`);
    const key = keyCode.toLowerCase();

    if (key === "cmd" || key === "ctrl" || key === "control" || key === "meta") {
        setStopLossFromBookmap(symbol, price);
    } else if (key === "b") {
        setBuyLimitFromBookmap(symbol, price);
    } else if (key === "s") {
        setSellLimitFromBookmap(symbol, price);
    } else {
        console.log(`[BookmapActions] unhandled Price selected [${symbol}]: $${price} keyCode=${keyCode}`);
    }
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

/** B+Click: set buy limit order at the selected price. */
const setBuyLimitFromBookmap = (symbol: string, price: number) => {
    console.log(`[BookmapActions] Buy limit [${symbol}]: $${price}`);
    // TODO: implement buy limit logic
};

/** S+Click: set sell limit order at the selected price. */
const setSellLimitFromBookmap = (symbol: string, price: number) => {
    console.log(`[BookmapActions] Sell limit [${symbol}]: $${price}`);
    // TODO: implement sell limit logic
};
