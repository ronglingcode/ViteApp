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
import * as PremarketVolume from './algorithms/premarketVolume';
import * as NotificationEngine from './notifications/notificationEngine';
declare let window: Models.MyWindow;

console.log('main.ts loaded');

window.HybridApp.Algo = {
    TakeProfit: TakeProfit,
    RiskManager: RiskManager,
    Watchlist: Watchlist,
    AutoTrader: AutoTrader,
    NotificationEngine: NotificationEngine,
};
window.HybridApp.Api = {
    Broker: Broker,
    MarketData: MarketData,
    TdaApi: tdaApi,
    SchwabApi: schwabApi,
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
    });
}
let testPopButton = document.getElementById("test_popup");
if (testPopButton) {
    testPopButton.addEventListener("click", () => {
        // no op
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
                BookmapSocket.sendKeyLevelConfigForSymbol(symbol);
                BookmapSocket.sendVwapUpdatesForSymbol(symbol);
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

const setupAppUi = () => {
    Chart.setup();
    Models.setTimeframe(1);
};

const startLive = () => window.TradingApp.TOS.initialize().then(async () => {
    setInterval(() => schwabApi.maintainAccessToken().catch(Firestore.logError), 30000);
    setupAppUi();

    const watchlist = Models.getWatchlist();
    if (GlobalSettings.useMarketDataWorker) {
        // Parse trades, quotes, and account activity off the main thread.
        MarketDataWorkerBridge.startMarketDataWorker();
        MarketDataWorkerBridge.registerMarketDataWorkerLifecycle();
    } else {
        ScwabStreaming.createWebSocket();
        MassiveStreaming.createWebSocket();
    }

    if (GlobalSettings.enableBookmapSocket) {
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
            return;
        }
        let sharesOutstandingPromise = MarketData.getSharesOutstanding(symbol);
        loadHistoricalChartsWithRetry(symbol, todayString).then(async (priceHistory) => {
            Chart.updateAccountUIStatusForSymbol(symbol);
            MarketData.setPreviousDayPremarketVolume(symbol, priceHistory.premarketDollarCollection);

            await sharesOutstandingPromise;

            // check implied market cap threshold
            let impliedMarketCapInBillions = MarketData.getImpliedMarketCapInBillions(symbol);
            if (impliedMarketCapInBillions > 0 && impliedMarketCapInBillions < GlobalSettings.impliedMarketCapThresholdInBillions) {
                if (symbol != 'STI') {
                    Firestore.logError(`${symbol} blocked: implied market cap $${impliedMarketCapInBillions}B, below $${GlobalSettings.impliedMarketCapThresholdInBillions}B threshold`);
                    Chart.hideChart(symbol);
                    return;
                }
            }

            // Hard floor: below this many premarket shares, block trading regardless of relative volume.
            const volumeFloor = PremarketVolume.checkPremarketVolumeHardFloor(priceHistory.premarketDollarCollection);
            if (!volumeFloor.passed) {
                Firestore.logError(`${symbol} blocked: ${volumeFloor.description}; below hard floor`);
                Chart.hideChart(symbol);
                return;
            }

            // Allow stocks that meet either premarket volume threshold.
            const absoluteVolume = PremarketVolume.checkAbsolutePremarketVolume(priceHistory.premarketDollarCollection);
            const relativeVolume = PremarketVolume.checkRelativePremarketVolume(priceHistory.premarketDollarCollection);
            if (!(absoluteVolume.passed || relativeVolume.passed)) {
                Firestore.logError(`${symbol} blocked: ${absoluteVolume.description}, ${relativeVolume.description}; neither threshold met`);
                Chart.hideChart(symbol);
                return;
            }

            // Range bound reversal plans cannot trade a 2nd day play: none of the previous 3
            // daily candles may have broken out of or broken down the previous consolidation area.
            let tradingPlans = TradingPlans.getTradingPlansWithoutDefault(symbol);
            let previousConsolidationReason = TradingPlans.validatePreviousConsolidationArea(
                tradingPlans, priceHistory.dailyBars);
            if (previousConsolidationReason != "") {
                Firestore.logError(`${symbol} blocked: ${previousConsolidationReason}`);
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
        });
    }
    AutoTrader.scheduleEvents();
});

const startApplication = async () => {
    try {
        await startLive();
    } catch (error) {
        console.error('Application startup failed', error);
        Firestore.addToLogView(`startup failed: ${getErrorMessage(error)}`, 'Error');
    }
};

NotificationEngine.initialize();
startApplication();

let htmlBody = document.getElementsByTagName("body")[0];
htmlBody.addEventListener("keydown", async function (keyboardEvent) {
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
