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
import * as UI from '../../ui/ui';
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
        conditions: [],
    };
    if (c.t != null) {
        record.tradeTime = c.t;
    }
    if (c.p != null)
        record.lastPrice = c.p;
    if (c.s != null)
        record.lastSize = c.s;
    if (c.q != null)
        record.seq = c.q;
    if (c.i != null)
        record.tradeID = Number(c.i);
    record.rawTimestamp = '';
    if (c.t != null)
        record.rawTimestamp += `${c.t}`;
    // Convert c.t (assumed to be epoch milliseconds) to a time-only string like 'HH:MM:SS.mmm'
    if (c.t != null) {
        let nanoTime = new Date(c.t);
        let timeStr = nanoTime.getHours() + ':' + nanoTime.getMinutes() + ':' + nanoTime.getSeconds() + '.' + nanoTime.getMilliseconds();
        record.rawTimestamp = `${timeStr} ${c.t}`;
        record.timestamp = c.t;
    }
    if (c.c != null) {
        for (let i = 0; i < c.c.length; i++) {
            let condition = c.c[i];
            record.conditions.push(`${condition}`);
        }
    }
    let shouldFilter = has_non_update;
    return {record, shouldFilter};
}
export const handleTimeAndSalesData = (data: any) => {
    //console.log(data);
    let {record, shouldFilter} = createTimeSale(data);
    Chart.addToTimeAndSales(record.symbol, 'massiveFeed', shouldFilter, record);
    let symbolData = Models.getSymbolData(record.symbol);
    if (record.timestamp && record.timestamp > symbolData.maxTimeSaleTimestamp) {
        symbolData.maxTimeSaleTimestamp = record.timestamp;
        console.log(`massive win`);
        UI.addToNetwork('m');
    } else {
        console.log(`massive lose`);
    }
    if (GlobalSettings.marketDataSource == "massive") {
        if (!shouldFilter) {
            DB.updateFromTimeSale(record);
        }
    }
}