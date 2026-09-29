import * as Models from '../models/models';
import * as TradingState from '../models/tradingState';
import * as Config from '../config/config';
import * as GlobalSettings from '../config/globalSettings';
import * as Runtime from '../replay/runtime';
import * as Secret from '../config/secret';
import * as Broker from '../api/broker';
import * as Chart from '../ui/chart';
import * as Handler from '../controllers/handler';
import * as CoreTargetExitRules from '../controllers/coreTargetExitRules';
import * as PartialStopDiscipline from '../controllers/partialStopDisciplineController';
import * as TradebooksManager from '../tradebooks/tradebooksManager';
import { Tradebook } from '../tradebooks/baseTradebook';
import { BookmapWallReversal } from '../tradebooks/bookmapWallReversal';
import * as Firestore from '../firestore';
import * as Helper from '../utils/helper';
import * as Rules from '../algorithms/rules';
import { configureExecutionFence, getLegacyBrokerMutationsInFlight, needsNativeExecutionFence } from './executionFence';
import { getExecutionToken, getBrokerObservation, getExecutionQuoteTime } from './executionMetadata';
import { createExecutionEntryContext, collectObservedOrderIds } from './executionEntryContext';

declare const window: Models.MyWindow;
const VERSION = 2;
const PAIRING_STORAGE_KEY = 'tradingscripts.bookmapExecutionPairingKey';
let socket: WebSocket | undefined;
let epoch = '';
let enabled = false;
let ownershipPending = false;
let sequence = 0;
let generationSent = 0;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let refreshing = false;
let accountHash = '';
let requiresReview = false;
let entriesEnabled = false;
const acknowledgements = new Map<string, (allowed: boolean) => void>();
const nativeActions = new Set<string>();
let refreshAccountForExecution = () => Chart.updateAccountUIStatus('native execution');
export const registerExecutionAccountRefresh = (refresh: () => Promise<void>) => { refreshAccountForExecution = refresh; };

const liveSchwab = () => Runtime.capabilities.liveBroker
    && Config.getProfileSettings().brokerName === 'Schwab' && Config.getProfileSettings().isEquity;
const send = (type: string, data: object = {}) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('Native execution connection unavailable');
    socket.send(JSON.stringify({ type, version: VERSION, epoch, ...data }));
};
const getPairingKey = () => localStorage.getItem(PAIRING_STORAGE_KEY) ?? '';
const acquireFence = async (): Promise<(outcome: 'complete' | 'unknown') => void> => {
    const pairingKey = getPairingKey();
    if (!needsNativeExecutionFence({
        enabled,
        hasSession: Boolean(epoch),
        ownershipPending,
        requiresReview,
        pairingConfigured: pairingKey.length >= 32,
    })) return () => {};
    if (!epoch || ownershipPending || requiresReview) throw new Error('Broker execution unavailable pending native session review');
    const requestId = crypto.randomUUID();
    const allowed = await new Promise<boolean>((resolve, reject) => {
        const timeout = setTimeout(() => {
            acknowledgements.delete(requestId);
            requiresReview = true; // The plugin may have accepted a pause; do not silently bypass it.
            reject(new Error('Native execution fence timed out; reconnect and review broker orders'));
        }, 3000);
        acknowledgements.set(requestId, result => { clearTimeout(timeout); resolve(result); });
        try { send('execution_legacy_begin', { requestId }); }
        catch { acknowledgements.get(requestId)?.(false); acknowledgements.delete(requestId); }
    });
    if (!allowed) throw new Error('Broker action blocked while native execution is unresolved');
    return outcome => {
        if (outcome === 'unknown') requiresReview = true;
        try { send('execution_legacy_end', { requestId, outcome }); }
        catch { requiresReview = true; }
    };
};
export const attachExecutionBridge = (connection: WebSocket) => {
    socket = connection;
    configureExecutionFence(acquireFence);
};
export const disconnectExecutionBridge = () => {
    if (epoch || ownershipPending || nativeActions.size > 0) requiresReview = true;
    epoch = ''; socket = undefined; ownershipPending = false; generationSent = 0;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
    acknowledgements.forEach(callback => callback(false)); acknowledgements.clear();
};

const startSession = () => {
    if (!enabled || requiresReview || epoch || ownershipPending || !liveSchwab() || getLegacyBrokerMutationsInFlight() > 0) return;
    const pairingKey = getPairingKey();
    if (!pairingKey || pairingKey.length < 32) return;
    ownershipPending = true;
    send('execution_hello', { pairingKey, live: true, broker: 'Schwab' });
};
const publishToken = () => {
    if (!epoch || !liveSchwab()) return;
    const value = getExecutionToken();
    if (!value || value.generation <= generationSent) return;
    accountHash = Secret.schwab().accountHash;
    send('execution_token', { ...value, accountHash });
    generationSent = value.generation;
};
const createOrder = (order: Models.OrderModel | undefined) => order ? {
    orderID: order.orderID, orderType: order.orderType, quantity: order.quantity,
    price: order.price, isBuy: order.isBuy,
} : undefined;
const supportedTradebookRules = (symbol: string, isLong: boolean) => {
    const state = TradingState.getBreakoutTradeState(symbol, isLong);
    const tradebook = TradebooksManager.getTradebookByID(symbol, state.submitEntryResult.tradeBookID);
    if (!tradebook) return true; // Existing ExitRulesCheckerNew also permits missing tradebooks.
    const supported = [Tradebook.prototype, BookmapWallReversal.prototype];
    const methods = ['getDisallowedReasonToMarketOutSingleOrder', 'getDisallowedReasonToAdjustSingleStopOrder',
        'getDisallowedReasonToAdjustSingleLimitOrder', 'getDisallowedReasonToAdjustAllExitPairs',
        'getDisallowedReasonToFlatten'] as const;
    return methods.every(method => supported.some(prototype => tradebook[method] === prototype[method]));
};
const publishState = () => {
    if (!epoch || !generationSent || !liveSchwab()) return;
    const observation = getBrokerObservation();
    if (!observation || observation.accountHash !== accountHash || Date.now() - observation.startedAt > 10_000) return;
    const symbols = new Set(Models.getWatchlist().map(item => item.symbol));
    window.HybridApp.AccountCache?.positions.forEach((_, symbol) => symbols.add(symbol));
    window.HybridApp.AccountCache?.entryOrders.forEach((_, symbol) => symbols.add(symbol));
    window.HybridApp.AccountCache?.exitPairs.forEach((_, symbol) => symbols.add(symbol));
    const revision = ++sequence;
    send('execution_state', { accountHash, symbols: [...symbols].map(symbol => {
        const quantity = Models.getPositionNetQuantity(symbol);
        const state = TradingState.getBreakoutTradeState(symbol, quantity > 0);
        const data = Models.getSymbolData(symbol);
        // Use the same selection ordering as handler.getExitPairFromKeyCode, retaining unrounded prices.
        const pairs = Models.getChartWidget(symbol)?.exitOrderPairs ?? Models.getExitPairs(symbol);
        return {
            symbol, revision, observedAt: observation.startedAt, quoteObservedAt: getExecutionQuoteTime(symbol),
            netQuantity: quantity, currentPrice: Models.getCurrentPrice(symbol), bid: data.bidPrice, ask: data.askPrice,
            batchCount: GlobalSettings.batchCount, splitPartials: quantity !== 0 && Handler.hasSplitPartials(symbol, quantity > 0),
            hasPlan: state.hasValue, entryPrice: state.entryPrice, coreTarget: state.plan.coreTarget,
            coreCount: state.plan.coreCount, coreRuleEnabled: GlobalSettings.enableCoreTargetExitFeature,
            rulesSupported: supportedTradebookRules(symbol, quantity > 0),
            entries: Models.getEntryOrders(symbol).map(createOrder),
            observedOrderIds: collectObservedOrderIds(window.HybridApp.AccountCache?.rawAccount),
            entryContext: entriesEnabled ? createExecutionEntryContext(symbol) : undefined,
            pairs: pairs.map(pair => ({ LIMIT: createOrder(pair.LIMIT), STOP: createOrder(pair.STOP),
                originalPartial: CoreTargetExitRules.getOriginalPartialNumber(symbol, pair) })),
        };
    }) });
};
const tick = async () => {
    if (!enabled && !requiresReview) return;
    if (!liveSchwab() || (accountHash && accountHash !== Secret.schwab().accountHash)) {
        if (epoch) send('execution_revoke');
        disconnectExecutionBridge();
        return;
    }
    startSession(); publishToken();
    if (epoch && !refreshing) {
        refreshing = true;
        try { await refreshAccountForExecution(); publishState(); }
        catch { /* Failed broker reads never produce a fresh execution snapshot. */ }
        finally { refreshing = false; }
    }
};
window.addEventListener('tradingscripts:execution-token-updated', () => { publishToken(); publishState(); });
window.addEventListener('tradingscripts:account-ui-updated', () => { publishState(); });

/** Return true before generic socket logging; credentials are never reflected or logged. */
export const handleExecutionMessage = (data: any): boolean => {
    if (typeof data.type !== 'string' || !data.type.startsWith('execution_')) return false;
    if (data.version !== VERSION) return true;
    if (data.type === 'execution_status') {
        enabled = data.enabled === true;
        entriesEnabled = data.entriesEnabled === true;
        requiresReview = data.requiresReview === true || (!enabled && data.blocked === true);
        if (!enabled) {
            epoch = ''; ownershipPending = false; generationSent = 0;
        }
        if (!data.blocked) nativeActions.clear();
        if (enabled && !heartbeat) heartbeat = setInterval(() => { void tick(); }, 3000);
        if (!enabled && heartbeat) { clearInterval(heartbeat); heartbeat = undefined; }
        void tick();
    } else if (data.type === 'execution_session') {
        if (!ownershipPending || typeof data.epoch !== 'string' || !data.epoch) return true;
        epoch = data.epoch; ownershipPending = false; accountHash = ''; generationSent = 0;
        publishToken(); void tick();
    } else if (data.type === 'execution_rejected') {
        ownershipPending = false;
        requiresReview = true;
        Firestore.logError('Native execution session rejected; check pairing, active account, and other browser tabs');
    } else if (data.epoch === epoch) {
        if (data.type === 'execution_legacy_ack') {
            acknowledgements.get(data.requestId)?.(data.allowed === true); acknowledgements.delete(data.requestId);
        } else if (data.type === 'execution_started') {
            nativeActions.add(data.actionId);
            if (typeof data.buttonName === 'string' && data.buttonName) Helper.speak(data.buttonName);
            if (data.action === 'wall_reversal_entry') {
                Helper.speak('is it a high quality setup?');
                Rules.checkPullbackRequirement(data.symbol, data.entryIsLong === true);
            }
            if (data.clearPending === true) TradingState.clearPendingOrder(data.symbol);
            Firestore.logInfo(`Native ${data.action} started for ${data.symbol}`);
        } else if (data.type === 'execution_result') {
            if (!nativeActions.delete(data.actionId)) return true;
            requiresReview = data.requiresReview === true;
            const text = `Native ${data.action} ${data.outcome} for ${data.symbol}${data.reason ? ': ' + data.reason : ''}`;
            if (data.outcome === 'accepted') Firestore.logInfo(text); else Firestore.logError(text);
            if (data.outcome === 'accepted' && data.action === 'wall_reversal_entry' && data.entry) {
                // Register before refreshing positions; a fast fill may already be in the cache.
                const symbolData = Models.getSymbolData(data.symbol);
                symbolData.highOfDay = Math.max(symbolData.highOfDay, data.entry.highOfDay);
                symbolData.lowOfDay = Math.min(symbolData.lowOfDay, data.entry.lowOfDay);
                void TradingState.onNativeEntryAccepted(data.symbol, data.entry).then(() => {
                    send('execution_entry_state', { actionId: data.actionId, initialized: true });
                }).catch(() => {
                    requiresReview = true;
                    Firestore.logError('Native entry trade-state initialization failed; review broker orders');
                    try { send('execution_entry_state', { actionId: data.actionId, initialized: false }); } catch { /* Disconnect also blocks native execution. */ }
                });
            }
            // Refresh only. Do not pass lifecycle messages back to KeyboardHandler/Broker mutations.
            void refreshAccountForExecution().then(() => {
                publishState();
                if (Models.getPositionNetQuantity(data.symbol) !== 0) {
                    PartialStopDiscipline.checkAndUpdatePhase(data.symbol, Models.getPositionNetQuantity(data.symbol) > 0);
                }
            }).catch(() => Firestore.logError('Native account reconciliation failed; execution remains blocked'));
            if (data.outcome === 'accepted' && data.action === 'market_out_partial') {
                setTimeout(() => { void refreshAccountForExecution().then(() => {
                    publishState();
                    if (Models.getPositionNetQuantity(data.symbol) !== 0) {
                        PartialStopDiscipline.checkAndUpdatePhase(data.symbol, Models.getPositionNetQuantity(data.symbol) > 0);
                    }
                }).catch(() => {}); }, 2000);
            }
        }
    }
    return true;
};
