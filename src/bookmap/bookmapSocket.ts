/**
 * WebSocket client for the Bookmap Wall Breakout Detector plugin.
 * Connects to the local WebSocket server and subscribes to
 * order book snapshots, heartbeats, and breakout signals.
 */

import { processOrderbookSnapshot } from "./largeOrderTracker";
import * as Firestore from "../firestore";
import * as Helper from "../utils/helper";
import * as Models from "../models/models";
declare let window: Models.MyWindow;

const BOOKMAP_WS_URL = "ws://localhost:8765";
const RECONNECT_DELAY_MS = 3000;
const ORDERBOOK_INTERVAL_MS = 1000;

let websocket: WebSocket | null = null;

export const createWebSocket = () => {
    console.log(`[BookmapSocket] Connecting to ${BOOKMAP_WS_URL}...`);
    websocket = new WebSocket(BOOKMAP_WS_URL);

    websocket.onopen = function () {
        console.log("[BookmapSocket] Connected");
        subscribeToOrderbook();
    };

    websocket.onmessage = function (messageEvent) {
        let data = JSON.parse(messageEvent.data);
        let type = data.type;

        if (type === "heartbeat") {
            // price tracked via heartbeat if needed later
        } else if (type === "breakout") {
            console.log(`[BookmapSocket] BREAKOUT [${data.symbol}]: level=${data.breakoutLevel}, swingLow=${data.swingLow}, timestamp=${data.timestamp}`);
        } else if (type === "orderbook") {
            const symbol = data.symbol || "???";
            //console.log(`[BookmapSocket] Orderbook [${symbol}]: ${data.largeBids.length} largeBids, ${data.largeAsks.length} largeAsks`);
            let atr = 0;
            try { atr = Models.getAtr(symbol).average; } catch (e) { /* no plan loaded yet */ }
            const { appeared, disappeared } = processOrderbookSnapshot(data, atr);

            for (const order of appeared) {
                //Firestore.logInfo(`NEW large ${order.side} wall [${symbol}]: $${order.price} x ${order.size}`, { symbol });
            }
            for (const order of disappeared) {
                //Firestore.logInfo(`GONE large ${order.side} wall [${symbol}]: $${order.price} x ${order.size}`, { symbol });
            }
            if (appeared.length > 0 || disappeared.length > 0) {
                //  Helper.speak("large order update");
            }
        } else if (type === "priceSelect") {
            const symbol = data.symbol || "???";
            const keyCode = data.keyCode || "cmd";
            console.log(`[BookmapSocket] Price selected [${symbol}]: $${data.price} keyCode=${keyCode}`);
            Firestore.logInfo(`Price selected (${keyCode}): $${data.price}`, { symbol });
            Helper.speak(`${symbol} price ${data.price}`);
        } else if (type === "subscribed") {
            console.log(`[BookmapSocket] Subscribed to ${data.channel} (interval=${data.intervalMs}ms, levels=${data.levels})`);
        } else if (type === "unsubscribed") {
            console.log(`[BookmapSocket] Unsubscribed from ${data.channel}`);
        } else {
            console.log(`[BookmapSocket] Unknown message type: ${type}`, data);
        }
    };

    websocket.onclose = function () {
        console.log(`[BookmapSocket] Disconnected, reconnecting in ${RECONNECT_DELAY_MS}ms...`);
        websocket = null;
        setTimeout(createWebSocket, RECONNECT_DELAY_MS);
    };

    websocket.onerror = function (error) {
        console.error("[BookmapSocket] WebSocket error:", error);
    };

    return websocket;
};

const subscribeToOrderbook = () => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
            type: "subscribe",
            channel: "orderbook",
        }));
    }
};
