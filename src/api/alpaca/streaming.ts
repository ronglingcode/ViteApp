import * as Secret from '../../config/secret';
import * as Models from '../../models/models';
import * as StreamingHandler from '../../controllers/streamingHandler';
import * as Helper from '../../utils/helper';
import * as Chart from '../../ui/chart';
import * as DB from '../../data/db';
import * as LevelOneQuote from '../../models/levelOneQuote';
import * as OrderFlowManager from '../../controllers/orderFlowManager';
import * as GlobalSettings from '../../config/globalSettings';

export const showStreamingData = (dataType: any) => {
    let network = document.getElementById("network");
    if (!network) {
        return;
    }
    let currentText = network.textContent;
    if (dataType == "success") {
        currentText += `suc_`;
    } else if (dataType == 't') {
        currentText += `t`;
    } else if (dataType == 'q') {
        currentText += `q`;
    } else if (dataType == "subscription") {
        currentText += `sub_`;
    } else {
        currentText += `u`;
    }

    if (currentText.length > 35) {
        currentText = currentText.slice(1);
    }
    network.innerHTML = currentText;
}

export const createWebSocketForMarketData = async () => {
    let socketUrl = "wss://stream.data.alpaca.markets/v2/sip";
    let websocket = new WebSocket(socketUrl);
    websocket.onmessage = function (messageEvent) {
        //console.log(messageEvent);
        let messageData = JSON.parse(messageEvent.data);
        //console.log(messageData);
        messageData.forEach((element: any) => {
            let type = element.T;
            showStreamingData(type);
            let msg = element.msg;
            if (type == "success") {
                if (msg == "connected") {
                    sendAuthRequest(websocket);
                } else if (msg == "authenticated") {
                    subscribeTradesAndQuotesRequests(websocket);
                }
            } else if (type == 't') {
                // handle trades streaming data
                if (GlobalSettings.marketDataSource == "alpaca") {
                    StreamingHandler.handleTimeAndSalesData(element);
                }
            } else if (type == 'q') {
                handleQuoteUpdates(element);
            } else if (type == "subscription") {
                // no op
            }else {
                console.log(`unknown message type ${type}`);
                console.log(element);
            }
        });
    };

    websocket.onopen = function () {
    }
    return websocket;
};

export const handleQuoteUpdates = (data: any) => {
    let quote = createLevelOneQuote(data);
    if (DB.levelOneQuoteSource == 'alpaca') {
        DB.updateFromLevelOneQuote(quote);
    }
    let symbolData = Models.getSymbolData(quote.symbol);
    let quoteData = symbolData.alpacaLevelOneQuote;
    LevelOneQuote.updateQuoteIfNotEmpty(quoteData, quote);
    if (GlobalSettings.advancedLevelOneQuoteFeaturesEnabled) {
        OrderFlowManager.updateAlpacaQuote(quote.symbol, quoteData);
        let levelOneQuote = OrderFlowManager.getAlpacaLevelOneQuote(quote.symbol);
        Chart.addToQuoteBar(quote.symbol, 'alpacaQuote', levelOneQuote);
    }
}
export const createWebSocket = async () => {
    let socketUrl = "wss://api.alpaca.markets/stream";
    let websocket = new WebSocket(socketUrl);

    websocket.onmessage = function (messageEvent) {
        //console.log(messageEvent);
        let reader = new FileReader();
        reader.onloadend = function () {
            let result = reader.result;
            if (!result) {
                return;
            }
            //console.log(result);
            //console.log(typeof (result));
            let json = JSON.parse(result as string);
            //console.log(json);
            let data = json.data;
            if (json.stream == 'authorization') {
                if (data.status == 'authorized') {
                    subscribeActivity(websocket);
                }
            } else if (json.stream == 'trade_updates') {
                if (data && data.order && data.order.symbol) {
                    StreamingHandler.handleTradeUpdates(data.order.symbol, data);
                }
            } else if (json.stream == "listening") {
                // no op
            } else {
                console.log(`unknown events`);
                console.log(json);
            }

        }
        reader.readAsText(messageEvent.data);
    };
    websocket.onopen = function () {
        sendAuthRequest(websocket);
    }
}

const sendWebsocketRequest = (socket: WebSocket, request: any) => {
    socket.send(JSON.stringify(request));
}
export const sendAuthRequest = (webSocket: WebSocket) => {
    const alpacaSecrets = Secret.alpaca();
    let request = {
        "action": "auth",
        "key": alpacaSecrets.apiKey,
        "secret": alpacaSecrets.apiSecret,
    }
    sendWebsocketRequest(webSocket, request);
}

export const subscribe = (webSocket: WebSocket) => {
    subscribeTradesAndQuotesRequests(webSocket);
    subscribeActivity(webSocket);
}
export const subscribeActivity = (webSocket: WebSocket) => {
    let request = {
        "action": "listen",
        "data": {
            "streams": ["trade_updates"]
        }
    }
    sendWebsocketRequest(webSocket, request);
}
export const subscribeTradesAndQuotesRequests = (webSocket: WebSocket) => {
    let symbols: string[] = [];
    let watchlist = Models.getWatchlist();
    for (let i = 0; i < watchlist.length; i++) {
        let s = watchlist[i].symbol;
        symbols.push(s);
    }
    let request = {
        "action": "subscribe",
        "trades": symbols
    };
    sendWebsocketRequest(webSocket, request);
    let request2 = {
        "action": "subscribe",
        "quotes": symbols
    };
    sendWebsocketRequest(webSocket, request2);
}
export const non_update: string[] = ['I'];
export const createTimeSale = (c: any) => {
    let has_non_update = false;
    let tradeTime = Helper.numberToDate(c["t"]);
    let secondsSinceMarketOpen = Helper.getSecondsSinceMarketOpen(tradeTime);
    if (secondsSinceMarketOpen >= 0) {
        for (let i = 0; i < c["c"].length; i++) {
            let condition = c["c"][i];
            if (StreamingHandler.conditionsNotUpdateLastPrice.includes(condition)) {
                has_non_update = true;
                break;
            }
        }
    }
    if (has_non_update) {
        //console.log(c)
        return null;
    }

    let symbol = c["S"];
    let record: Models.TimeSale = {
        symbol: symbol,
        receivedTime: new Date(),
    };
    if (c["t"] != null) {
        record.tradeTime = c["t"];
    }
    if (c["p"] != null)
        record.lastPrice = c["p"];
    if (c["s"] != null)
        record.lastSize = c["s"];
    //console.log(`${c["p"]}, ${c["s"] / 100}`);
    return record;
}

export const createLevelOneQuote = (c: any) => {
    // console.log(c);
    let record: Models.Quote = {
        symbol: c["S"]
    };
    if (c["bp"] != null)
        record.bidPrice = c["bp"];
    if (c["ap"] != null)
        record.askPrice = c["ap"];
    if (c["bs"] != null)
        record.bidSize = c["bs"];
    if (c["as"] != null)
        record.askSize = c["as"];

    return record;
};