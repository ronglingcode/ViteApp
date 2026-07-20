/**
 * This file is just a silly example to show everything working in the browser.
 * When you're ready to start on your site, clear the file. Happy hacking!
 **/
import * as WebRequest from './utils/webRequest';
import * as Helper from './utils/helper';
import * as TimeHelper from './utils/timeHelper';
import * as Firestore from './firestore';
import * as Broker from './api/broker';
import * as MarketData from './api/marketData';
import * as tdaApi from './api/tdAmeritrade/api';
import * as schwabApi from './api/schwab/api';
import * as Handler from './controllers/handler';
import * as OrderFlow from './controllers/orderFlow';
import * as OrderFlowManager from './controllers/orderFlowManager';
import * as Chart from './ui/chart';
import * as UI from './ui/ui';
import * as QuestionPopup from './ui/questionPopup';
import * as Config from './config/config';
import * as TakeProfit from './algorithms/takeProfit';
import * as RiskManager from './algorithms/riskManager';
import * as Watchlist from './algorithms/watchlist';
import * as AutoTrader from './algorithms/autoTrader';
import * as Models from './models/models';
import * as TradingState from './models/tradingState';
import * as TradingPlans from './models/tradingPlans/tradingPlans';
import * as TvTools from './tools/tradingview';
import * as TraderFocus from './controllers/traderFocus';
import * as KeyboardHandler from './controllers/keyboardHandler';
import * as ScwabStreaming from './api/schwab/streaming';
import * as MassiveStreaming from './api/massive/streaming';
import * as MarketDataWorkerBridge from './controllers/marketDataWorkerBridge';
import * as BookmapSocket from './bookmap/bookmapSocket';
import * as DB from './data/db';
import './tosClient';
import * as GlobalSettings from './config/globalSettings';
import * as AppVersion from './config/appVersion';
import * as Rules from './algorithms/rules';
import * as Runtime from './replay/runtime';
import * as ReplayApi from './replay/replayApi';
import * as ReplayCapture from './replay/replayCapture';
import * as ReplayUi from './replay/replayUi';
declare let window: Models.MyWindow;

console.log('main.ts loaded');

window.HybridApp.Algo = {
    TakeProfit: TakeProfit,
    RiskManager: RiskManager,
    Watchlist: Watchlist,
    AutoTrader: AutoTrader,
};
window.HybridApp.Api = {
    Broker: Broker,
    MarketData: MarketData,
    TdaApi: Runtime.capabilities.liveBroker ? tdaApi : {},
    SchwabApi: Runtime.capabilities.liveBroker ? schwabApi : {},
};
window.HybridApp.Config = Config;
window.HybridApp.Controllers = {
    Handler: Handler,
    OrderFlow: OrderFlow,
    OrderFlowManager: OrderFlowManager,
    TraderFocus: TraderFocus,
};

window.HybridApp.Models = {
    Models: Models,
    TradingState: TradingState,
    TradingPlans: TradingPlans,
};
window.HybridApp.UI = {
    Chart: Chart,
    UI: UI,
    QuestionPopup: QuestionPopup,
};
window.HybridApp.Utils = {
    'Helper': Helper,
    'WebRequest': WebRequest,
    TimeHelper: TimeHelper,
};
window.HybridApp.Firestore = Firestore;
window.HybridApp.Settings = window.HybridApp.Settings || {};
window.HybridApp.Settings.checkSpread = true;

let showExecutionButton = document.getElementById("show_execution");
if (showExecutionButton) {
    showExecutionButton.addEventListener("click", () => {
        Broker.generateExecutionScript(false);
    });
}

let showExecutionDetailsButton = document.getElementById("show_execution_detail");
if (showExecutionDetailsButton) {
    showExecutionDetailsButton.addEventListener("click", () => {
        Broker.generateExecutionScript(true);
    });
}
let exportButton = document.getElementById("export_trades");
if (exportButton) {
    exportButton.addEventListener("click", () => {
        TvTools.exportTrades();
    });
}
let checkQuantityButton = document.getElementById("check_quantity");
if (checkQuantityButton) {
    checkQuantityButton.addEventListener("click", () => {
        let watchlist = Models.getWatchlist();
        watchlist.forEach(item => {
            let q = RiskManager.getQuanityWithoutStopLoss(item.symbol);
            if (q > 0) {
                Firestore.logError(`${item.symbol} has ${q} shares without stop loss`);
            } else {
                Firestore.logInfo(`${item.symbol} check quantity is good`);
            }
        });
    });
}

let syncAccountButton = document.getElementById("update_account_ui");
if (syncAccountButton) {
    syncAccountButton.addEventListener("click", () => {
        Chart.updateAccountUIStatus('sync button');
        TraderFocus.updateUI();
    });
}

let testPopButton = document.getElementById("test_popup");
if (testPopButton) {
    testPopButton.addEventListener("click", () => {
        TraderFocus.test();
    });
}

let toggleManagementCardExitBlockButton = document.getElementById("toggle_management_card_exit_block");
const updateManagementCardExitBlockButtonText = () => {
    if (!toggleManagementCardExitBlockButton) {
        return;
    }
    toggleManagementCardExitBlockButton.textContent = GlobalSettings.blockExitAdjustmentsWithoutCommittedTradeManagementCard
        ? "Block card exits: ON"
        : "Block card exits: OFF";
};
if (toggleManagementCardExitBlockButton) {
    updateManagementCardExitBlockButtonText();
    toggleManagementCardExitBlockButton.addEventListener("click", () => {
        const enabled = GlobalSettings.toggleBlockExitAdjustmentsWithoutCommittedTradeManagementCard();
        updateManagementCardExitBlockButtonText();
        Firestore.addToLogView(`blockExitAdjustmentsWithoutCommittedTradeManagementCard: ${enabled}`, 'Info');
    });
}

Firestore.addToLogView(AppVersion.appVersionLogMessage, 'Info');

let now = new Date();
const historicalChartLoadAttemptCount = 3;
const historicalChartRetryDelayMs = 1000;

const delay = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
        return error.message;
    }
    return `${error}`;
};

const loadHistoricalChartsWithRetry = async (symbol: string, todayString: string) => {
    let lastFailure = '';
    for (let attempt = 1; attempt <= historicalChartLoadAttemptCount; attempt++) {
        try {
            let priceHistory = await MarketData.getFullPriceHistory(symbol, Helper.isFutures(symbol), todayString);
            let initialized = DB.initialize(symbol, priceHistory.today1MinuteBars, priceHistory.dailyBars);
            if (initialized) {
                if (Runtime.capabilities.bookmap) {
                    BookmapSocket.sendKeyLevelConfigForSymbol(symbol);
                }
                return priceHistory;
            }
            lastFailure = `initialize loaded 0 candles from ${priceHistory.today1MinuteBars.length} history bars`;
            Firestore.logError(`${symbol} historical chart initialize failed (attempt ${attempt}/${historicalChartLoadAttemptCount}): ${lastFailure}`);
            console.error(`${symbol} historical chart initialize failed`, { attempt, priceHistory });
        } catch (error) {
            lastFailure = getErrorMessage(error);
            Firestore.logError(`${symbol} historical chart load failed (attempt ${attempt}/${historicalChartLoadAttemptCount}): ${lastFailure}`);
            console.error(`${symbol} historical chart load failed`, error);
        }

        if (attempt < historicalChartLoadAttemptCount) {
            await delay(historicalChartRetryDelayMs);
        }
    }

    let finalMessage = `${symbol} HISTORICAL CHARTS FAILED after ${historicalChartLoadAttemptCount} attempts. Time and sales updates require historical candles; live chart updates are blocked. Last failure: ${lastFailure}`;
    Firestore.logError(finalMessage);
    throw new Error(finalMessage);
};

const createEmptyReplayAccount = (): Models.BrokerAccount => ({
    orderExecutions: new Map(),
    entryOrders: new Map(),
    exitPairs: new Map(),
    positions: new Map(),
    currentBalance: 0,
    trades: new Map(),
    tradesCount: 0,
    nonBreakevenTradesCount: 0,
    realizedPnL: 0,
});

const initializeReplayGlobals = (manifest: ReplayApi.ReplayManifest, bootstrap: ReplayApi.ReplayBootstrap) => {
    // Older recordings predate marketOpenEpochMs and always used a 09:25 cutover.
    const marketOpenEpochMs = manifest.marketOpenEpochMs ?? manifest.cutoverEpochMs + 5 * 60 * 1000;
    Config.setReplayTradingSession(manifest.marketDate, marketOpenEpochMs);
    TimeHelper.setCurrentMarketTime(new Date(manifest.cutoverEpochMs));
    const watchlist: Models.WatchlistItem[] = [{
        symbol: manifest.symbol,
        marketCapInMillions: bootstrap.runtimeSnapshot.marketCapInMillions,
    }];
    window.HybridApp.TradingPlans = [bootstrap.runtimeSnapshot.tradingPlanForSymbol as any];
    window.HybridApp.StockSelections = [manifest.symbol];
    window.HybridApp.TradingData = {
        activeProfileName: bootstrap.runtimeSnapshot.activeProfileName || 'momentumSimple',
        tradingSettings: bootstrap.runtimeSnapshot.tradingSettings as any,
    };
    window.HybridApp.Watchlist = watchlist;
    window.HybridApp.AccountCache = createEmptyReplayAccount();
    TradingState.initializeReplayTradingState(manifest.marketDate, watchlist);
};

const initializeReplayCharts = (manifest: ReplayApi.ReplayManifest, bootstrap: ReplayApi.ReplayBootstrap) => {
    const symbolData = Models.getSymbolData(manifest.symbol);
    symbolData.sharesOutstanding = bootstrap.sharesOutstanding;
    const initialized = DB.initialize(manifest.symbol, bootstrap.today1MinuteBars, bootstrap.dailyBars);
    if (!initialized) {
        throw new Error(`Replay bootstrap could not initialize ${manifest.symbol}`);
    }
    MarketData.setPreviousDayPremarketVolume(manifest.symbol, bootstrap.premarketDollarCollection);
    Chart.updateAccountUIStatusForSymbol(manifest.symbol);
};

const setupSharedAppUi = () => {
    Chart.setup();
    Models.setTimeframe(1);
    TraderFocus.updateTradeManagementUI();
};

const startReplay = async () => {
    const recordingId = Runtime.getReplayRecordingId();
    if (!recordingId) {
        await ReplayUi.showRecordingSelector(ReplayApi.listRecordings);
        return;
    }
    const { manifest, bootstrap } = await ReplayApi.loadReplaySession(recordingId);
    initializeReplayGlobals(manifest, bootstrap);
    setupSharedAppUi();
    initializeReplayCharts(manifest, bootstrap);
    ReplayUi.showPlaybackControls(manifest, {
        play: () => MarketDataWorkerBridge.sendReplayControl('play'),
        pause: () => MarketDataWorkerBridge.sendReplayControl('pause'),
        setSpeed: speed => MarketDataWorkerBridge.sendReplayControl('speed', speed),
    });
    MarketDataWorkerBridge.startReplayMarketDataWorker(recordingId);
    MarketDataWorkerBridge.registerMarketDataWorkerLifecycle();
};

const startLive = () => window.TradingApp.TOS.initialize().then(async () => {
    // tos initialized with new access token
    // tos access token expires in 30 minutes, so refresh before that
    // tradestation token expires in 20 minutes
    setInterval(Broker.refreshAccessToken, 1150 * 1000);
    setupSharedAppUi();

    const watchlist = Models.getWatchlist();
    const captureAllowed = GlobalSettings.enableReplayCapture &&
        GlobalSettings.useMarketDataWorker && watchlist.length === 1 &&
        ReplayCapture.canCaptureCurrentSession();
    const scheduledCutoverEpochMs = ReplayCapture.getScheduledCutoverEpochMs();
    const isLateCaptureStart = captureAllowed && Date.now() >= scheduledCutoverEpochMs;
    let liveMarketDataStarted = false;
    const startLiveMarketData = (capture?: ReplayCapture.ReplayCaptureWorkerConfig) => {
        if (liveMarketDataStarted) return;
        liveMarketDataStarted = true;
        if (GlobalSettings.useMarketDataWorker) {
            // The worker owns the Massive trades socket and the Schwab streamer socket
            // (account activity + level-one quotes); their parsing runs off the main thread.
            MarketDataWorkerBridge.startMarketDataWorker(capture);
            MarketDataWorkerBridge.registerMarketDataWorkerLifecycle();
        } else {
            ScwabStreaming.createWebSocket();
            MassiveStreaming.createWebSocket();
        }
    };

    // Before 09:25 the worker can start immediately and filter capture until the
    // scheduled boundary. A late launch waits for current M1 history first so that
    // history becomes the replay baseline instead of leaving a gap from 09:25.
    if (!isLateCaptureStart) {
        const capture = captureAllowed ? await ReplayCapture.start(watchlist[0].symbol) : undefined;
        startLiveMarketData(capture);
    }

    if (GlobalSettings.enableBookmapSocket && Runtime.capabilities.bookmap) {
        BookmapSocket.createWebSocket();
    }
    let today = new Date();
    let todayString = TimeHelper.formatDateToYYYYMMDD(today);


    // get price history
    for (let i = 0; i < watchlist.length; i++) {
        let symbol = watchlist[i].symbol;
        let marketCap = Models.getMarketCapInMillions(symbol);
        if (!marketCap) {
            alert(`no market cap for ${symbol}`);
        } else if (marketCap < 500) {
            alert(`${symbol} market cap too low, only $ ${marketCap} M`);
            if (isLateCaptureStart) startLiveMarketData();
            return;
        }
        let sharesOutstandingPromise = MarketData.getSharesOutstanding(symbol);
        loadHistoricalChartsWithRetry(symbol, todayString).then(async (priceHistory) => {
            Chart.updateAccountUIStatusForSymbol(symbol);
            MarketData.setPreviousDayPremarketVolume(symbol, priceHistory.premarketDollarCollection);

            if (isLateCaptureStart) {
                const lateCutoverEpochMs = Date.now();
                const lateCapture = await ReplayCapture.start(symbol, lateCutoverEpochMs);
                // saveBootstrap clones the current DB candles before its first await. Start
                // the worker immediately afterward so new prints belong only to replay.
                const bootstrapSave = ReplayCapture.saveBootstrap(
                    symbol,
                    priceHistory,
                    Models.getSymbolData(symbol).sharesOutstanding || 0,
                    false,
                );
                startLiveMarketData(lateCapture);
                const sharesOutstanding = await sharesOutstandingPromise;
                await bootstrapSave;
                await ReplayCapture.updateBootstrapSharesOutstanding(sharesOutstanding);
            } else {
                const sharesOutstanding = await sharesOutstandingPromise;
                await ReplayCapture.saveBootstrap(symbol, priceHistory, sharesOutstanding);
            }

            // check implied market cap threshold
            let impliedMarketCapInBillions = MarketData.getImpliedMarketCapInBillions(symbol);
            if (impliedMarketCapInBillions > 0 && impliedMarketCapInBillions < GlobalSettings.impliedMarketCapThresholdInBillions) {
                if (symbol != 'STI') {
                    Firestore.logError(`${symbol} blocked: implied market cap $${impliedMarketCapInBillions}B, below $${GlobalSettings.impliedMarketCapThresholdInBillions}B threshold`);
                    Chart.hideChart(symbol);
                    return;
                }
            }

            // check premarket volume threshold
            let premarketSharesInMillions = priceHistory.premarketDollarCollection.lastDayShares / 1000000;
            if (!GlobalSettings.premarketVolumeThresholdWhitelist.includes(symbol)
                && premarketSharesInMillions < GlobalSettings.premarketVolumeThresholdInMillions) {
                Firestore.logError(`${symbol} blocked: premarket volume ${premarketSharesInMillions.toFixed(2)}M shares, below ${GlobalSettings.premarketVolumeThresholdInMillions}M threshold`);
                Chart.hideChart(symbol);
                return;
            }

            const secondsSinceMarketOpen = 0;
            let allowEarlyEntry = Rules.shouldAllowEarlyEntry(symbol, secondsSinceMarketOpen);
            if (!allowEarlyEntry.allowed) {
                alert(`${symbol} ${allowEarlyEntry.reason}`);
            }
            if (now > Helper.getMarketOpenTime()) {
                AutoTrader.onMarketOpen(symbol);
            }
        }).catch(error => {
            console.error(`${symbol} startup stopped because historical charts did not load`, error);
            if (isLateCaptureStart) startLiveMarketData();
        });
    }
    UI.setupAutoSync();
    AutoTrader.scheduleEvents();
    // MarketData.testTradeStationStreamBar();
});

const startApplication = async () => {
    try {
        if (Runtime.isReplayMode()) {
            await startReplay();
        } else {
            await startLive();
        }
    } catch (error) {
        console.error('Application startup failed', error);
        Firestore.addToLogView(`startup failed: ${getErrorMessage(error)}`, 'Error');
        if (Runtime.isReplayMode()) {
            await ReplayUi.showRecordingSelector(ReplayApi.listRecordings);
        }
    }
};

startApplication();

let htmlBody = document.getElementsByTagName("body")[0];
htmlBody.addEventListener("keydown", async function (keyboardEvent) {
    if (Runtime.isReplayMode()) {
        return;
    }
    if (window.HybridApp.UIState.activeTabIndex === -1) {
        Firestore.logError("no active tab, skip key press");
        return;
    }
    let code = keyboardEvent.code;
    let shiftKey = keyboardEvent.shiftKey;
    KeyboardHandler.handleKeyPressed(code, shiftKey);
});

document.addEventListener('DOMContentLoaded', () => {
    // Setup section expand/collapse functionality for collapsible trader-focus sections.
    const sectionHeaders = document.querySelectorAll('.clickableSectionTitle');
    sectionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const sectionId = header.getAttribute('data-section');
            if (sectionId) {
                const container = header.closest('.collapsibleSection');
                if (container) {
                    container.classList.toggle('collapsed');
                    const icon = header.querySelector('.collapseIcon');
                    if (icon) {
                        icon.textContent = container.classList.contains('collapsed') ? '+' : '−';
                    }
                }
            }
        });
    });
});

if (!GlobalSettings.enableLeftPaneFeatures) {
    let leftPane = document.getElementById('traderFocus');
    if (leftPane) {
        leftPane.style.display = 'none';
    }
}
