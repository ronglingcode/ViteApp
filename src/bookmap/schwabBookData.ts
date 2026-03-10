import * as Models from '../models/models';
import * as BookmapManager from './bookmapManager';
import type { OrderBookLevel, OrderBookSnapshot } from './bookmapModels';
import * as Firestore from '../firestore';
import * as GlobalSettings from '../config/globalSettings';
declare let window: Models.MyWindow;

/** Phase 1: log raw book data to understand format */
let logRawBookData: boolean = GlobalSettings.enableBookDataLogging;

/**
 * Subscribe to Schwab NASDAQ_BOOK and LISTED_BOOK streaming.
 * Called after the ADMIN LOGIN response succeeds.
 */
export const subscribeBookData = (webSocket: WebSocket): void => {
    let streamerInfo = window.HybridApp.Secrets.schwab;
    let symbols = Models.getWatchlistSymbolsInString();

    let nasdaqRequest = {
        "service": "NASDAQ_BOOK",
        "requestid": "10",
        "command": "SUBS",
        "SchwabClientCustomerId": streamerInfo.schwabClientCustomerId,
        "SchwabClientCorrelId": streamerInfo.schwabClientCorrelId,
        "parameters": {
            "keys": symbols,
            "fields": "0,1,2,3"
        }
    };
    webSocket.send(JSON.stringify(nasdaqRequest));

    let listedRequest = {
        "service": "LISTED_BOOK",
        "requestid": "11",
        "command": "SUBS",
        "SchwabClientCustomerId": streamerInfo.schwabClientCustomerId,
        "SchwabClientCorrelId": streamerInfo.schwabClientCorrelId,
        "parameters": {
            "keys": symbols,
            "fields": "0,1,2,3"
        }
    };
    webSocket.send(JSON.stringify(listedRequest));

    Firestore.logInfo("Subscribed to NASDAQ_BOOK and LISTED_BOOK");
};

/**
 * Handle incoming book data messages.
 *
 * Schwab book data format (numeric keys):
 *   content[].key = symbol
 *   content[]."1" = book timestamp (ms)
 *   content[]."2" = bids array: [{ "0": price, "1": totalVolume, "2": numBids, "3": exchanges[] }]
 *   content[]."3" = asks array: [{ "0": price, "1": totalVolume, "2": numAsks, "3": exchanges[] }]
 */
export const handleBookData = (service: string, element: any): void => {
    if (logRawBookData) {
        console.log(`[BookData] Service: ${service}`);
        console.log(element);
    }

    let contents = element.content;
    if (!contents) return;

    contents.forEach((c: any) => {
        let symbol = c["key"];
        let snapshot = parseBookDataToSnapshot(c);
        if (snapshot) {
            BookmapManager.onOrderBookUpdate(symbol, snapshot);
        }
    });
};

/**
 * Parse raw Schwab book data into an OrderBookSnapshot.
 *
 * Raw format uses numeric string keys:
 *   data["1"] = timestamp (ms)
 *   data["2"] = bid levels: [{ "0": price, "1": totalVolume }]
 *   data["3"] = ask levels: [{ "0": price, "1": totalVolume }]
 */
const parseBookDataToSnapshot = (data: any): OrderBookSnapshot | null => {
    let rawBids = data["2"];
    let rawAsks = data["3"];
    let bookTime = data["1"] || Date.now();

    if (!rawBids && !rawAsks) return null;

    let bids: OrderBookLevel[] = [];
    let asks: OrderBookLevel[] = [];

    if (Array.isArray(rawBids)) {
        for (let level of rawBids) {
            let price = level["0"];
            let size = level["1"];
            if (price != null && size != null) {
                bids.push({ price, size, lastUpdate: bookTime });
            }
        }
    }

    if (Array.isArray(rawAsks)) {
        for (let level of rawAsks) {
            let price = level["0"];
            let size = level["1"];
            if (price != null && size != null) {
                asks.push({ price, size, lastUpdate: bookTime });
            }
        }
    }

    if (bids.length === 0 && asks.length === 0) return null;

    return { bids, asks, lastUpdate: bookTime };
};

export const setLogRawBookData = (enabled: boolean): void => {
    logRawBookData = enabled;
};
