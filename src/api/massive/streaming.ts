import * as Secret from '../../config/secret';
import * as Models from '../../models/models';
import { createMassiveTimeSale } from '../../streaming/timeSaleParse';
import * as DB from '../../data/db';
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
        "params": Secret.massive().apiKey
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
    //console.log(data);
    let { record, shouldFilter } = createMassiveTimeSale(data);
    let updated = DB.tryUpdateMaxTimeSaleTimestamp(record, 'm');
    if (shouldFilter || !updated) {
        return;
    }

    DB.updateFromTimeSale(record);
}
