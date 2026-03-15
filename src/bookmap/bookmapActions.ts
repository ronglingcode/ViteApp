/**
 * Handles priceSelect events from the Bookmap plugin.
 * Routes key+click combinations to specific trading actions.
 */

import * as Firestore from "../firestore";
import * as Helper from "../utils/helper";

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
    Firestore.logInfo(`Price selected (${keyCode}): $${price}`, { symbol });

    const key = keyCode.toLowerCase();

    if (key === "cmd" || key === "ctrl" || key === "control" || key === "meta") {
        setStopLossFromBookmap(symbol, price);
    } else if (key === "b") {
        setBuyLimitFromBookmap(symbol, price);
    } else if (key === "s") {
        setSellLimitFromBookmap(symbol, price);
    } else {
        console.log(`[BookmapActions] Unhandled keyCode: ${keyCode}`);
        Helper.speak(`${symbol} price ${price}`);
    }
};

/** Cmd+Click or Ctrl+Click: set stop loss at the selected price. */
const setStopLossFromBookmap = (symbol: string, price: number) => {
    console.log(`[BookmapActions] Set stop loss [${symbol}]: $${price}`);
    Helper.speak(`stop loss ${price}`);
    // TODO: implement stop loss logic
};

/** B+Click: set buy limit order at the selected price. */
const setBuyLimitFromBookmap = (symbol: string, price: number) => {
    console.log(`[BookmapActions] Buy limit [${symbol}]: $${price}`);
    Helper.speak(`buy limit ${price}`);
    // TODO: implement buy limit logic
};

/** S+Click: set sell limit order at the selected price. */
const setSellLimitFromBookmap = (symbol: string, price: number) => {
    console.log(`[BookmapActions] Sell limit [${symbol}]: $${price}`);
    Helper.speak(`sell limit ${price}`);
    // TODO: implement sell limit logic
};
