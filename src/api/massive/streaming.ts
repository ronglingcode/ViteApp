import * as Secret from '../../config/secret';
import * as Models from '../../models/models';
import * as StreamingHandler from '../../controllers/streamingHandler';
import * as Helper from '../../utils/helper';
import * as Chart from '../../ui/chart';
import * as DB from '../../data/db';
import * as OrderFlowManager from '../../controllers/orderFlowManager';
import * as LevelOneQuote from '../../models/levelOneQuote';
import * as Firestore from '../../firestore';
import * as GlobalSettings from '../../config/globalSettings';
import * as TimeHelper from '../../utils/timeHelper';
declare let window: Models.MyWindow;



export const createWebSocket = async () => {
    let socketUrl = "wss://socket.massive.com/stocks";
    let websocket = new WebSocket(socketUrl);

    websocket.onmessage = function (messageEvent) {
        let messageData = JSON.parse(messageEvent.data);
        messageData.forEach((message: any) => {
            if (message.ev == 'status') {
                if (message.status == 'connected') {
                    console.log('connected to massive');
                } else if (message.status == 'auth_success') {
                    console.log('auth success');
                    subscribeLevelOneQuotes(websocket);
                } else {
                    console.log(message);
                }
            } else if (message.ev == 'T') {
                handleTimeAndSalesData(message);
            }
            else {
                console.log(message);
            }
        });
    };
    websocket.onopen = function () {
        sendLoginRequest(websocket);
    }
}



const sendWebsocketRequest = (socket: WebSocket, request: any) => {
    socket.send(JSON.stringify(request));
}
export const sendLoginRequest = (webSocket: WebSocket) => {
    let request = createLoginRequest();
    sendWebsocketRequest(webSocket, request);
}

export const createLoginRequest = () => {
    return {
        "action": "auth",
        "params": "_wR6hX8YIGKWyyTVsmrT0puXVGymRZlW"
    }
}
export const subscribeLevelOneQuotes = (webSocket: WebSocket) => {
    let symbols = "";;
    let watchlist = Models.getWatchlist();
    for (let i = 0; i < watchlist.length; i++) {
        let s = watchlist[i].symbol;
        if (i != 0) {
            symbols += ",";
        }
        symbols += `T.${s}`;
    }
    let request = {
        "action": "subscribe",
        "params": symbols
    }
    console.log(request);
    sendWebsocketRequest(webSocket, request);
}

const createTimeSale = (c: any) => {
    let has_non_update = false;
    let tradeTime = Helper.numberToDate(c.t);
    let secondsSinceMarketOpen = Helper.getSecondsSinceMarketOpen(tradeTime);
    if (secondsSinceMarketOpen >= 0) {
        if (c.c) {
            for (let i = 0; i < c["c"].length; i++) {
                let condition = c["c"][i];
                if (StreamingHandler.conditionsNotUpdateLastPriceNumbers.includes(condition)) {
                    has_non_update = true;
                    break;
                }
            }
        } else {
            console.log(c);
        }
    }

    let symbol = c.sym;
    let record: Models.TimeSale = {
        symbol: symbol,
        receivedTime: new Date(),
    };
    if (c.t != null) {
        record.tradeTime = c.t;
    }
    if (c.p != null)
        record.lastPrice = c.p;
    if (c.s != null)
        record.lastSize = c.s;
    //console.log(`${c["p"]}, ${c["s"] / 100}`);
    let shouldFilter = has_non_update;
    return {record, shouldFilter};
}
export const handleTimeAndSalesData = (data: any) => {
    let {record, shouldFilter} = createTimeSale(data);
    Chart.addToTimeAndSales(record.symbol, 'massiveFeed', false, record);
    if (!shouldFilter) {
        Chart.addToTimeAndSales(record.symbol, 'massiveFeed', true, record);
    }
    if (GlobalSettings.marketDataSource == "massive") {
        if (!shouldFilter) {
            DB.updateFromTimeSale(record);
        }
    }
}