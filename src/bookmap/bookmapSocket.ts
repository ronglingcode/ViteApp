/**
 * WebSocket client for the Bookmap Wall Breakout Detector plugin.
 * Connects to the local WebSocket server and subscribes to
 * order book snapshots, heartbeats, and breakout signals.
 */

const BOOKMAP_WS_URL = "ws://localhost:8765";
const RECONNECT_DELAY_MS = 3000;
const ORDERBOOK_INTERVAL_MS = 1000;
const ORDERBOOK_LEVELS = 20;

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
            console.log(`[BookmapSocket] Heartbeat: price=${data.price}, timestamp=${data.timestamp}`);
        } else if (type === "breakout") {
            console.log(`[BookmapSocket] BREAKOUT: level=${data.breakoutLevel}, swingLow=${data.swingLow}, timestamp=${data.timestamp}`);
        } else if (type === "orderbook") {
            console.log(`[BookmapSocket] Orderbook: ${data.bids.length} bids, ${data.asks.length} asks, timestamp=${data.timestamp}`);
            console.log(`[BookmapSocket]   Best bid: ${data.bids[0]?.[0]} @ ${data.bids[0]?.[1]}`);
            console.log(`[BookmapSocket]   Best ask: ${data.asks[0]?.[0]} @ ${data.asks[0]?.[1]}`);
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
            intervalMs: ORDERBOOK_INTERVAL_MS,
            levels: ORDERBOOK_LEVELS,
        }));
    }
};
