import './ui/lite.css';
import * as ConfigDataLite from './api/configDataLite';
import * as AppVersion from '../config/appVersion';
import * as GlobalSettings from '../config/globalSettings';
import * as BookmapSocket from '../bookmap/bookmapSocket';
import * as KeyboardHandler from '../controllers/keyboardHandler';
import * as TraderFocus from '../controllers/traderFocus';
import * as SchwabLite from './api/schwabLite';
import * as ExitAdjustmentsLite from './controllers/exitAdjustmentsLite';
import * as StateLite from './models/stateLite';
import * as SharedRuntimeLite from './shared/sharedRuntimeLite';
import * as ChartLite from './ui/chartLite';
import * as ControlButtonsLite from './ui/controlButtonsLite';
import * as ShellLite from './ui/shellLite';
import * as StatusLite from './ui/statusLite';

const liteAppRoot = document.getElementById('liteApp');
if (!liteAppRoot) {
    throw new Error('Missing liteApp root element');
}
const root = liteAppRoot;

let worker: Worker | null = null;
let tokenRefreshInterval: ReturnType<typeof setInterval> | null = null;
let clockInterval: ReturnType<typeof setInterval> | null = null;
let activeSecrets: StateLite.LiteSecrets | null = null;
let positionsBySymbol = new Map<string, StateLite.PositionSnapshot>();
let entryOrdersBySymbol = new Map<string, StateLite.LiteOrderModel[]>();
let exitPairsBySymbol = new Map<string, StateLite.LiteExitPair[]>();
let lastPriceBySymbol = new Map<string, number>();
let symbolElements = new Map<string, ShellLite.SymbolElements>();
let activeSymbol = '';
const showSimpleChart = GlobalSettings.showSimpleChart;

const shouldEnableSchwabStreamer = () => {
    // Lite is allowed to hide chart rendering, but it should still run every live-trading stream.
    // Schwab streaming provides account activity and level-one quotes; keep it on by default.
    return true;
};

const setActiveSymbol = (symbol: string) => {
    activeSymbol = symbol;
    let appWindow = window as any;
    appWindow.HybridApp = appWindow.HybridApp ?? {};
    appWindow.HybridApp.UIState = appWindow.HybridApp.UIState ?? {
        activeTabIndex: -1,
    };
    appWindow.HybridApp.UIState.activeSymbol = symbol;
    appWindow.HybridApp.UIState.activeTabIndex = symbol ? 0 : -1;
};

const getActiveSymbol = () => {
    return activeSymbol || Array.from(symbolElements.keys())[0] || '';
};

const getCurrentPrice = (symbol: string) => {
    let currentPrice = lastPriceBySymbol.get(symbol);
    if (currentPrice != null) {
        return currentPrice;
    }
    let displayedPrice = symbolElements.get(symbol)?.price.textContent ?? '';
    let parsedPrice = Number(displayedPrice.replace(/,/g, ''));
    return Number.isFinite(parsedPrice) ? parsedPrice : undefined;
};

const renderShell = (watchlist: StateLite.LiteWatchlistItem[]) => {
    symbolElements = ShellLite.renderShell(root, watchlist, {
        onActiveSymbolChange: setActiveSymbol,
        onReconnect: () => {
            if (!activeSecrets) {
                initialize().catch(error => handleError('lite', error));
                return;
            }
            startWorker(watchlist, activeSecrets);
        },
    }, { showSimpleChart });

    ControlButtonsLite.setupMainAppControlButtons({
        setOrderStatus: StatusLite.setOrderStatus,
        logEvent: StatusLite.logEvent,
        handleError,
        refreshAccount,
    });
    StatusLite.logEvent(AppVersion.appVersionLogMessage);
};

const renderTradebookButtons = (watchlist: StateLite.LiteWatchlistItem[]) => {
    SharedRuntimeLite.renderTradebooksForWatchlist(watchlist, {
        onStatus: (message, isError = false) => {
            StatusLite.setOrderStatus(message, isError);
            StatusLite.logEvent(message, isError);
        },
        onAfterEntry: refreshAccount,
    });
};

const updatePositionsUi = () => {
    symbolElements.forEach((elements, symbol) => {
        let position = positionsBySymbol.get(symbol);
        elements.position.textContent = `pos: ${StateLite.formatQuantity(position?.quantity)}`;
        elements.avg.textContent = `avg: ${StateLite.formatPrice(position?.averagePrice)}`;
    });
};

const updateExitPairsUi = () => {
    symbolElements.forEach((elements, symbol) => {
        let pairs = exitPairsBySymbol.get(symbol) ?? [];
        elements.exitOrders.textContent = showSimpleChart
            ? ChartLite.drawExitPairs(symbol, pairs)
            : ChartLite.buildExitOrdersSummary(pairs);
    });
};

const updateEntryOrdersUi = () => {
    if (!showSimpleChart) {
        return;
    }
    symbolElements.forEach((_elements, symbol) => {
        ChartLite.drawEntryOrders(symbol, entryOrdersBySymbol.get(symbol) ?? []);
    });
};

const updateOrderChartRanges = () => {
    if (!showSimpleChart) {
        return;
    }
    symbolElements.forEach((_elements, symbol) => {
        ChartLite.updateOrderChartRange(symbol, getCurrentPrice(symbol));
    });
};

const pushBookmapAccountSnapshot = () => {
    if (!GlobalSettings.enableBookmapSocket) {
        return;
    }
    BookmapSocket.sendExitOrderPairConfigsForAllSymbols();
    BookmapSocket.sendAccountStatesForAllSymbols();
};

const pushBookmapRuntimeSnapshot = () => {
    if (!GlobalSettings.enableBookmapSocket) {
        return;
    }
    BookmapSocket.sendTradeButtonConfigsForAllSymbols();
    BookmapSocket.sendKeyLevelConfigsForAllSymbols();
    pushBookmapAccountSnapshot();
};

const startBookmapSocket = () => {
    if (!GlobalSettings.enableBookmapSocket) {
        return;
    }
    BookmapSocket.createWebSocket();
    pushBookmapRuntimeSnapshot();
};

async function refreshAccount() {
    if (!activeSecrets) {
        return;
    }
    let account = await SchwabLite.getLiteAccountSnapshot(
        activeSecrets.schwab,
        activeSecrets.schwab.accessToken
    );
    positionsBySymbol = account.positions;
    entryOrdersBySymbol = account.entryOrders;
    exitPairsBySymbol = account.exitPairs;
    SharedRuntimeLite.syncAccountSnapshot(account);
    updatePositionsUi();
    updateEntryOrdersUi();
    updateExitPairsUi();
    updateOrderChartRanges();
    TraderFocus.updateTradeManagementUI();
    pushBookmapAccountSnapshot();
}

function handleError(source: string, error: unknown) {
    let message = error instanceof Error ? error.message : String(error);
    StatusLite.setStatus(source, 'error');
    if (!document.getElementById('orderStatus')) {
        StatusLite.showRootError(root, source, message);
        console.error(error);
        return;
    }
    StatusLite.setOrderStatus(`${source}: ${message}`, true);
    StatusLite.logEvent(`${source}: ${message}`, true);
    console.error(error);
}

const exitAdjuster = new ExitAdjustmentsLite.LiteExitAdjuster({
    getActiveSymbol,
    getActiveSecrets: () => activeSecrets,
    getPositionQuantity: symbol => positionsBySymbol.get(symbol)?.quantity ?? 0,
    getExitPairs: symbol => exitPairsBySymbol.get(symbol) ?? [],
    getCurrentPrice,
    refreshAccount,
    setOrderStatus: StatusLite.setOrderStatus,
    logEvent: StatusLite.logEvent,
    handleError,
});

const handleWorkerMessage = (message: StateLite.WorkerToMainMessage) => {
    if (message.type === 'status') {
        StatusLite.setStatus(message.source, message.status);
        return;
    }
    if (message.type === 'history') {
        if (showSimpleChart) {
            ChartLite.setLiteChartHistory(message.symbol, message.candles);
        }
        SharedRuntimeLite.syncHistory(message.symbol, message.candles, message.dailyCandles);
        return;
    }
    if (message.type === 'snapshot') {
        message.snapshots.forEach(snapshot => {
            let elements = symbolElements.get(snapshot.symbol);
            if (!elements) {
                return;
            }
            if (snapshot.lastPrice != null) {
                lastPriceBySymbol.set(snapshot.symbol, snapshot.lastPrice);
            }
            elements.price.textContent = StateLite.formatPrice(snapshot.lastPrice);
            elements.volume.textContent = snapshot.candle ? StateLite.formatQuantity(snapshot.candle.volume) : '';
            elements.bid.textContent = StateLite.formatPrice(snapshot.bid);
            elements.ask.textContent = StateLite.formatPrice(snapshot.ask);
            elements.spread.textContent = StateLite.formatPrice(snapshot.spread);
            if (snapshot.candle) {
                elements.currentCandle.open.textContent = `O:${StateLite.formatPrice(snapshot.candle.open)}`;
                elements.currentCandle.high.textContent = `H:${StateLite.formatPrice(snapshot.candle.high)}`;
                elements.currentCandle.low.textContent = `L:${StateLite.formatPrice(snapshot.candle.low)}`;
                elements.currentCandle.close.textContent = `C:${StateLite.formatPrice(snapshot.candle.close)}`;
            }
            if (showSimpleChart) {
                ChartLite.updateLiteChartCandle(snapshot.symbol, snapshot.candle);
            }
            SharedRuntimeLite.syncSnapshot(snapshot);
        });
        return;
    }
    if (message.type === 'accountActivity') {
        StatusLite.logEvent(`Schwab activity ${message.summary || 'received'}`);
        refreshAccount().catch(error => handleError('account', error));
        return;
    }
    if (message.type === 'error') {
        handleError(message.source, message.message);
    }
};

const stopWorker = () => {
    worker?.postMessage({ type: 'stop' } satisfies StateLite.MainToWorkerMessage);
    worker?.terminate();
    worker = null;
};

const startWorker = (watchlist: StateLite.LiteWatchlistItem[], secrets: StateLite.LiteSecrets) => {
    stopWorker();
    worker = new Worker(new URL('./workers/marketDataWorker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<StateLite.WorkerToMainMessage>) => {
        handleWorkerMessage(event.data);
    });
    worker.postMessage({
        type: 'start',
        payload: {
            watchlist,
            secrets,
            enableSchwabStreamer: shouldEnableSchwabStreamer(),
        },
    } satisfies StateLite.MainToWorkerMessage);
};

const refreshToken = async (secrets: StateLite.SchwabSecrets) => {
    StatusLite.setStatus('auth', 'refreshing');
    let accessToken = await SchwabLite.refreshSchwabAccessToken(secrets);
    secrets.accessToken = accessToken;
    StatusLite.setStatus('auth', 'ready');
};

const scheduleTokenRefresh = (secrets: StateLite.SchwabSecrets) => {
    if (tokenRefreshInterval) {
        clearInterval(tokenRefreshInterval);
    }
    tokenRefreshInterval = setInterval(() => {
        refreshToken(secrets).catch(error => handleError('auth', error));
    }, 20 * 60 * 1000);
};

const startClock = () => {
    StatusLite.updateClock();
    if (!clockInterval) {
        clockInterval = setInterval(StatusLite.updateClock, 1000);
    }
};

const resetRuntimeState = () => {
    ChartLite.destroyLiteCharts();
    activeSecrets = null;
    positionsBySymbol = new Map();
    entryOrdersBySymbol = new Map();
    exitPairsBySymbol = new Map();
    lastPriceBySymbol = new Map();
    symbolElements = new Map();
    exitAdjuster.resetBusy();
};

const initialize = async () => {
    resetRuntimeState();
    let config = await ConfigDataLite.fetchConfigData();
    let watchlist = await ConfigDataLite.createLiteWatchlistFromConfig(config);
    renderShell(watchlist);
    startClock();

    let schwabSecrets = StateLite.getSchwabSecrets();
    let massiveSecrets = StateLite.getMassiveSecrets();
    if (!StateLite.hasRequiredSecrets(schwabSecrets, massiveSecrets)) {
        StatusLite.setOrderStatus('Missing Schwab or Massive secrets in localStorage', true);
        StatusLite.setStatus('lite', 'missing secrets');
        return;
    }

    await refreshToken(schwabSecrets);
    scheduleTokenRefresh(schwabSecrets);
    let streamerInfo = undefined;
    if (shouldEnableSchwabStreamer()) {
        StatusLite.setStatus('schwab', 'loading preference');
        streamerInfo = await SchwabLite.getSchwabStreamerInfo(schwabSecrets, schwabSecrets.accessToken);
    }

    activeSecrets = {
        schwab: schwabSecrets,
        massive: massiveSecrets,
        streamerInfo,
    };
    SharedRuntimeLite.initializeSharedRuntime(config, watchlist, activeSecrets);
    renderTradebookButtons(watchlist);
    await refreshAccount();
    startBookmapSocket();
    startWorker(watchlist, activeSecrets);
    StatusLite.setOrderStatus('Ready');
};

window.addEventListener('keydown', event => {
    exitAdjuster.handleKeyboardAdjust(event).catch(error => handleError('adjust exits', error));
    if (event.defaultPrevented) {
        return;
    }

    let target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return;
    }

    let symbol = getActiveSymbol();
    if (!symbol) {
        return;
    }
    KeyboardHandler.handleKeyPressed(event.code, event.shiftKey, symbol);
});

window.addEventListener('tradingscripts:lite-account-refresh', event => {
    let source = (event as CustomEvent<{ source?: string }>).detail?.source ?? 'order event';
    refreshAccount()
        .then(() => StatusLite.logEvent(`account refreshed ${source}`))
        .catch(error => handleError('account refresh', error));
});

window.addEventListener('beforeunload', () => {
    stopWorker();
    if (tokenRefreshInterval) {
        clearInterval(tokenRefreshInterval);
    }
    if (clockInterval) {
        clearInterval(clockInterval);
    }
});

initialize().catch(error => handleError('lite', error));
