import * as Models from '../models/models';
import * as TradingState from '../models/tradingState';
import * as Config from '../config/config';
import * as GlobalSettings from '../config/globalSettings';
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
import { getExecutionToken } from './executionMetadata';
import { createExecutionEntryContext } from './executionEntryContext';
import { publishExecutionMarketData, registerExecutionMarketDataPublisher } from './executionMarketData';
import { describeError } from '../utils/errorDetails';

declare const window: Models.MyWindow;
const VERSION = 3;
let socket: WebSocket | undefined;
let enabled = false;
let sequence = 0;
let generationSent = 0;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let refreshing = false;
let refreshAccountForExecution = () => Chart.updateAccountUIStatus('native execution');
export const registerExecutionAccountRefresh = (refresh: () => Promise<void>) => { refreshAccountForExecution = refresh; };

const liveSchwab = () => Config.getProfileSettings().brokerName === 'Schwab' && Config.getProfileSettings().isEquity;
const send = (type: string, data: object = {}) => {
    try {
        if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('Native execution connection unavailable');
        socket.send(JSON.stringify({ type, version: VERSION, ...data }));
    }
    catch (error) {
        const secrets = Secret.schwab();
        const reason = describeError(error, getExecutionToken()?.accessToken, secrets.refreshToken, secrets.accountHash);
        Firestore.logError(`Send ${type} to Bookmap failed: ${reason}`);
        throw new Error(`Send ${type} to Bookmap failed: ${reason}`);
    }
};
registerExecutionMarketDataPublisher(data => {
    if (!enabled || socket?.readyState !== WebSocket.OPEN || !liveSchwab()) return;
    send('execution_market_data', { priceUnit: 'real', ...data });
});
export const attachExecutionBridge = (connection: WebSocket) => {
    socket = connection;
};
export const disconnectExecutionBridge = () => {
    socket = undefined; generationSent = 0;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
};

const publishToken = () => {
    if (!enabled || socket?.readyState !== WebSocket.OPEN || !liveSchwab()) return;
    const value = getExecutionToken();
    if (!value || value.generation <= generationSent) return;
    send('execution_token', { ...value, accountHash: Secret.schwab().accountHash });
    generationSent = value.generation;
};
const createOrder = (order: Models.OrderModel | undefined) => order ? {
    orderID: order.orderID, orderType: order.orderType, quantity: order.quantity,
    price: order.price, isBuy: order.isBuy,
    exitStopPrice: 'exitStopPrice' in order ? order.exitStopPrice : undefined,
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
    if (!enabled || socket?.readyState !== WebSocket.OPEN || !generationSent || !liveSchwab()) return;
    if (!window.HybridApp.AccountCache) return;
    const symbols = new Set(Models.getWatchlist().map(item => item.symbol));
    window.HybridApp.AccountCache?.positions.forEach((_, symbol) => symbols.add(symbol));
    window.HybridApp.AccountCache?.entryOrders.forEach((_, symbol) => symbols.add(symbol));
    window.HybridApp.AccountCache?.exitPairs.forEach((_, symbol) => symbols.add(symbol));
    const revision = ++sequence;
    send('execution_state', { symbols: [...symbols].map(symbol => {
        const quantity = Models.getPositionNetQuantity(symbol);
        const state = TradingState.getBreakoutTradeState(symbol, quantity > 0);
        const data = Models.getSymbolData(symbol);
        // Use the same selection ordering as handler.getExitPairFromKeyCode, retaining unrounded prices.
        const pairs = Models.getChartWidget(symbol)?.exitOrderPairs ?? Models.getExitPairs(symbol);
        return {
            symbol, revision,
            netQuantity: quantity, averagePrice: Models.getAveragePrice(symbol), currentPrice: Models.getCurrentPrice(symbol), bid: data.bidPrice, ask: data.askPrice,
            batchCount: GlobalSettings.batchCount, splitPartials: quantity !== 0 && Handler.hasSplitPartials(symbol, quantity > 0),
            hasPlan: state.hasValue, entryPrice: state.entryPrice, coreTarget: state.plan.coreTarget,
            coreCount: state.plan.coreCount, coreRuleEnabled: GlobalSettings.enableCoreTargetExitFeature,
            rulesSupported: supportedTradebookRules(symbol, quantity > 0),
            entries: Models.getEntryOrders(symbol).map(createOrder),
            entryContext: createExecutionEntryContext(symbol),
            pairs: pairs.map(pair => ({ LIMIT: createOrder(pair.LIMIT), STOP: createOrder(pair.STOP),
                originalPartial: CoreTargetExitRules.getOriginalPartialNumber(symbol, pair) })),
        };
    }) });
};
const tick = async () => {
    if (!enabled) return;
    if (!liveSchwab() || socket?.readyState !== WebSocket.OPEN) return;
    publishToken();
    if (!refreshing) {
        refreshing = true;
        try { await refreshAccountForExecution(); publishState(); }
        catch (error) { Firestore.logError(`Native periodic account/state refresh failed: ${describeError(error)}`); }
        finally { refreshing = false; }
    }
};
window.addEventListener('tradingscripts:execution-token-updated', () => { publishToken(); publishState(); });
window.addEventListener('tradingscripts:account-ui-updated', () => { publishState(); });

/** Return true before generic socket logging; credentials are never reflected or logged. */
const applyExecutionMessage = (data: any): boolean => {
    if (typeof data.type !== 'string' || !data.type.startsWith('execution_')) return false;
    if (data.version !== VERSION) return true;
    if (data.type === 'execution_status') {
        enabled = data.enabled === true;
        if (data.requiresReview && data.reason) Firestore.logError(`Native requires broker review: ${data.reason}`);
        if (!enabled) {
            generationSent = 0;
        }
        if (enabled && !heartbeat) heartbeat = setInterval(() => { void tick(); }, 3000);
        if (!enabled && heartbeat) { clearInterval(heartbeat); heartbeat = undefined; }
        if (enabled) Models.getWatchlist().forEach(({ symbol }) => {
            publishExecutionMarketData(symbol, Models.getCurrentPrice(symbol), Models.getSymbolData(symbol));
        });
        void tick();
    } else if (data.type === 'execution_rejected') {
        Firestore.logError(`Native execution update rejected: ${data.reason || 'plugin did not supply a reason'}`);
    } else if (data.type === 'execution_blocked') {
        Firestore.logError(`Native execution blocked for ${data.symbol}: ${data.reason}`);
    } else {
        if (data.type === 'execution_started') {
            if (typeof data.buttonName === 'string' && data.buttonName) Helper.speak(data.buttonName);
            if (data.action === 'wall_reversal_entry') {
                Helper.speak('is it a high quality setup?');
                Rules.checkPullbackRequirement(data.symbol, data.entryIsLong === true);
            }
            if (data.clearPending === true) TradingState.clearPendingOrder(data.symbol);
            if (data.action === 'reload_partial') {
                TradingState.setLowestExitBatchCount(data.symbol, data.reloadIsLong === true, data.exitPairCount);
            }
            Firestore.logInfo(`Native ${data.action} started for ${data.symbol}`);
        } else if (data.type === 'execution_result') {
            const text = `Native ${data.action} ${data.outcome} for ${data.symbol}${data.reason ? ': ' + data.reason : ''}`;
            if (data.outcome === 'accepted') Firestore.logInfo(text); else Firestore.logError(text);
            if (data.entry) {
                // Register before refreshing positions; a fast fill may already be in the cache.
                const symbolData = Models.getSymbolData(data.symbol);
                symbolData.highOfDay = Math.max(symbolData.highOfDay, data.entry.highOfDay);
                symbolData.lowOfDay = Math.min(symbolData.lowOfDay, data.entry.lowOfDay);
                void TradingState.onNativeEntryAccepted(data.symbol, data.entry).then(() => {
                    send('execution_entry_state', { actionId: data.actionId, symbol: data.symbol, initialized: true });
                }).catch(error => {
                    const reason = describeError(error);
                    Firestore.logError(`Native entry trade-state initialization failed for ${data.symbol}: ${reason}; review broker orders`);
                    try { send('execution_entry_state', { actionId: data.actionId, symbol: data.symbol, initialized: false, reason }); }
                    catch (sendError) { Firestore.logError(`Native entry failure report to Bookmap failed: ${describeError(sendError)}`); }
                });
            }
            // Refresh only. Do not pass lifecycle messages back to KeyboardHandler/Broker mutations.
            void refreshAccountForExecution().then(() => {
                publishState();
                if (Models.getPositionNetQuantity(data.symbol) !== 0) {
                    PartialStopDiscipline.checkAndUpdatePhase(data.symbol, Models.getPositionNetQuantity(data.symbol) > 0);
                }
            }).catch(error => Firestore.logError(`Native ${data.action} account/state refresh failed for ${data.symbol}: ${describeError(error)}`));
            if (data.outcome === 'accepted' && data.action === 'market_out_partial') {
                setTimeout(() => { void refreshAccountForExecution().then(() => {
                    publishState();
                    if (Models.getPositionNetQuantity(data.symbol) !== 0) {
                        PartialStopDiscipline.checkAndUpdatePhase(data.symbol, Models.getPositionNetQuantity(data.symbol) > 0);
                    }
                }).catch(error => Firestore.logError(`Native partial-exit follow-up refresh failed for ${data.symbol}: ${describeError(error)}`)); }, 2000);
            }
        }
    }
    return true;
};
export const handleExecutionMessage = (data: any): boolean => {
    if (typeof data.type !== 'string' || !data.type.startsWith('execution_')) return false;
    try { return applyExecutionMessage(data); }
    catch (error) {
        Firestore.logError(`Handle ${data.type} from Bookmap failed: ${describeError(error, getExecutionToken()?.accessToken)}`);
        return true;
    }
};
