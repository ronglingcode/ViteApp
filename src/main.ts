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
import * as alpacaApi from './api/alpaca/api';
import * as googleDocsApi from './api/googleDocs/googleDocsApi';
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
import * as AlpacaStreaming from './api/alpaca/streaming';
import * as ScwabStreaming from './api/schwab/streaming';
import * as MassiveStreaming from './api/massive/streaming';
import * as MarketDataWorkerBridge from './controllers/marketDataWorkerBridge';
import * as BookmapSocket from './bookmap/bookmapSocket';
import * as DB from './data/db';
import './tosClient';
import * as GlobalSettings from './config/globalSettings';
import * as Rules from './algorithms/rules';
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
    TdaApi: tdaApi,
    SchwabApi: schwabApi,
    AlpacaApi: alpacaApi,
    GoogleDocsApi: googleDocsApi,
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

Firestore.addToLogView('app version 1.366', 'Info');

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

window.TradingApp.TOS.initialize().then(async () => {
    // tos initialized with new access token
    // tos access token expires in 30 minutes, so refresh before that
    // tradestation token expires in 20 minutes
    setInterval(Broker.refreshAccessToken, 1150 * 1000);
    // create watchlist and setup chart
    Chart.setup();
    let timeframe = 1;

    Models.setTimeframe(timeframe);
    TraderFocus.updateTradeManagementUI();

    // open web socket
    // Alpaca trading activity stream is disabled; Schwab is the active broker.
    // AlpacaStreaming.createWebSocket();
    if (GlobalSettings.useMarketDataWorker) {
        // The worker owns the Alpaca market-data socket (trades + quotes), the Massive
        // trades socket, and the Schwab streamer socket (account activity + level-one
        // quotes); their parsing runs off the main thread.
        MarketDataWorkerBridge.startMarketDataWorker();
        MarketDataWorkerBridge.registerMarketDataWorkerLifecycle();
    } else {
        AlpacaStreaming.createWebSocketForMarketData();
        ScwabStreaming.createWebSocket();
        MassiveStreaming.createWebSocket();
    }
    if (GlobalSettings.enableBookmapSocket) {
        BookmapSocket.createWebSocket();
    }
    let today = new Date();
    let todayString = TimeHelper.formatDateToYYYYMMDD(today);


    // get price history
    let watchlist = Models.getWatchlist();
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

            // check implied market cap threshold
            await sharesOutstandingPromise;
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
            if (premarketSharesInMillions < GlobalSettings.premarketVolumeThresholdInMillions) {
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
        });
    }
    UI.setupAutoSync();
    AutoTrader.scheduleEvents();
    // MarketData.testTradeStationStreamBar();
});

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

if (!GlobalSettings.enableLeftPaneFeatures) {
    let leftPane = document.getElementById('traderFocus');
    if (leftPane) {
        leftPane.style.display = 'none';
    }
}
