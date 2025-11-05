import * as webRequest from '../../utils/webRequest'
import * as secret from '../../config/secret'
import * as config from '../../config/config'
import * as Models from '../../models/models'
import * as orderFactory from './orderFactory'
import * as Firestore from '../../firestore';
declare let window: Models.MyWindow;

export const getAuthUrl = () => {
    let authUrl = 'https://signin.tradestation.com/oauth/token';
    let localauthUrl = 'http://localhost:5000/tradeStationApi/oauth/token';
    let current = window.location.hostname;
    if (current == 'localhost') {
        return authUrl;
    } else {
        return localauthUrl;
    }
}
let ordersUrl = 'https://api.tradestation.com/v3/orderexecution/orders';
export const getQuote = async (symbol: string) => {
    let url = `https://api.tradestation.com/v3/marketdata/quotes/${symbol}`;
    let response = await webRequest.asyncGet(url, getAccessTokenFromStorage());
    let json = await response.json();
    let q: Models.Quote = {
        symbol: symbol,
        bidPrice: 0,
        askPrice: 0,
    };

    if (!response.ok || !json.Quotes || json.Quotes.length < 1)
        return q;
    json.Quotes.forEach((quote: any) => {
        if (quote.Symbol == symbol) {
            q.askPrice = +quote.Ask;
            q.bidPrice = +quote.Bid;
        }
    });
    return q;
};
export const testOrder = () => {
    console.log('test order');
    let order = {
        "AccountID": secret.tradeStation().AccountIDs.Equity,
        "Symbol": "NVAX",
        "Quantity": "1",
        "OrderType": "Market",
        "TradeAction": "BUY",
        "TimeInForce": {
            "Duration": "DAY"
        },
        "Route": "Intelligent"
    };
    placeOrderBase(order, {});
};

export const test1 = async () => {
    console.log('test order');
    // order id: "925175075"
    let order = {
        "AccountID": secret.tradeStation().AccountIDs.Equity,
        "Symbol": "NVAX", //"MESH23",
        "Quantity": "1",
        "OrderType": "StopMarket",
        "TradeAction": orderFactory.buildTradeAction(true, true, true),
        "TimeInForce": {
            "Duration": "GTC"
        },
        "StopPrice": "21",
        "Route": "Intelligent"
    };
    placeOrderBase(order, {});
};

export const getAccount = async () => {
    const accountId = getAccountId();
    let positions = await getPositions(accountId);
    let orders = await getOrders();
    let orderResponse = orderFactory.buildOrderResponse(orders);

    let result: Models.BrokerAccount = {
        trades: new Map<string, Models.TradeExecution[]>(),
        tradesCount: 0,
        nonBreakevenTradesCount: 0,
        realizedPnL: 0,
        orderExecutions: orderFactory.extractOrderExecutions(orders),
        entryOrders: orderResponse.entryOrders,
        exitPairs: orderResponse.exitPairs,
        positions: positions,
        currentBalance: 0,
    };

    window.HybridApp.AccountCache = result;
    return true;
};
/* #region Positions */
const getPositions = async (accountId: string) => {
    let url = `https://api.tradestation.com/v3/brokerage/accounts/${accountId}/positions`;
    let response = await webRequest.asyncGet(url, getAccessTokenFromStorage());
    let json = await response.json();
    let positions = new Map<string, Models.Position>();

    if (response.ok) {
        json.Positions.forEach((p: any) => {
            let quantity = +p.Quantity;
            let newPosition: Models.Position = {
                symbol: p.Symbol,
                averagePrice: +p.AveragePrice,
                netQuantity: quantity,
            };
            positions.set(p.Symbol, newPosition);
        });
    } else {
        Firestore.logError(JSON.stringify(json));
    }
    return positions;
};
/* #endregion */

const placeOrderBase = async (order: any, logTags: Models.LogTags) => {
    Firestore.logOrder(order, logTags);
    let accessToken = window.HybridApp.Secrets.tradeStation.accessToken;
    let response = await webRequest.sendJsonPostRequestWithAccessToken(ordersUrl, order, accessToken);
    let json = await response.json();
    if (response.ok) {
        console.log(json);
        return json;
    } else {
        console.log(json);
    }
};

export const refreshAccessToken = async () => {
    let tradeStationSecrets = secret.tradeStation();
    const data = {
        grant_type: "refresh_token",
        client_id: tradeStationSecrets.key,
        client_secret: tradeStationSecrets.secret,
        refresh_token: tradeStationSecrets.refresh_token,
    };

    let response = await webRequest.postForm2(getAuthUrl(), data);
    console.log(response);
    let json = await response.json();
    console.log(json);
    return json.access_token as string;
};

const getAccessTokenFromStorage = () => {
    return window.HybridApp.Secrets.tradeStation.accessToken;
};

export const renewRefreshToken = async () => {
    let tradeStationSecrets = secret.tradeStation();
    const data = {
        grant_type: "authorization_code",
        client_id: tradeStationSecrets.key,
        client_secret: tradeStationSecrets.secret,
        code: tradeStationSecrets.code,
        redirect_uri: "http://localhost",
    };

    return webRequest.postForm(getAuthUrl(), data)
        .then(response => response.json())  // convert to json
        .then(json => console.log(json))
        .catch(err => console.log('Request Failed', err)); // Catch errors
};

// Open the url in browser, it will redirect back with a code in the url query parameter
export const buildUrlForGetRefreshToken = () => {
    const clientID = secret.tradeStation().key;
    const redirect_uri = "http://localhost";
    const scope = "openid profile offline_access MarketData ReadAccount Trade Crypto";
    const url = `https://signin.tradestation.com/authorize?response_type=code&client_id=${clientID}&redirect_uri=${redirect_uri}&audience=https://api.tradestation.com&state=STATE&scope=${scope}`;
    return url;
};

export const getOrders = async () => {
    let result = [] as any[];
    const url = `https://api.tradestation.com/v3/brokerage/accounts/${getAccountId()}/orders`;
    let response = await webRequest.asyncGet(url, getAccessTokenFromStorage());
    let json = await response.json();
    // TODO: use json.NextToken for pagination
    if (response.ok) {
        json.Orders.forEach((o: any) => {
            result.push(o);
        });
    } else {
        Firestore.logError(JSON.stringify(json));
    }
    return result;
};
const getAccountId = () => {
    return config.getAccountID();
}
/* #region Submit Order */
export const entryWithBracket = async (
    symbol: string, quantity: number,
    isLong: boolean, isEquity: boolean, orderType: Models.OrderType,
    entryPrice: number, limitPrice: number, stopPrice: number, logTags: Models.LogTags) => {
    const accountID = getAccountId();
    let tsOrderType = "";
    if (orderType == Models.OrderType.LIMIT) {
        tsOrderType = "Limit";
    } else if (orderType == Models.OrderType.MARKET) {
        tsOrderType = "Market";
    } else if (orderType == Models.OrderType.STOP) {
        tsOrderType = "StopMarket";
    }
    let order = orderFactory.buildEntryOrderWithBracket(
        accountID, symbol, tsOrderType, quantity, entryPrice,
        isLong, isEquity, limitPrice, stopPrice);
    console.log(order);
    placeOrderBase(order, logTags);
};

export const submitSingleOrder = async (
    symbol: string, isEquity: boolean, orderType: Models.OrderType,
    quantity: number, price: number, isBuy: boolean, positionEffectIsOpen: boolean, logTags: Models.LogTags) => {
    const accountID = getAccountId();
    let orderTypeString = "Market";
    if (orderType == Models.OrderType.LIMIT) {
        orderTypeString = "Limit";
    } else if (orderType == Models.OrderType.STOP) {
        orderTypeString = "StopMarket";
    }
    let order = orderFactory.buildSingleOrder(
        accountID, symbol, quantity, orderTypeString, price, isBuy, isEquity, positionEffectIsOpen);
    placeOrderBase(order, logTags);
};
/* #endregion */

export const replaceSingleOrderWithNewPrice = async (oldOrder: Models.OrderModel, newPrice: number, logTags: Models.LogTags) => {
    let orderType = "Market";
    let payload: any = {
        "Quantity": `${oldOrder.quantity}`,
        "OrderType": orderType,
    };
    if (oldOrder.orderType == Models.OrderType.LIMIT) {
        payload.OrderType = "Limit";
        payload.LimitPrice = `${newPrice}`;
    }
    else if (oldOrder.orderType == Models.OrderType.STOP) {
        payload.OrderType = "StopMarket";
        payload.StopPrice = `${newPrice}`;
    }

    let oldOrderID = oldOrder.orderID;
    return replaceOrderBase(payload, oldOrderID, logTags);
};

export const replaceWithMarketOrder = async (oldOrder: Models.OrderModel, logTags: Models.LogTags) => {
    let oldOrderID = oldOrder.orderID;
    let payload = {
        "Quantity": `${oldOrder.quantity}`,
        "OrderType": "Market",
    };
    return replaceOrderBase(payload, oldOrderID, logTags);
};

const replaceOrderBase = async (payload: any, oldOrderID: string, logTags: Models.LogTags) => {
    let url = `https://api.tradestation.com/v3/orderexecution/orders/${oldOrderID}`;
    Firestore.logOrder(payload, logTags);
    let accessToken = getAccessTokenFromStorage();
    return webRequest.sendJsonPutRequestWithAccessToken(url, payload, accessToken)//.then(response => console.log(response))
        .catch(err => {
            Firestore.logError('Order request Failed ' + err, logTags);
            console.log(err);
        }); // Catch errors;
};
export const cancelOrderById = async (orderId: string) => {
    let url = `https://api.tradestation.com/v3/orderexecution/orders/${orderId}`;
    let accessToken = getAccessTokenFromStorage();
    webRequest.asyncDelete(url, accessToken);
};
export const cancelOrders = async (orderIds: string[]) => {
    orderIds.forEach(orderId => {
        cancelOrderById(orderId);
    });
};
/* #region Market Data */
export const getPriceHistory = async (symbol: string) => {
    let url = `https://api.tradestation.com/v3/marketdata/barcharts/${symbol}?barsback=1440&unit=Minute`;
    url += `&sessiontemplate=USEQPreAndPost`;

    let accessToken = getAccessTokenFromStorage();
    return webRequest.asyncGet(url, accessToken).then(response => response.json())  // convert to json
        .then(json => {
            return json;
        })
        .catch(err => console.log('Request Failed', err));

};
/* #endregion */