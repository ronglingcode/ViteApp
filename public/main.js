import * as Helper from "../src/utils/helper";
import * as Firestore from '../src/firestore';
import * as Broker from '../src/api/broker';
import * as MarketData from '../src/api/marketData';
import * as StreamingHandler from '../src/controllers/streamingHandler';
import * as KeyboardHandler from '../src/controllers/keyboardHandler';
import * as AlpacaStreaming from '../src/api/alpaca/streaming';
import * as ScwabStreaming from '../src/api/schwab/streaming';
import * as Chart from '../src/ui/chart';
import * as UI from '../src/ui/ui';
import * as AutoTrader from '../src/algorithms/autoTrader';
import * as DB from '../src/data/db';
import * as Models from '../src/models/models';
let now = new Date();
console.log('main.js loaded');

window.TradingApp.TOS.initialize().then(async () => {
    // tos initialized with new access token
    // tos access token expires in 30 minutes, so refresh before that
    // tradestation token expires in 20 minutes
    setInterval(Broker.refreshAccessToken, 1150 * 1000);
    // create watchlist and setup chart
    Chart.setup();
    let timeframe = 1;

    Models.setTimeframe(timeframe);

    // open web socket
    AlpacaStreaming.createWebSocketForMarketData();
    AlpacaStreaming.createWebSocket();
    ScwabStreaming.createWebSocket();
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
            MarketData.setPreviousDayPremarketVolume(symbol, previousDate);
        });
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
