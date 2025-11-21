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
    let socketUrl = "wss://delayed.massive.com/stocks";
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
export const handleTimeAndSalesData = (data: any) => {
    let record: Models.TimeSale = {
        symbol: data.sym,
        tradeTime: data.t,
        lastPrice: data.p,
        lastSize: data.s,
        seq: data.q,
        receivedTime: new Date(),
    }
    console.log(data);
    console.log(record);
}