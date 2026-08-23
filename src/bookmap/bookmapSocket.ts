/**
 * WebSocket client for the Bookmap Active Trader plugin.
 * Connects to the local WebSocket server and subscribes to
 * order book snapshots, heartbeats, and breakout signals.
 */

import * as Helper from "../utils/helper";
import * as Models from "../models/models";
import type * as TradingPlansModels from "../models/tradingPlans/tradingPlansModels";
import * as TradingPlans from "../models/tradingPlans/tradingPlans";
import * as TradebooksManager from "../tradebooks/tradebooksManager";
import { BookmapWallReversal } from "../tradebooks/bookmapWallReversal";
import * as KeyboardHandler from "../controllers/keyboardHandler";
import * as Handler from "../controllers/handler";
import * as ExitOrderPairs from "../utils/exitOrderPairs";
import * as RiskManager from "../algorithms/riskManager";
import * as TradingState from "../models/tradingState";
import {
    ALWAYS_UNRESTRICTED_PARTIALS,
    calculateBufferedCoreTarget,
    DEFAULT_PARTIALS_COUNT,
    estimateCompletedPartials,
    MAX_RESTRICTED_PARTIALS,
    normalizeRestrictedPartialCount,
} from "../controllers/coreTargetRule";
import {
    getBookmapWirePrice,
    isSupportedBookmapWirePriceUnit,
    normalizeBookmapWirePrice,
    withBookmapWirePriceUnit,
} from "./priceNormalization";
import { buildVwapUpdate } from "./vwapUpdate";
import {
    BOOKMAP_SCREEN_LOG_EVENT,
    type BookmapScreenLogDetail,
} from "./screenLog";
declare let window: Models.MyWindow;

const BOOKMAP_WS_URL = "ws://localhost:8765";
const RECONNECT_DELAY_MS = 3000;
const CONFIG_PUSH_INTERVAL_MS = 60_000;
const MAX_PENDING_SCREEN_LOGS = 100;

interface BookmapKeyLevel {
    price: number;
    label?: string;
}

interface BookmapKeyZone {
    low: number;
    high: number;
    label?: string;
    color?: string;
}

interface BookmapPricePair {
    high?: number;
    low?: number;
}

interface BookmapMarketLevels {
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

interface BookmapCorePlanConfig {
    type: "core_plan_config";
    symbol: string;
    hasActiveTrade: boolean;
    isLong?: boolean;
    entryPrice?: number;
    coreTarget?: number;
    coreCount?: number;
    runnerCondition?: string;
    runnerCount?: number;
    corePlan?: string;
    bufferedTarget?: number;
    partialsTaken?: number;
    tradeId?: string;
    reminderRequested?: boolean;
    requestId?: string;
    updateStatus?: "success" | "error";
    error?: string;
    timestamp: number;
}

interface CorePlanSendOptions {
    reminderRequested?: boolean;
    requestId?: string;
    updateStatus?: "success" | "error";
    error?: string;
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
let screenLogListenerRegistered = false;
let marketLevelRefreshListenerRegistered = false;
let vwapUpdateListenerRegistered = false;
const knownAccountSnapshotSymbols = new Set<string>();
const lastSentVwapTimeBySymbol = new Map<string, number>();
const pendingScreenLogs: BookmapScreenLogDetail[] = [];

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
    registerScreenLogListener();
    registerMarketLevelRefreshListener();
    registerVwapUpdateListener();
    websocket = new WebSocket(BOOKMAP_WS_URL);

    websocket.onopen = function () {
        console.log("[BookmapSocket] Connected");
        lastSentVwapTimeBySymbol.clear();
        flushPendingScreenLogs();
        subscribeToOrderbook();
        pushBookmapConfigsForAllSymbols();
        startPeriodicConfigPush();
    };

    websocket.onmessage = function (messageEvent) {
        let data = JSON.parse(messageEvent.data);
        let type = data.type;
        if (!isSupportedBookmapWirePriceUnit(data.priceUnit)) {
            console.warn(`[BookmapSocket] Ignoring ${type || "message"} with unsupported priceUnit`, data);
            return;
        }
        if (type === "orderbook") {
            return;
        }
        if (type !== "custom_button_click") {
            console.log(data);
        }
        let symbol = normalizeSymbol(data.symbol || "");

        if (type === "heartbeat") {
            // price tracked via heartbeat if needed later
        } else if (type === "breakout") {
            let breakoutLevel = getBookmapWirePrice(data, "breakoutLevel");
            console.log(`[BookmapSocket] BREAKOUT [${symbol}]: level=${breakoutLevel ?? "invalid"}, timestamp=${data.timestamp}`);
        } else if (type === "custom_button_click") {
            console.log("[BookmapSocket] custom_button_click");
            console.log(data)
            handleCustomButtonClick(data);
        } else if (type === "core_plan_update") {
            handleCorePlanUpdate(data);
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
        lastSentVwapTimeBySymbol.clear();
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
    sendCorePlanConfigsForAllSymbols();
    sendVwapUpdatesForAllSymbols();
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
    const zones = getBookmapKeyZonesForSymbol(symbol);
    const marketLevels = getBookmapMarketLevelsForSymbol(symbol);
    websocket.send(JSON.stringify(withBookmapWirePriceUnit({
        type: "key_levels_config",
        symbol: symbol,
        levels: levels,
        zones: zones,
        previousDay: marketLevels.previousDay,
        premarket: marketLevels.premarket,
        timestamp: Date.now(),
    })));
    console.log(`[BookmapSocket] Sent ${levels.length} key levels and ${zones.length} key zones for ${symbol}`
        + ` with market levels: prev=${marketLevels.previousDay ? 1 : 0}`
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
    websocket.send(JSON.stringify(withBookmapWirePriceUnit({
        type: "exit_order_pairs_config",
        symbol: symbol,
        pairs: pairs,
        timestamp: Date.now(),
    })));
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
    websocket.send(JSON.stringify(withBookmapWirePriceUnit({
        type: "account_state",
        symbol: symbol,
        position: position,
        openOrders: openOrders,
        executions: executions,
        timestamp: Date.now(),
    })));
};

const getTimestampTimeMs = (value: unknown): number => {
    if (value && typeof value === "object") {
        let timestamp = value as { toMillis?: () => number, seconds?: number, nanoseconds?: number };
        if (typeof timestamp.toMillis === "function") {
            let result = timestamp.toMillis();
            return Number.isFinite(result) ? result : 0;
        }
        if (Number.isFinite(timestamp.seconds)) {
            return (timestamp.seconds ?? 0) * 1000 + (timestamp.nanoseconds ?? 0) / 1_000_000;
        }
    }
    return 0;
};

const getPartialsTaken = (symbol: string, state: Models.BreakoutTradeState): number => {
    let initialQuantity = Number(state.initialQuantity);
    if (Number.isFinite(initialQuantity) && initialQuantity > 0) {
        let submitTimeMs = getTimestampTimeMs(state.submitTime);
        let exitedQuantity = Models.getAllOrderExecutions(symbol)
            .filter(execution => !execution.positionEffectIsOpen
                && (submitTimeMs <= 0 || getExecutionTimeMs(execution) >= submitTimeMs))
            .reduce((total, execution) => total + Math.max(0, Number(execution.quantity) || 0), 0);
        return estimateCompletedPartials(
            initialQuantity,
            exitedQuantity,
            Models.getExitPairs(symbol).length,
        );
    }

    return estimateCompletedPartials(0, 0, Models.getExitPairs(symbol).length);
};

const buildCorePlanConfig = (
    symbol: string,
    options: CorePlanSendOptions = {},
): BookmapCorePlanConfig => {
    let netQuantity = Models.getPositionNetQuantity(symbol);
    let isLong = netQuantity > 0;
    let state = netQuantity === 0 ? undefined : TradingState.getBreakoutTradeState(symbol, isLong);
    let base: BookmapCorePlanConfig = {
        type: "core_plan_config",
        symbol,
        hasActiveTrade: state?.hasValue === true,
        reminderRequested: options.reminderRequested === true,
        requestId: options.requestId,
        updateStatus: options.updateStatus,
        error: options.error,
        timestamp: Date.now(),
    };
    if (!state?.hasValue) {
        return base;
    }

    let entryPrice = Number(state.entryPrice);
    let coreTarget = Number(state.plan.coreTarget);
    let coreCount = normalizeRestrictedPartialCount(state.plan.coreCount);
    let tradingPlan = TradingPlans.getTradingPlans(symbol);
    return {
        ...base,
        isLong,
        entryPrice,
        coreTarget,
        coreCount,
        runnerCondition: state.plan.runnerTriggerCondition ?? "",
        runnerCount: Number(state.plan.runnerCount) || 0,
        corePlan: tradingPlan?.corePlan ?? "",
        bufferedTarget: calculateBufferedCoreTarget(entryPrice, coreTarget),
        partialsTaken: getPartialsTaken(symbol, state),
        tradeId: `${symbol}:${isLong ? "long" : "short"}:${getTimestampTimeMs(state.submitTime)}`,
    };
};

export const sendCorePlanConfigsForAllSymbols = () => {
    getAccountSnapshotSymbols().forEach(symbol => sendCorePlanConfigForSymbol(symbol));
};

export const sendCorePlanConfigForSymbol = (
    symbol: string,
    options: CorePlanSendOptions = {},
) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        return false;
    }
    websocket.send(JSON.stringify(withBookmapWirePriceUnit(buildCorePlanConfig(symbol, options))));
    return true;
};

const maybeSendThirdPartialCorePlanReminder = (symbol: string) => {
    let netQuantity = Models.getPositionNetQuantity(symbol);
    if (netQuantity === 0) {
        return false;
    }
    let isLong = netQuantity > 0;
    let state = TradingState.getBreakoutTradeState(symbol, isLong);
    if (!state.hasValue || state.coreTargetReminderShown === true
        || getPartialsTaken(symbol, state) < ALWAYS_UNRESTRICTED_PARTIALS) {
        return false;
    }
    if (!sendCorePlanConfigForSymbol(symbol, { reminderRequested: true })) {
        return false;
    }
    TradingState.markCoreTargetReminderShown(symbol, isLong);
    return true;
};

const sendCorePlanUpdateError = (symbol: string, requestId: string, error: string) => {
    console.warn(`[BookmapSocket] Rejected core plan update for ${symbol}: ${error}`);
    sendCorePlanConfigForSymbol(symbol, {
        requestId,
        updateStatus: "error",
        error,
    });
};

const handleCorePlanUpdate = (data: Record<string, unknown>) => {
    let symbol = normalizeSymbol(getString(data.symbol));
    let requestId = getString(data.requestId || data.request_id) || `${Date.now()}`;
    let netQuantity = Models.getPositionNetQuantity(symbol);
    if (!symbol || symbol === "???" || netQuantity === 0) {
        sendCorePlanUpdateError(symbol, requestId, "There is no active position for this symbol.");
        return;
    }

    let isLong = netQuantity > 0;
    let state = TradingState.getBreakoutTradeState(symbol, isLong);
    if (!state.hasValue) {
        sendCorePlanUpdateError(symbol, requestId, "There is no active trade plan for this position.");
        return;
    }

    let coreTarget = normalizeBookmapWirePrice(data.coreTarget ?? data.core_target);
    let coreCount = Number(data.coreCount ?? data.core_count);
    if (coreTarget === undefined) {
        sendCorePlanUpdateError(symbol, requestId, "Core target must be a positive number.");
        return;
    }
    if (!Number.isInteger(coreCount)
        || coreCount < 0
        || coreCount > MAX_RESTRICTED_PARTIALS) {
        sendCorePlanUpdateError(
            symbol,
            requestId,
            `Core count must be an integer from 0 to ${MAX_RESTRICTED_PARTIALS}.`,
        );
        return;
    }

    coreTarget = Helper.roundPrice(symbol, coreTarget);
    let entryPrice = Number(state.entryPrice);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0
        || (isLong && coreTarget <= entryPrice)
        || (!isLong && coreTarget >= entryPrice)) {
        sendCorePlanUpdateError(
            symbol,
            requestId,
            `Core target must be ${isLong ? "above" : "below"} entry ${entryPrice}.`,
        );
        return;
    }

    TradingState.updateCoreTargetPlan(symbol, isLong, coreTarget, coreCount);
    sendCorePlanConfigForSymbol(symbol, {
        requestId,
        updateStatus: "success",
    });
    sendActionLog(symbol, `updated core plan: target ${coreTarget}, count ${coreCount}`);
};

export const sendVwapUpdatesForAllSymbols = () => {
    let watchlist = Models.getWatchlist();
    for (let i = 0; i < watchlist.length; i++) {
        sendVwapUpdatesForSymbol(watchlist[i].symbol);
    }
};

export const sendVwapUpdatesForSymbol = (symbol: string) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        return;
    }
    if (!symbol || Helper.isFutures(symbol)) {
        return;
    }

    const symbolData = Models.getSymbolData(symbol);
    if (!symbolData?.m1Vwaps?.length) {
        return;
    }

    const sentAtMs = Date.now();
    // The final point belongs to the active candle. Candle rollover publishes it
    // on the next pass, after ViteApp has declared that minute closed.
    for (let i = 0; i < symbolData.m1Vwaps.length - 1; i++) {
        const point = symbolData.m1Vwaps[i];
        const update = buildVwapUpdate(symbol, point, sentAtMs);
        if (!update) continue;
        sendVwapUpdate(update);
    }
};

const sendVwapUpdate = (update: ReturnType<typeof buildVwapUpdate>) => {
    if (!update || !websocket || websocket.readyState !== WebSocket.OPEN) {
        return;
    }

    const lastSentTime = lastSentVwapTimeBySymbol.get(update.symbol) ?? 0;
    if (update.effectiveTimeMs <= lastSentTime) {
        return;
    }

    websocket.send(JSON.stringify(update));
    lastSentVwapTimeBySymbol.set(update.symbol, update.effectiveTimeMs);
    console.log(`[BookmapSocket] Sent closed-minute VWAP for ${update.symbol}: `
        + `vwap=${update.vwap.toFixed(4)}, effective=${new Date(update.effectiveTimeMs).toISOString()}`);
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
            if (!maybeSendThirdPartialCorePlanReminder(symbol)) {
                sendCorePlanConfigForSymbol(symbol);
            }
        }
    });
    window.addEventListener('tradingscripts:account-ui-updated', () => {
        sendAccountStatesForAllSymbols();
        getAccountSnapshotSymbols().forEach(symbol => {
            if (!maybeSendThirdPartialCorePlanReminder(symbol)) {
                sendCorePlanConfigForSymbol(symbol);
            }
        });
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

const registerScreenLogListener = () => {
    if (screenLogListenerRegistered) {
        return;
    }
    screenLogListenerRegistered = true;
    window.addEventListener(BOOKMAP_SCREEN_LOG_EVENT, event => {
        const detail = (event as CustomEvent<BookmapScreenLogDetail>).detail;
        sendScreenLog(detail);
    });
};

const registerVwapUpdateListener = () => {
    if (vwapUpdateListenerRegistered) {
        return;
    }
    vwapUpdateListenerRegistered = true;
    window.addEventListener('tradingscripts:bookmap-vwap-updated', event => {
        const detail = (event as CustomEvent<{
            symbol?: string,
            point?: Models.LineSeriesData,
        }>).detail;
        if (!detail?.symbol || !detail.point || Helper.isFutures(detail.symbol)) {
            return;
        }
        sendVwapUpdate(buildVwapUpdate(detail.symbol, detail.point));
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
    const averagePrice = normalizeBookmapWirePrice(position.averagePrice);
    if (averagePrice === undefined) {
        return undefined;
    }
    return {
        symbol: position.symbol,
        netQuantity: position.netQuantity,
        averagePrice,
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
        const price = normalizeBookmapWirePrice(execution.price);
        const quantity = Number(execution.quantity);
        const timeMs = getExecutionTimeMs(execution);
        if (price === undefined || !Number.isFinite(quantity) || quantity <= 0 || timeMs <= 0) {
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
    const price = normalizeBookmapWirePrice(order.price);
    if (price !== undefined) {
        config.price = price;
    }
    return config;
};

const getBookmapKeyLevelsForSymbol = (symbol: string): BookmapKeyLevel[] => {
    const plan = TradingPlans.getTradingPlansWithoutDefault(symbol);
    const rawLevels = plan?.keyLevels?.otherLevels ?? [];
    const seen = new Set<number>();
    const levels: BookmapKeyLevel[] = [];

    for (const level of rawLevels) {
        const price = normalizeBookmapWirePrice(level.price);
        if (price === undefined || seen.has(price)) {
            continue;
        }
        seen.add(price);
        levels.push({ price, label: level.label });
    }
    return levels;
};

const getBookmapKeyZonesForSymbol = (symbol: string): BookmapKeyZone[] => {
    const plan = TradingPlans.getTradingPlansWithoutDefault(symbol);
    const rawZones = plan?.keyLevels?.zones ?? [];
    const seen = new Set<string>();
    const zones: BookmapKeyZone[] = [];

    for (const zone of rawZones) {
        addBookmapKeyZone(zones, seen, zone, zone.label, zone.color);
    }

    const rangeBoundPlan = plan?.rangeBoundReversalPlan;
    if (rangeBoundPlan) {
        addBookmapKeyZone(zones, seen, rangeBoundPlan.support, "support", "green");
        addBookmapKeyZone(zones, seen, rangeBoundPlan.resistance, "resistance", "red");
    }

    addGapTradePlanKeyZones(zones, seen, plan);
    return zones;
};

const addGapTradePlanKeyZones = (
    zones: BookmapKeyZone[],
    seen: Set<string>,
    plan: TradingPlansModels.TradingPlans | undefined,
) => {
    if (!plan) {
        return;
    }

    const gapAndGoPlan = plan.long.gapAndGoPlan;
    if (gapAndGoPlan) {
        addBookmapKeyZone(zones, seen, gapAndGoPlan.support, "gap & go support", "green");
    }

    const gapDownAndGoUpPlan = plan.long.gapDownAndGoUpPlan;
    if (gapDownAndGoUpPlan) {
        addBookmapKeyZone(zones, seen, gapDownAndGoUpPlan.support, "gap down & go up support", "green");
    }

    const gapAndCrapPlan = plan.short.gapAndCrapPlan;
    if (gapAndCrapPlan) {
        addBookmapKeyZone(zones, seen, gapAndCrapPlan.resistance, "gap & crap resistance", "red");
    }

    const gapDownAndGoDownPlan = plan.short.gapDownAndGoDownPlan;
    if (gapDownAndGoDownPlan) {
        addBookmapKeyZone(zones, seen, gapDownAndGoDownPlan.resistance, "gap down & go down resistance", "red");
    }
};

const addBookmapKeyZone = (
    zones: BookmapKeyZone[],
    seen: Set<string>,
    zone: TradingPlansModels.LevelArea | undefined,
    label?: string,
    color?: string,
) => {
    if (!zone) {
        return;
    }
    const normalizedLow = normalizeBookmapWirePrice(zone.low);
    const normalizedHigh = normalizeBookmapWirePrice(zone.high);
    if (normalizedLow === undefined || normalizedHigh === undefined || normalizedLow === normalizedHigh) {
        return;
    }
    const low = Math.min(normalizedLow, normalizedHigh);
    const high = Math.max(normalizedLow, normalizedHigh);
    const key = `${low}:${high}`;
    if (seen.has(key)) {
        return;
    }
    seen.add(key);

    const config: BookmapKeyZone = { low, high };
    const normalizedLabel = normalizeOptionalString(zone.label) ?? normalizeOptionalString(label);
    const normalizedColor = normalizeOptionalString(color);
    if (normalizedLabel) {
        config.label = normalizedLabel;
    }
    if (normalizedColor) {
        config.color = normalizedColor;
    }
    zones.push(config);
};

const getBookmapMarketLevelsForSymbol = (symbol: string): BookmapMarketLevels => {
    const symbolData = Models.getSymbolData(symbol);
    const marketLevels: BookmapMarketLevels = {};

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

const getValidPricePair = (high: number | undefined, low: number | undefined): BookmapPricePair | undefined => {
    const pair: BookmapPricePair = {};
    const normalizedHigh = normalizeBookmapWirePrice(high);
    const normalizedLow = normalizeBookmapWirePrice(low);
    if (normalizedHigh !== undefined) {
        pair.high = normalizedHigh;
    }
    if (normalizedLow !== undefined) {
        pair.low = normalizedLow;
    }
    return pair.high !== undefined || pair.low !== undefined ? pair : undefined;
};

const normalizeOptionalString = (value: string | undefined): string | undefined => {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

const handleCustomButtonClick = (data: any) => {
    let symbol = normalizeSymbol(data.symbol || "");
    mergeBookmapHighLowOfDay(symbol, data);

    let action = getString(data.action);
    if (action === "adjust_exit_limit_to_bookmap_wall") {
        handleExitLimitWallAdjustment(symbol, data);
        return;
    }

    let keyCode = getString(data.keyCode || data.key_code);
    if (keyCode) {
        let shiftKey = data.shiftKey === true || data.shift_key === true;
        let eventPrice = getBookmapWirePrice(data, "price");
        let sourcePrice = eventPrice !== undefined ? Helper.roundPrice(symbol, eventPrice) : undefined;
        let source = getString(data.source);
        let isChartHotkey = source === "bookmap_chart_hotkey"
            || getString(data.button_id).startsWith("chart_hotkey:");
        let priceText = sourcePrice !== undefined ? ` @ ${sourcePrice}` : "";
        console.log(`[BookmapSocket] Handling ${data.button_name || data.button_id || "button"} as ${shiftKey ? "Shift+" : ""}${keyCode}${priceText} for ${symbol}`);
        if (isChartHotkey) {
            let priceUsed = sourcePrice !== undefined ? sourcePrice.toFixed(2) : "none";
            let shiftText = shiftKey ? " + shift" : "";
            sendActionLog(
                symbol,
                `hover_key ${symbol} ${keyCode} @ ${priceUsed}${shiftText}`,
            );
        }
        if (isChartHotkey && (keyCode === "KeyB" || keyCode === "KeyS")) {
            handleWallReversalHoverHotkey(symbol, keyCode, sourcePrice, data);
            return;
        }
        KeyboardHandler.handleKeyPressed(keyCode, shiftKey, symbol, sourcePrice, isChartHotkey ? "Bookmap" : undefined);
        return;
    }

    let tradebookId = getString(data.tradebook_id || data.tradebookId);
    let entryMethod = getString(data.entry_method || data.entryMethod);
    let useMarketOrder = data.use_market_order === true || data.useMarketOrder === true;
    let bookmapOrderbook = normalizeBookmapOrderbook(data.orderbook, symbol);
    let bookmapEstimatedEntryPrice = getBookmapWirePrice(
        data, "estimated_entry_price", "estimatedEntryPrice");

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
        bookmapEstimatedEntryPrice: useMarketOrder ? bookmapEstimatedEntryPrice : undefined,
    });
};

const sendScreenLog = (detail: BookmapScreenLogDetail | undefined) => {
    if (!detail?.message) {
        return;
    }
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        while (pendingScreenLogs.length >= MAX_PENDING_SCREEN_LOGS) {
            pendingScreenLogs.shift();
        }
        pendingScreenLogs.push(detail);
        return;
    }
    websocket.send(JSON.stringify({
        type: "screen_log",
        symbol: detail.symbol,
        source: "ViteApp",
        level: detail.level,
        message: detail.message,
        timestamp: Date.now(),
    }));
};

const flushPendingScreenLogs = () => {
    while (pendingScreenLogs.length > 0
        && websocket?.readyState === WebSocket.OPEN) {
        sendScreenLog(pendingScreenLogs.shift());
    }
};

const handleWallReversalHoverHotkey = (
    symbol: string,
    keyCode: string,
    sourcePrice: number | undefined,
    data: any,
) => {
    if (sourcePrice === undefined) {
        console.warn(`[BookmapSocket] ${keyCode} hover hotkey missing a valid price`, data);
        return;
    }

    let tradebookId = getString(data.tradebook_id || data.tradebookId);
    let tradebook = TradebooksManager.getTradebookByID(symbol, tradebookId);
    if (!(tradebook instanceof BookmapWallReversal)) {
        console.warn(
            `[BookmapSocket] ${keyCode} hover hotkey missing a matching wall-reversal tradebook for ${symbol}`,
            data);
        return;
    }

    let isLong = keyCode === "KeyB";
    if (tradebook.isLong !== isLong) {
        console.warn(
            `[BookmapSocket] ${keyCode} hover hotkey has the wrong tradebook side: ${tradebookId}`,
            data);
        return;
    }

    let entryMethod = getString(data.entry_method || data.entryMethod);
    console.log(
        `[BookmapSocket] Starting ${tradebook.buttonLabel} ${entryMethod} for ${symbol}`
        + ` with stop entry at hovered price ${sourcePrice}`);
    tradebook.startEntry(false, false, {
        ...Models.getDefaultEntryParameters(),
        entryMethod: entryMethod || tradebook.getEntryMethods()[0],
        bookmapOrderbook: normalizeBookmapOrderbook(data.orderbook, symbol),
        entryPriceOverride: sourcePrice,
    });
};

const mergeBookmapHighLowOfDay = (symbol: string, data: any) => {
    if (!symbol || symbol === "???") {
        return;
    }

    let bookmapHighLow = getBookmapDayHighLow(data);
    if (!bookmapHighLow) {
        return;
    }

    let symbolData = Models.getSymbolData(symbol);
    let oldHigh = symbolData.highOfDay;
    let oldLow = symbolData.lowOfDay;
    let changed = false;

    let bookmapHigh = Helper.roundPriceWithDirection(symbol, bookmapHighLow.high, true);
    if (bookmapHigh > 0 && bookmapHigh > symbolData.highOfDay) {
        symbolData.highOfDay = bookmapHigh;
        changed = true;
    }

    let bookmapLow = Helper.roundPriceWithDirection(symbol, bookmapHighLow.low, false);
    if (bookmapLow > 0 && bookmapLow < symbolData.lowOfDay) {
        symbolData.lowOfDay = bookmapLow;
        changed = true;
    }

    if (changed) {
        console.log(`[BookmapSocket] merged Bookmap HOD/LOD for ${symbol}: `
            + `${oldHigh}/${oldLow} -> ${symbolData.highOfDay}/${symbolData.lowOfDay}`);
    }
};

const getBookmapDayHighLow = (data: any): { high: number, low: number } | undefined => {
    let bookmapDayHighLow = data.bookmapDayHighLow;
    if (!bookmapDayHighLow || typeof bookmapDayHighLow !== "object") {
        return undefined;
    }

    if (!isSupportedBookmapWirePriceUnit(bookmapDayHighLow.priceUnit)) {
        return undefined;
    }
    let high = getBookmapWirePrice(bookmapDayHighLow, "high");
    let low = getBookmapWirePrice(bookmapDayHighLow, "low");

    if (high === undefined || low === undefined) {
        return undefined;
    }
    return { high, low };
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
    if (!isSupportedBookmapWirePriceUnit(value.priceUnit)) {
        console.warn("[BookmapSocket] Ignoring orderbook with unsupported priceUnit", value);
        return undefined;
    }

    let largeBids = normalizeBookmapLevels(value.largeBids);
    let largeAsks = normalizeBookmapLevels(value.largeAsks);
    let bestBid = getBookmapWirePrice(value, "bestBid");
    let bestAsk = getBookmapWirePrice(value, "bestAsk");
    let wallThreshold = getNumber(value.wallThreshold);
    let absoluteWallThreshold = getNumber(value.absoluteWallThreshold);
    let percentileWallThreshold = getNumber(value.percentileWallThreshold);
    let effectiveWallThreshold = getNumber(value.effectiveWallThreshold);
    let timestamp = getNumber(value.timestamp);
    if (largeBids.length === 0 && largeAsks.length === 0
        && bestBid === undefined && bestAsk === undefined) {
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
    if (absoluteWallThreshold > 0) {
        snapshot.absoluteWallThreshold = absoluteWallThreshold;
    }
    if (percentileWallThreshold > 0) {
        snapshot.percentileWallThreshold = percentileWallThreshold;
    }
    if (effectiveWallThreshold > 0) {
        snapshot.effectiveWallThreshold = effectiveWallThreshold;
    }
    if (bestBid !== undefined) {
        snapshot.bestBid = bestBid;
    }
    if (bestAsk !== undefined) {
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
        let price = normalizeBookmapWirePrice(level[0]);
        let size = Math.trunc(getNumber(level[1]));
        if (price !== undefined && size > 0) {
            levels.push([price, size]);
        }
    });
    return levels;
};

const handleExitLimitWallAdjustment = (symbol: string, data: any) => {
    let pairIndex = Math.trunc(getNumber(data.pair_index || data.pairIndex));
    let targetPrice = getBookmapWirePrice(data, "target_price", "targetPrice", "price");
    if (pairIndex < 1 || pairIndex > 10 || targetPrice === undefined) {
        console.warn("[BookmapSocket] invalid wall adjustment request", data);
        return;
    }

    console.log(
        `[BookmapSocket] Wall adjustment ${symbol} requested pair ${pairIndex};`
        + ` selecting the first smallest-quantity pair @ ${targetPrice}`);
    Handler.numberKeyPressedAtPrice(symbol, "Digit1", targetPrice, false);
};

// Register during module initialization so logs produced before the WebSocket
// opens are captured in pendingScreenLogs and flushed once Bookmap connects.
registerScreenLogListener();
