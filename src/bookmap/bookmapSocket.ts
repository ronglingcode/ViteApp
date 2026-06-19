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
import * as Handler from "../controllers/handler";
import * as ExitOrderPairs from "../utils/exitOrderPairs";
import * as RiskManager from "../algorithms/riskManager";
declare let window: Models.MyWindow;

const BOOKMAP_WS_URL = "ws://localhost:8765";
const RECONNECT_DELAY_MS = 3000;
const CONFIG_PUSH_INTERVAL_MS = 60_000;

interface BookmapKeyLevel {
    price: number;
    label?: string;
}

interface BookmapPricePair {
    high?: number;
    low?: number;
}

interface BookmapMarketLevels {
    camPivots?: Partial<Models.CamarillaPivots>;
    previousDay?: BookmapPricePair;
    premarket?: BookmapPricePair;
}

interface BookmapPositionConfig {
    symbol: string;
    netQuantity: number;
    averagePrice: number;
    riskPercent: number;
}

interface BookmapOpenOrderConfig {
    orderID: string;
    role: string;
    orderType: string;
    quantity: number;
    isBuy: boolean;
    price?: number;
    source?: string;
    parentOrderID?: string;
    pairIndex?: number;
}

interface BookmapExecutionConfig {
    price: number;
    quantity: number;
    isBuy: boolean;
    positionEffectIsOpen: boolean;
    timeMs: number;
}

/** Normalize symbol e.g. "ADBE:NASDAQ:STOCKS@BMD" -> "ADBE" */
const normalizeSymbol = (raw: string): string => {
    if (!raw) return "???";
    const first = raw.split(":")[0];
    return first || raw;
};

let websocket: WebSocket | null = null;
let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
let configPushIntervalId: ReturnType<typeof setInterval> | null = null;
let accountUiRefreshListenerRegistered = false;
let actionLogListenerRegistered = false;
let marketLevelRefreshListenerRegistered = false;
const knownAccountSnapshotSymbols = new Set<string>();

export const createWebSocket = () => {
    if (websocket && (websocket.readyState === WebSocket.CONNECTING || websocket.readyState === WebSocket.OPEN)) {
        return websocket;
    }
    if (reconnectTimeoutId !== null) {
        clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
    }

    console.log(`[BookmapSocket] Connecting to ${BOOKMAP_WS_URL}...`);
    registerAccountUiRefreshListener();
    registerActionLogListener();
    registerMarketLevelRefreshListener();
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
        let rawPrice = getNumber(data.price);
        let newPrice = rawPrice > 0 ? Helper.roundPrice(symbol, rawPrice) : 0;


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
        if (reconnectTimeoutId === null) {
            reconnectTimeoutId = setTimeout(() => {
                reconnectTimeoutId = null;
                createWebSocket();
            }, RECONNECT_DELAY_MS);
        }
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
    sendExitOrderPairConfigsForAllSymbols();
    sendAccountStatesForAllSymbols();
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
    const marketLevels = getBookmapMarketLevelsForSymbol(symbol);
    websocket.send(JSON.stringify({
        type: "key_levels_config",
        symbol: symbol,
        levels: levels,
        camPivots: marketLevels.camPivots,
        previousDay: marketLevels.previousDay,
        premarket: marketLevels.premarket,
        timestamp: Date.now(),
    }));
    console.log(`[BookmapSocket] Sent ${levels.length} key levels for ${symbol}`
        + ` with market levels: cam=${Object.keys(marketLevels.camPivots ?? {}).length}`
        + ` prev=${marketLevels.previousDay ? 1 : 0}`
        + ` pm=${marketLevels.premarket ? 1 : 0}`);
};

export const sendExitOrderPairConfigsForAllSymbols = () => {
    let watchlist = Models.getWatchlist();
    for (let i = 0; i < watchlist.length; i++) {
        sendExitOrderPairConfigForSymbol(watchlist[i].symbol);
    }
};

export const sendExitOrderPairConfigForSymbol = (symbol: string) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        return;
    }

    let pairs = ExitOrderPairs.buildExitOrderPairConfigs(Models.getExitPairs(symbol));
    websocket.send(JSON.stringify({
        type: "exit_order_pairs_config",
        symbol: symbol,
        pairs: pairs,
        timestamp: Date.now(),
    }));
    console.log(`[BookmapSocket] Sent ${pairs.length} exit order pairs for ${symbol}`);
};

export const sendAccountStatesForAllSymbols = () => {
    let symbols = getAccountSnapshotSymbols();
    for (let i = 0; i < symbols.length; i++) {
        sendAccountStateForSymbol(symbols[i]);
    }
};

export const sendAccountStateForSymbol = (symbol: string) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        return;
    }

    knownAccountSnapshotSymbols.add(symbol);
    let position = buildPositionConfig(symbol);
    let openOrders = buildOpenOrderConfigs(symbol);
    let executions = buildExecutionConfigs(symbol);
    websocket.send(JSON.stringify({
        type: "account_state",
        symbol: symbol,
        position: position,
        openOrders: openOrders,
        executions: executions,
        timestamp: Date.now(),
    }));
};

const registerAccountUiRefreshListener = () => {
    if (accountUiRefreshListenerRegistered) {
        return;
    }
    accountUiRefreshListenerRegistered = true;
    window.addEventListener('tradingscripts:account-ui-symbol-updated', event => {
        let symbol = (event as CustomEvent<{ symbol?: string }>).detail?.symbol;
        if (symbol) {
            sendExitOrderPairConfigForSymbol(symbol);
            sendAccountStateForSymbol(symbol);
        }
    });
    window.addEventListener('tradingscripts:account-ui-updated', () => {
        sendAccountStatesForAllSymbols();
    });
};

const registerActionLogListener = () => {
    if (actionLogListenerRegistered) {
        return;
    }
    actionLogListenerRegistered = true;
    window.addEventListener('tradingscripts:bookmap-action-log', event => {
        let detail = (event as CustomEvent<{ symbol?: string, message?: string }>).detail;
        sendActionLog(detail?.symbol, detail?.message);
    });
};

const registerMarketLevelRefreshListener = () => {
    if (marketLevelRefreshListenerRegistered) {
        return;
    }
    marketLevelRefreshListenerRegistered = true;
    window.addEventListener('tradingscripts:bookmap-market-levels-updated', event => {
        let symbol = (event as CustomEvent<{ symbol?: string }>).detail?.symbol;
        if (symbol) {
            sendKeyLevelConfigForSymbol(symbol);
        }
    });
};

const sendActionLog = (symbol: string | undefined, message: string | undefined) => {
    if (!message || !websocket || websocket.readyState !== WebSocket.OPEN) {
        return;
    }
    websocket.send(JSON.stringify({
        type: "action_log",
        symbol,
        source: "ViteApp",
        message,
        timestamp: Date.now(),
    }));
};

const getAccountSnapshotSymbols = () => {
    const symbols = new Set<string>();
    knownAccountSnapshotSymbols.forEach(symbol => symbols.add(symbol));
    Models.getWatchlist().forEach(item => symbols.add(item.symbol));

    const account = Models.getBrokerAccount();
    account?.positions.forEach((_position, symbol) => symbols.add(symbol));
    account?.entryOrders.forEach((_orders, symbol) => symbols.add(symbol));
    account?.exitPairs.forEach((_pairs, symbol) => symbols.add(symbol));

    return Array.from(symbols).sort();
};

const buildPositionConfig = (symbol: string): BookmapPositionConfig | undefined => {
    const position = Models.getPosition(symbol);
    if (!position || position.netQuantity === 0) {
        return undefined;
    }
    return {
        symbol: position.symbol,
        netQuantity: position.netQuantity,
        averagePrice: position.averagePrice,
        riskPercent: getPositionRiskPercent(symbol),
    };
};

const getPositionRiskPercent = (symbol: string) => {
    let riskMultiples = RiskManager.getRiskMultiplesFromExistingPosition(symbol);
    let percent = riskMultiples * 100;
    if (percent > 2) {
        return Math.round(percent);
    }
    return Math.round(percent * 10) / 10;
};

const buildOpenOrderConfigs = (symbol: string): BookmapOpenOrderConfig[] => {
    const orders: BookmapOpenOrderConfig[] = [];

    Models.getEntryOrders(symbol).forEach(order => {
        const config = createOpenOrderConfig(order, "ENTRY");
        if (config) {
            orders.push(config);
        }
    });

    ExitOrderPairs.getExitOrderPairsForDisplay(Models.getExitPairs(symbol)).forEach((pair, index) => {
        const pairIndex = index + 1;
        const stopConfig = createOpenOrderConfig(pair.STOP, "STOP", pair.source, pair.parentOrderID, pairIndex);
        if (stopConfig) {
            orders.push(stopConfig);
        }
        const limitConfig = createOpenOrderConfig(pair.LIMIT, "LIMIT", pair.source, pair.parentOrderID, pairIndex);
        if (limitConfig) {
            orders.push(limitConfig);
        }
    });

    return orders;
};

const buildExecutionConfigs = (symbol: string): BookmapExecutionConfig[] => {
    const executions: BookmapExecutionConfig[] = [];

    Models.getAllOrderExecutions(symbol).forEach(execution => {
        const price = Number(execution.price);
        const quantity = Number(execution.quantity);
        const timeMs = getExecutionTimeMs(execution);
        if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0 || timeMs <= 0) {
            return;
        }

        executions.push({
            price,
            quantity,
            isBuy: execution.isBuy,
            positionEffectIsOpen: execution.positionEffectIsOpen,
            timeMs,
        });
    });

    return executions;
};

const getExecutionTimeMs = (execution: Models.OrderExecution): number => {
    const time = execution.time;
    if (time instanceof Date) {
        return time.getTime();
    }
    const parsed = new Date(time as unknown as string | number).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

const createOpenOrderConfig = (
    order: Models.OrderModel | undefined,
    role: string,
    source?: string,
    parentOrderID?: string,
    pairIndex?: number,
): BookmapOpenOrderConfig | undefined => {
    if (!order) {
        return undefined;
    }

    const config: BookmapOpenOrderConfig = {
        orderID: order.orderID,
        role,
        orderType: order.orderType,
        quantity: order.quantity,
        isBuy: order.isBuy,
        source,
        parentOrderID,
        pairIndex,
    };
    if (order.price !== undefined && Number.isFinite(order.price) && order.price > 0) {
        config.price = order.price;
    }
    return config;
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

const getBookmapMarketLevelsForSymbol = (symbol: string): BookmapMarketLevels => {
    const symbolData = Models.getSymbolData(symbol);
    const marketLevels: BookmapMarketLevels = {};

    const camPivots = getValidCamPivots(symbolData.camPivots);
    if (Object.keys(camPivots).length > 0) {
        marketLevels.camPivots = camPivots;
    }

    const previousDay = getValidPricePair(symbolData.previousDayCandle?.high, symbolData.previousDayCandle?.low);
    if (previousDay) {
        marketLevels.previousDay = previousDay;
    }

    const premarket = getValidPricePair(symbolData.premktHigh, symbolData.premktLow);
    if (premarket) {
        marketLevels.premarket = premarket;
    }

    return marketLevels;
};

const getValidCamPivots = (pivots: Models.CamarillaPivots): Partial<Models.CamarillaPivots> => {
    const result: Partial<Models.CamarillaPivots> = {};
    const keys: (keyof Models.CamarillaPivots)[] = [
        "R1", "R2", "R3", "R4", "R5", "R6",
        "S1", "S2", "S3", "S4", "S5", "S6",
    ];
    for (const key of keys) {
        const price = pivots[key];
        if (isValidBookmapPrice(price)) {
            result[key] = price;
        }
    }
    return result;
};

const getValidPricePair = (high: number | undefined, low: number | undefined): BookmapPricePair | undefined => {
    const pair: BookmapPricePair = {};
    if (isValidBookmapPrice(high)) {
        pair.high = high;
    }
    if (isValidBookmapPrice(low)) {
        pair.low = low;
    }
    return pair.high !== undefined || pair.low !== undefined ? pair : undefined;
};

const isValidBookmapPrice = (price: number | undefined): price is number => {
    return typeof price === "number" && Number.isFinite(price) && price > 0 && price < 999999;
};

const handleCustomButtonClick = (data: any) => {
    let symbol = normalizeSymbol(data.symbol || "");
    let action = getString(data.action);
    if (action === "adjust_exit_limit_to_bookmap_wall") {
        handleExitLimitWallAdjustment(symbol, data);
        return;
    }

    let keyCode = getString(data.keyCode || data.key_code);
    if (keyCode) {
        let shiftKey = data.shiftKey === true || data.shift_key === true;
        let eventPrice = getNumber(data.price);
        let sourcePrice = eventPrice > 0 ? Helper.roundPrice(symbol, eventPrice) : undefined;
        let source = getString(data.source);
        let isChartHotkey = source === "bookmap_chart_hotkey"
            || getString(data.button_id).startsWith("chart_hotkey:");
        let priceText = sourcePrice !== undefined ? ` @ ${sourcePrice}` : "";
        console.log(`[BookmapSocket] Handling ${data.button_name || data.button_id || "button"} as ${shiftKey ? "Shift+" : ""}${keyCode}${priceText} for ${symbol}`);
        if (isChartHotkey) {
            sendActionLog(symbol, `Received hotkey ${shiftKey ? "Shift+" : ""}${keyCode}${priceText}`);
        }
        KeyboardHandler.handleKeyPressed(keyCode, shiftKey, symbol, sourcePrice, isChartHotkey ? "Bookmap" : undefined);
        return;
    }

    let tradebookId = getString(data.tradebook_id || data.tradebookId);
    let entryMethod = getString(data.entry_method || data.entryMethod);
    let useMarketOrder = data.use_market_order === true || data.useMarketOrder === true;
    let bookmapOrderbook = normalizeBookmapOrderbook(data.orderbook, symbol);

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
        bookmapOrderbook: bookmapOrderbook,
    });
};

const getString = (value: any): string => {
    return typeof value === "string" ? value : "";
};

const getNumber = (value: any): number => {
    let parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeBookmapOrderbook = (value: any, fallbackSymbol: string): Models.BookmapOrderbookSnapshot | undefined => {
    if (!value || typeof value !== "object") {
        return undefined;
    }

    let largeBids = normalizeBookmapLevels(value.largeBids);
    let largeAsks = normalizeBookmapLevels(value.largeAsks);
    let bestBid = getNumber(value.bestBid);
    let bestAsk = getNumber(value.bestAsk);
    let wallThreshold = getNumber(value.wallThreshold);
    let timestamp = getNumber(value.timestamp);
    if (largeBids.length === 0 && largeAsks.length === 0 && bestBid <= 0 && bestAsk <= 0) {
        return undefined;
    }

    let snapshot: Models.BookmapOrderbookSnapshot = {
        symbol: getString(value.symbol) || fallbackSymbol,
        largeBids,
        largeAsks,
    };
    if (timestamp > 0) {
        snapshot.timestamp = timestamp;
    }
    if (wallThreshold > 0) {
        snapshot.wallThreshold = wallThreshold;
    }
    if (bestBid > 0) {
        snapshot.bestBid = bestBid;
    }
    if (bestAsk > 0) {
        snapshot.bestAsk = bestAsk;
    }
    return snapshot;
};

const normalizeBookmapLevels = (value: any): Models.BookmapOrderbookLevel[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    let levels: Models.BookmapOrderbookLevel[] = [];
    value.forEach(level => {
        if (!Array.isArray(level) || level.length < 2) {
            return;
        }
        let price = getNumber(level[0]);
        let size = Math.trunc(getNumber(level[1]));
        if (price > 0 && size > 0) {
            levels.push([price, size]);
        }
    });
    return levels;
};

const handleExitLimitWallAdjustment = (symbol: string, data: any) => {
    let pairIndex = Math.trunc(getNumber(data.pair_index || data.pairIndex));
    let targetPrice = getNumber(data.target_price || data.targetPrice || data.price);
    if (pairIndex < 1 || pairIndex > 10 || targetPrice <= 0) {
        console.warn("[BookmapSocket] invalid wall adjustment request", data);
        return;
    }

    let keyCode = pairIndex === 10 ? "Digit0" : `Digit${pairIndex}`;
    console.log(`[BookmapSocket] Wall adjustment ${symbol} pair ${pairIndex} @ ${targetPrice}`);
    Handler.numberKeyPressedAtPrice(symbol, keyCode, targetPrice, false);
};
