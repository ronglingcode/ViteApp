import * as Secret from '../../config/secret';
import * as Models from '../../models/models';
import { createMassiveTimeSale } from '../../streaming/timeSaleParse';
import * as DB from '../../data/db';
import { integrationHealth as health } from '../../health/integrationHealth.ts';
import { massiveStreamStatus } from '../../health/massiveStreamStatus.ts';
declare let window: Models.MyWindow;



export const createWebSocket = async () => {
    health.startStream(Models.getWatchlist().map(item => item.symbol));
    let socketUrl = "wss://socket.massive.com/stocks";
    let websocket: WebSocket;
    try { websocket = new WebSocket(socketUrl); }
    catch (error) { health.streamPhase('failed', 'Massive socket could not start'); throw error; }

    websocket.onmessage = function (messageEvent) {
        let messageData;
        try { messageData = JSON.parse(messageEvent.data); }
        catch { health.streamPhase('failed', 'Massive stream returned invalid JSON'); return; }
        if (!Array.isArray(messageData)) return;
        messageData.forEach((message: any) => {
            if (!message || typeof message !== 'object') return;
            if (message.ev == 'status') {
                const status = massiveStreamStatus(message);
                if (status) health.streamPhase(status.phase, status.error);
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
        health.streamPhase('authenticating');
        sendLoginRequest(websocket);
    }
    websocket.onerror = () => health.streamPhase('failed', 'Massive socket error');
    websocket.onclose = () => {
        if (health.stream.phase !== 'failed') health.streamPhase('disconnected');
    };
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
    health.receiveTrades([{ symbol: record.symbol, timestamp: record.tradeTime ?? record.timestamp, receivedAt: record.receivedTime.getTime() }]);
    let updated = DB.tryUpdateMaxTimeSaleTimestamp(record, 'm');
    if (shouldFilter || !updated) {
        return;
    }

    DB.updateFromTimeSale(record);
}
