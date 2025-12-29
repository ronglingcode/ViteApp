/**
 * This file is just a silly example to show everything working in the browser.
 * When you're ready to start on your site, clear the file. Happy hacking!
 **/
import * as WebRequest from './utils/webRequest';
import * as Helper from './utils/helper';
import * as TimeHelper from './utils/timeHelper';
import * as Printer from './utils/printer';
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
import * as Popup from './ui/popup';
import * as QuestionPopup from './ui/questionPopup';
import * as Flowchart from './ui/flowchart';
import * as Config from './config/config';
import * as TakeProfit from './algorithms/takeProfit';
import * as RiskManager from './algorithms/riskManager';
import * as Patterns from './algorithms/patterns';
import * as Watchlist from './algorithms/watchlist';
import * as AutoTrader from './algorithms/autoTrader';
import * as Models from './models/models';
import * as TradingState from './models/tradingState';
import * as TradingPlans from './models/tradingPlans/tradingPlans';
import * as TvTools from './tools/tradingview';
import * as TraderFocus from './controllers/traderFocus';
import * as StreamingHandler from './controllers/streamingHandler';
import * as KeyboardHandler from './controllers/keyboardHandler';
import * as AlpacaStreaming from './api/alpaca/streaming';
import * as ScwabStreaming from './api/schwab/streaming';
import * as MassiveStreaming from './api/massive/streaming';
import * as MassiveApi from './api/massive/api';
import * as DB from './data/db';
import * as Agent from './ai/agent';
import * as VwapPatterns from './algorithms/vwapPatterns';
import './tosClient';

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
    Flowchart: Flowchart,
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
let preparationButton = document.getElementById("prepare");
if (preparationButton) {
    preparationButton.addEventListener("click", () => {
        let root = document.getElementById("print_plan");
        if (!root) {
            return;
        }
        let wl = Models.getWatchlist();
        wl.forEach(watchlistItem => {
            let symbol = watchlistItem.symbol;
            let plan = TradingPlans.getTradingPlans(symbol);
            if (root) {
                Printer.printStockPlan(root, plan);
            }
        });
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
        Chart.updateAccountUIStatus([], 'sync button');
        TraderFocus.updateUI();
    });
}

let tosScriptsButton = document.getElementById("gen_scripts");
if (tosScriptsButton) {
    tosScriptsButton.addEventListener("click", () => {
        TradingPlans.generateScriptsForTradableAreas();
        //TradingPlans.generateTosScripts();
    });
}

let testPopButton = document.getElementById("test_popup");
if (testPopButton) {
    testPopButton.addEventListener("click", () => {
        VwapPatterns.test();
    });
}

Firestore.addToLogView('version 1.34', 'Info');

let now = new Date();

export const cleanUpChatWindows = () => {
    let watchlist = Models.getWatchlist();
    for (let i = 0; i < watchlist.length; i++) {
        let symbol = watchlist[i].symbol;
        let chatWindowContainer = document.getElementById(`chatContainer${i}`) as HTMLElement;
        let chatHeaderText = document.getElementById(`chatHeaderText${i}`) as HTMLElement;
        if (chatWindowContainer && chatHeaderText) {
            chatHeaderText.textContent = symbol;
            chatWindowContainer.style.display = 'block';
        }
    }
};

window.TradingApp.TOS.initialize().then(async () => {
    // tos initialized with new access token
    // tos access token expires in 30 minutes, so refresh before that
    // tradestation token expires in 20 minutes
    setInterval(Broker.refreshAccessToken, 1150 * 1000);
    // create watchlist and setup chart
    Chart.setup();
    Flowchart.setup();
    let timeframe = 1;

    Models.setTimeframe(timeframe);
    cleanUpChatWindows();

    // open web socket
    AlpacaStreaming.createWebSocketForMarketData();
    AlpacaStreaming.createWebSocket();
    ScwabStreaming.createWebSocket();
    MassiveStreaming.createWebSocket();
    let previousDate = await MarketData.getPreviousTradingDate();


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
        MarketData.getPriceHistory(symbol, Helper.isFutures(symbol), timeframe).then((candles) => {
            // populate current chart
            DB.initialize(symbol, candles);
            Chart.updateAccountUIStatusForSymbol(symbol);
            if (now > Helper.getMarketOpenTime()) {
                AutoTrader.onMarketOpen(symbol);
            }
        });
        MarketData.setPreviousDayPremarketVolume(symbol, previousDate);
    }
    UI.setupAutoSync();
    AutoTrader.scheduleEvents();
    // MarketData.testTradeStationStreamBar();
});

let htmlBody = document.getElementsByTagName("body")[0];
htmlBody.addEventListener("keydown", async function (keyboardEvent) {
    let code = keyboardEvent.code;
    let shiftKey = keyboardEvent.shiftKey;
    KeyboardHandler.handleKeyPressed(code, shiftKey);
});

// Setup chat window expand/collapse functionality
document.addEventListener('DOMContentLoaded', () => {
    const chatHeaders = document.querySelectorAll('.chatHeader');
    chatHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const chatId = header.getAttribute('data-chat');
            if (chatId) {
                const container = header.closest('.chatContainer');
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

    // Setup section expand/collapse functionality for A+ Setups and Trade Management
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
