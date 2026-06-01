/**
 * WebSocket client for the Bookmap Active Trader plugin.
 * Connects to the local WebSocket server and subscribes to
 * order book snapshots, heartbeats, and breakout signals.
 */

import { handlePriceSelect } from "./bookmapActions";
import * as Helper from "../utils/helper";
import * as Models from "../models/models";
import * as TradingPlans from "../models/tradingPlans/tradingPlans";
import * as TradebooksManager from "../tradebooks/tradebooksManager";
import * as KeyboardHandler from "../controllers/keyboardHandler";
declare let window: Models.MyWindow;

const BOOKMAP_WS_URL = "ws://localhost:8765";
const RECONNECT_DELAY_MS = 3000;
const CONFIG_PUSH_INTERVAL_MS = 60_000;

interface BookmapKeyLevel {
    price: number;
    label?: string;
}

/** Normalize symbol e.g. "ADBE:NASDAQ:STOCKS@BMD" -> "ADBE" */
const normalizeSymbol = (raw: string): string => {
    if (!raw) return "???";
    const first = raw.split(":")[0];
    return first || raw;
};

let websocket: WebSocket | null = null;
let configPushIntervalId: ReturnType<typeof setInterval> | null = null;

export const createWebSocket = () => {
    console.log(`[BookmapSocket] Connecting to ${BOOKMAP_WS_URL}...`);
    websocket = new WebSocket(BOOKMAP_WS_URL);

    websocket.onopen = function () {
        console.log("[BookmapSocket] Connected");
        subscribeToOrderbook();
        pushBookmapConfigsForAllSymbols();
        startPeriodicConfigPush();
    };

    websocket.onmessage = function (messageEvent) {
        let data = JSON.parse(messageEvent.data);
        let type = data.type;
        if (type === "orderbook") {
            return;
        }
        if (type !== "custom_button_click") {
            console.log(data);
        }
        let symbol = normalizeSymbol(data.symbol || "");
        let newPrice = Helper.roundPrice(symbol, data.price || 0);


        if (type === "heartbeat") {
            // price tracked via heartbeat if needed later
        } else if (type === "breakout") {
            console.log(`[BookmapSocket] BREAKOUT [${symbol}]: level=${data.breakoutLevel}, timestamp=${data.timestamp}`);
        } else if (type === "priceSelect") {
            handlePriceSelect({
                symbol,
                price: newPrice,
                keyCode: data.keyCode || "cmd",
                timestamp: data.timestamp,
            });
        } else if (type === "custom_button_click") {
            console.log("[BookmapSocket] custom_button_click");
            console.log(data)
            handleCustomButtonClick(data);
        } else if (type === "subscribed") {
            console.log(`[BookmapSocket] Subscribed to ${data.channel}(interval = ${data.intervalMs}ms, levels = ${data.levels})`);
        } else if (type === "unsubscribed") {
            console.log(`[BookmapSocket] Unsubscribed from ${data.channel}`);
        } else {
            console.log(`[BookmapSocket] Unknown message type: ${type}`, data);
        }
    };

    websocket.onclose = function () {
        console.log(`[BookmapSocket] Disconnected, reconnecting in ${RECONNECT_DELAY_MS}ms...`);
        stopPeriodicConfigPush();
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

const pushBookmapConfigsForAllSymbols = () => {
    sendTradeButtonConfigsForAllSymbols();
    sendKeyLevelConfigsForAllSymbols();
};

const startPeriodicConfigPush = () => {
    if (configPushIntervalId !== null) {
        return;
    }
    configPushIntervalId = setInterval(pushBookmapConfigsForAllSymbols, CONFIG_PUSH_INTERVAL_MS);
};

const stopPeriodicConfigPush = () => {
    if (configPushIntervalId === null) {
        return;
    }
    clearInterval(configPushIntervalId);
    configPushIntervalId = null;
};

export const sendTradeButtonConfigsForAllSymbols = () => {
    let watchlist = Models.getWatchlist();
    for (let i = 0; i < watchlist.length; i++) {
        sendTradeButtonConfigForSymbol(watchlist[i].symbol);
    }
};

export const sendTradeButtonConfigForSymbol = (symbol: string) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        return;
    }

    let tradebooks = TradebooksManager.getBookmapTradebookButtonDefinitions(symbol);
    websocket.send(JSON.stringify({
        type: "trade_button_config",
        symbol: symbol,
        tradebooks: tradebooks,
        timestamp: Date.now(),
    }));
    console.log(`[BookmapSocket] Sent ${tradebooks.length} tradebook button groups for ${symbol}`);
};

export const sendKeyLevelConfigsForAllSymbols = () => {
    let watchlist = Models.getWatchlist();
    for (let i = 0; i < watchlist.length; i++) {
        sendKeyLevelConfigForSymbol(watchlist[i].symbol);
    }
};

export const sendKeyLevelConfigForSymbol = (symbol: string) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        return;
    }

    const levels = getBookmapKeyLevelsForSymbol(symbol);
    websocket.send(JSON.stringify({
        type: "key_levels_config",
        symbol: symbol,
        levels: levels,
        timestamp: Date.now(),
    }));
    console.log(`[BookmapSocket] Sent ${levels.length} key levels for ${symbol}`);
};

const getBookmapKeyLevelsForSymbol = (symbol: string): BookmapKeyLevel[] => {
    const plan = TradingPlans.getTradingPlansWithoutDefault(symbol);
    const rawLevels = plan?.keyLevels?.otherLevels ?? [];
    const seen = new Set<number>();
    const levels: BookmapKeyLevel[] = [];

    for (const price of rawLevels) {
        if (!Number.isFinite(price) || price <= 0 || seen.has(price)) {
            continue;
        }
        seen.add(price);
        levels.push({ price });
    }
    return levels;
};

const handleCustomButtonClick = (data: any) => {
    let symbol = normalizeSymbol(data.symbol || "");
    let keyCode = getString(data.keyCode || data.key_code);
    if (keyCode) {
        console.log(`[BookmapSocket] Handling ${data.button_name || data.button_id || "button"} as ${keyCode} for ${symbol}`);
        KeyboardHandler.handleKeyPressed(keyCode, false, symbol);
        return;
    }

    let tradebookId = getString(data.tradebook_id || data.tradebookId);
    let entryMethod = getString(data.entry_method || data.entryMethod);
    let useMarketOrder = data.use_market_order === true || data.useMarketOrder === true;

    if (!tradebookId) {
        console.warn("[BookmapSocket] custom_button_click missing tradebook_id", data);
        return;
    }

    let tradebook = TradebooksManager.getTradebookByID(symbol, tradebookId);
    if (!tradebook) {
        console.warn(`[BookmapSocket] tradebook not found for ${symbol}: ${tradebookId}`, data);
        return;
    }

    console.log(`[BookmapSocket] Starting ${tradebook.buttonLabel} ${entryMethod} for ${symbol}`);
    tradebook.startEntry(useMarketOrder, false, {
        ...Models.getDefaultEntryParameters(),
        entryMethod: entryMethod || undefined,
    });
};

const getString = (value: any): string => {
    return typeof value === "string" ? value : "";
};
