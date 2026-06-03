import * as Models from '../../models/models';
import * as Helper from '../../utils/helper';
import * as Chart from '../../ui/chart';
import * as DB from '../../data/db';
import * as LevelOneQuote from '../../models/levelOneQuote';
import * as Firestore from '../../firestore';
declare let window: Models.MyWindow;



export const createWebSocket = async () => {
    let socketUrl = window.HybridApp.Secrets.schwab.streamerSocketUrl;
    let websocket = new WebSocket(socketUrl);

    websocket.onmessage = function (messageEvent) {
        let messageData = JSON.parse(messageEvent.data);
        if (!messageData) {
            console.log('invalid schwab streaming message');
            console.log(messageData);
            return;
        }
        if (messageData.notify) {
            // heart beat message
            return;
        }
        if (messageData.response) {
            messageData.response.forEach((res: any) => {
                let service = res.service;
                let command = res.command;
                if (service === "ADMIN") {
                    if (command === "LOGIN") {
                        if (DB.levelOneQuoteSource == DB.levelOneQuoteSourceSchwab) {
                            subscribeLevelOneQuotes(websocket);
                        }
                        subscribeActivity(websocket);
                    }
                }
                else if (service === "LEVELONE_EQUITIES") {
                }
            });
            return;
        }
        if (messageData.data) {
            messageData.data.forEach((element: any) => {
                let service = element.service;
                let command = element.command;
                if (service === "LEVELONE_EQUITIES") {
                    if (command == "SUBS") {
                        let contents = element.content;
                        let timestamp = element.timestamp;
                        let receivedTime = new Date(timestamp);
                        contents.forEach((c: any) => {
                            handleQuoteUpdates(c, receivedTime);
                        });
                    } else {
                        console.log('unknown command');
                        console.log(element);
                    }
                } else if (service === "ACCT_ACTIVITY") {
                    if (command == "SUBS") {
                        handleAccountActivity(element.content);
                    }
                } else {
                    console.log('unknown service');
                    console.log(element);
                }
            });
        }
    };
    websocket.onopen = function () {
        sendLoginRequest(websocket);
    }
}

export const handleQuoteUpdates = (data: any, receivedTime: Date) => {
    //console.log(TimeHelper.getPreciseTimeString(receivedTime));
    let quote = createLevelOneQuote(data);
    applyLevelOneQuote(quote);
}

/** Apply an already-parsed schwab level-one quote (used by the main socket and the market data worker). */
export const applyLevelOneQuote = (quote: Models.Quote) => {
    if (DB.levelOneQuoteSource == DB.levelOneQuoteSourceSchwab) {
        DB.updateFromLevelOneQuote(quote);
    }
    let symbolData = Models.getSymbolData(quote.symbol);
    let quoteData = symbolData.schwabLevelOneQuote;
    LevelOneQuote.updateQuoteIfNotEmpty(quoteData, quote);
}

/** Parse + apply a batch of raw schwab account-activity contents (used by the main socket and the worker). */
export const handleAccountActivity = (contents: any[]) => {
    let act: Models.SchwabAccountActivity[] = [];
    (contents ?? []).forEach((c: any) => {
        act.push(createAccountAcitivity(c));
    });
    showActivitySummary(act);
    Chart.updateAccountUIStatus('account activity');
}

const sendWebsocketRequest = (socket: WebSocket, request: any) => {
    socket.send(JSON.stringify(request));
}
export const sendLoginRequest = (webSocket: WebSocket) => {
    let request = createLoginRequest();
    sendWebsocketRequest(webSocket, request);
}

export const createLoginRequest = () => {
    let streamerInfo = window.HybridApp.Secrets.schwab;
    return {
        "requestid": "1",
        "service": "ADMIN",
        "command": "LOGIN",
        "SchwabClientCustomerId": streamerInfo.schwabClientCustomerId,
        "SchwabClientCorrelId": streamerInfo.schwabClientCorrelId,
        "parameters": {
            "Authorization": window.HybridApp.Secrets.schwab.accessToken,
            "SchwabClientChannel": streamerInfo.schwabClientChannel,
            "SchwabClientFunctionId": streamerInfo.schwabClientFunctionId
        }
    }
}
/** URL of the schwab streamer socket (empty string when streamer info is not yet available). */
export const getStreamerSocketUrl = (): string => {
    return window.HybridApp.Secrets?.schwab?.streamerSocketUrl ?? '';
}

export const createActivitySubscribeRequest = () => {
    let streamerInfo = window.HybridApp.Secrets.schwab;
    return {
        "service": "ACCT_ACTIVITY",
        "requestid": "3",
        "command": "SUBS",
        "SchwabClientCustomerId": streamerInfo.schwabClientCustomerId,
        "SchwabClientCorrelId": streamerInfo.schwabClientCorrelId,
        "parameters": {
            "keys": "Account Activity",
            "fields": "0,1,2,3"
        }
    }
}

export const createLevelOneSubscribeRequest = () => {
    let streamerInfo = window.HybridApp.Secrets.schwab;
    return {
        "service": "LEVELONE_EQUITIES",
        "requestid": "2",
        "command": "SUBS",
        "SchwabClientCustomerId": streamerInfo.schwabClientCustomerId,
        "SchwabClientCorrelId": streamerInfo.schwabClientCorrelId,
        "parameters": {
            "keys": Models.getWatchlistSymbolsInString(),
            "fields": "0,1,2,4,5"
        }
    }
}

export const subscribeActivity = (webSocket: WebSocket) => {
    sendWebsocketRequest(webSocket, createActivitySubscribeRequest());
}
export const subscribeLevelOneQuotes = (webSocket: WebSocket) => {
    sendWebsocketRequest(webSocket, createLevelOneSubscribeRequest());
}

export const createLevelOneQuote = (c: any) => {
    //console.log(c);
    let record: Models.Quote = {
        symbol: c["key"]
    };
    /**
     * 1	Bid Price	double	Current Bid Price	 
2	Ask Price	double	Current Ask Price	 
3	Last Price	double	Price at which the last trade was matched	 
4	Bid Size	int	Number of shares for bid	Units are "lots" (typically 100 shares per lot)Note for NFL data this field can be 0 with a non-zero bid price which representing a bid size of less than 100 shares.
5	Ask Size	int	Number of shares for ask
     */
    if (c["1"] != null)
        record.bidPrice = c["1"];
    if (c["2"] != null)
        record.askPrice = c["2"];
    if (c["4"] != null)
        record.bidSize = c["4"];
    if (c["5"] != null)
        record.askSize = c["5"];


    return record;
};

const createAccountAcitivity = (data: any) => {
    let activity: Models.SchwabAccountActivity = {
        key: data.key,
        account: data["1"],
        // ChangeCreated, CancelAccepted, ChangeAccepted,
        // ExecutionRequested, OrderMonitorCreated,
        // ExecutionCreated, ExecutionRequestCreated,
        // ExecutionRequestCompleted, OrderUROutCompleted
        messageType: data["2"],
        messageData: data["3"]
    }
    return activity;
}

const showActivitySummary = (activities: Models.SchwabAccountActivity[]) => {
    let summary: any = {};
    activities.forEach(a => {
        if (!summary[a.messageType]) {
            summary[a.messageType] = 0;
        }
        summary[a.messageType]++;
    });
    console.log(summary);
    let message = "";
    for (let key in summary) {
        message += `${key}:${summary[key]},`;
    }
    //Firestore.logInfo(message);
    Firestore.logInfo("account activity received");
    if ("OrderAccepted" in summary) {
        //Helper.speak("order accepted");
        Helper.playNotificationSound();
    }
}
