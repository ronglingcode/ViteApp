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

let showTargetsButton = document.getElementById("show_targets");
if (showTargetsButton) {
  showTargetsButton.addEventListener("click", () => {
    let positions = Models.getOpenPositions();
    positions.forEach(position => {
      let isLong = position.netQuantity > 0;
      let tp = TradingPlans.getTradingPlans(position.symbol);
      let msg = `${position.symbol}: `;
      let pt = isLong ? tp.analysis.profitTargetsForLong : tp.analysis.profitTargetsForShort;
      msg += `${pt.targets}, will blow past levels: ${pt.willBlowPastThoseLevels}. ${pt.summary}`;
      Firestore.logInfo(msg);
    });
  });
}
let testPopButton = document.getElementById("test_popup");
if (testPopButton) {
  testPopButton.addEventListener("click", () => {
    QuestionPopup.show('APLD');
  });
}

Firestore.addToLogView('version 1.34', 'Info');

