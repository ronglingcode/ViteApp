import * as Models from '../models/models';
import * as BookmapManager from './bookmapManager';
import type { OrderBookLevel, OrderBookSnapshot } from './bookmapModels';
import * as Firestore from '../firestore';
declare let window: Models.MyWindow;

/** Phase 1: log raw book data to understand format */
let logRawBookData: boolean = true;

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
 * Phase 1: Logs raw data to console and Firestore.
 * Phase 2: Parse into OrderBookSnapshot and feed to BookmapManager.
 */
export const handleBookData = (service: string, element: any): void => {
    if (logRawBookData) {
        console.log(`[BookData] Service: ${service}`);
        console.log(element);
        let summary = JSON.stringify(element).substring(0, 500);
        Firestore.logInfo(`BookData ${service}: ${summary}`);
    }

    // Phase 2: uncomment after analyzing logged data format
    /*
    let contents = element.content;
    if (!contents) return;

    contents.forEach((c: any) => {
        let symbol = c["key"];
        let snapshot = parseBookDataToSnapshot(c);
        if (snapshot) {
            BookmapManager.onOrderBookUpdate(symbol, snapshot);
        }
    });
    */
};

/**
 * Parse raw Schwab book data into an OrderBookSnapshot.
 * TODO: Implement after understanding the data format from logs.
 */
const parseBookDataToSnapshot = (_data: any): OrderBookSnapshot | null => {
    // Expected structure (hypothetical based on TDA reverse engineering):
    // data["1"] = bid levels array [{price, size, numOrders}]
    // data["2"] = ask levels array [{price, size, numOrders}]
    return null;
};

export const setLogRawBookData = (enabled: boolean): void => {
    logRawBookData = enabled;
};
