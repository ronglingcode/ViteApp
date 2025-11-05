/*
https://github.com/tylerebowers/Schwab-API-Python/blob/main/tests/api_demo.py
*/
import * as webRequest from '../../utils/webRequest';
import * as Helper from '../../utils/helper';
import * as TimeHelper from '../../utils/timeHelper';
import * as secret from '../../config/secret';
import * as Models from '../../models/models';
import * as Firestore from '../../firestore';
import * as Config from '../../config/config';
import * as OrderFactory from './orderFactory';
declare let window: Models.MyWindow;

const API_HOST = "https://api.schwabapi.com";
const TRADER_API_HOST = "https://api.schwabapi.com/trader/v1";
export const replacedOrderIds = new Set<string>();

export const test = () => {
    entryWithBracket(
        "MSFT", 1, true, Models.OrderType.STOP, 480, 500, 400, {}
    )
}
export const testReplaceOrder = () => {
    let entryOrders = window.HybridApp.AccountCache?.entryOrders.get('INTC');

    if (entryOrders) {
        let e = entryOrders[0];
        console.log('original order')
        console.log(e);
        replaceSingleOrderWithNewPrice(e, 11.97, {});
    }
}
export const getAuthApiHost = () => {
    let local = "http://localhost:5000/schwabApi";
    let host = window.location.hostname;
    if (host == 'localhost') {
        return API_HOST
    } else {
        return local;
    }
}
export const getTraderApiHost = () => {
    let host = window.location.hostname;
    let local = "http://localhost:5000/schwabApi";
    if (host == 'localhost') {
        return local;//TRADER_API_HOST;
    } else {
        return local;
    }
}
export const generateRefreshTokenUrl = () => {
    let appKey = secret.schwab().appKey;
    let url = `${API_HOST}/v1/oauth/authorize?redirect_uri=https%3A%2F%2F127.0.0.1&client_id=${appKey}`;
    return url;
};
const sampleReturnUrl = `https://127.0.0.1/?code=C0.b2F1dGgyLmJkYy5zY2h3YWIuY29t.r9lE95m3NVI2lYlQyL_hVIL_WcVf3MGTbqKgF_1xnQE%40&session=bfd1b647-ab28-4140-a451-69145237e0cc`;

export const extractCodeFromUrl = (url: string) => {
    let raw_code = url.split('code=')[1];
    raw_code = raw_code.split('%40&')[0];
    return raw_code + '@';
};
export const makeAuthHeader = () => {
    let appKey = secret.schwab().appKey;
    let appSecret = secret.schwab().secret;
    let headers = new Headers();
    headers.append('Content-Type', 'application/x-www-form-urlencoded');
    headers.append('Authorization', 'Basic ' + btoa(appKey + ":" + appSecret));
    return headers;
}
export const generateRefreshToken = async (url: string) => {
    let code = extractCodeFromUrl(url);
    let endpoint = `${API_HOST}/v1/oauth/token`;
    let data = {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: `https://127.0.0.1`,
    };

    fetch(endpoint, {
        method: 'POST',
        headers: makeAuthHeader(),
        body: new URLSearchParams(data)
    })
        .then(response => response.json())
        .then(data => {
            console.log(data);
            let toLog = {
                access_token: data['access_token'],
                id_token: data['id_token'],
                refresh_token: data['refresh_token']
            };
            let logString = `
            access_token: "${data['access_token']}",
            refresh_token: "${data['refresh_token']}",
            `
            console.log(JSON.stringify(toLog));
            console.log(logString);
        })
        .catch((error) => console.error('Error:', error));
};
export const refreshAccessToken = async () => {
    const AUTH_URL = `${getAuthApiHost()}/v1/oauth/token`;
    const data = {
        grant_type: "refresh_token",
        refresh_token: secret.schwab().refreshToken,
    }
    let response = await fetch(AUTH_URL, {
        method: 'POST',
        headers: makeAuthHeader(),
        body: new URLSearchParams(data)
    });

    let json = await response.json();
    console.log(json);
    return json.access_token as string;
};

const getAccessTokenFromStorage = () => {
    return window.HybridApp.Secrets.schwab.accessToken;
};

export const getUserPreference = async () => {
    let url = `${getTraderApiHost()}/userPreference`;
    webRequest.asyncGet(url, getAccessTokenFromStorage()).then(response => {
        if (response.status != 200) {
            Firestore.logError(`getUserPreference failed: ${response.status}`);
            return null;
        }
        return response.json();
    })
        .then(json => {
            let streamerInfo = json?.streamerInfo[0];
            window.HybridApp.Secrets.schwab.schwabClientChannel = streamerInfo?.schwabClientChannel;
            window.HybridApp.Secrets.schwab.schwabClientCorrelId = streamerInfo?.schwabClientCorrelId;
            window.HybridApp.Secrets.schwab.schwabClientCustomerId = streamerInfo?.schwabClientCustomerId;
            window.HybridApp.Secrets.schwab.schwabClientFunctionId = streamerInfo?.schwabClientFunctionId;
            window.HybridApp.Secrets.schwab.streamerSocketUrl = streamerInfo?.streamerSocketUrl;
            console.log(window.HybridApp.Secrets.schwab);
            return json;
        });
}
export const getOptionsChain = async (symbol: string) => {
    let prefix = `${API_HOST}/marketdata/v1/chains`;
    let url = `${prefix}?symbol=${symbol}`;
    return webRequest.asyncGet2(url, getAccessTokenFromStorage()).then(response => {
        console.log(response);
        //response.json();
    })  // convert to json
        .then(json => {
            return json;
        })
        .catch(err => {
            console.log('Request Failed', err);
            return err;
        });
};
export const hasWeeklyOptions = async (symbol: string) => {
    let resp = await getOptionsChain(symbol);
    if (!resp.callExpDateMap) {
        Firestore.logError(`no callExcallExpDateMap for ${symbol}`);
        return false;
    }
    let keys: string[] = [];
    for (const property in resp.callExpDateMap) {
        keys.push(property);
    }
    if (keys.length < 2) {
        Firestore.logError(`not enough expirations in options chain fro ${symbol}`);
        return false;
    }
    let exp1 = getOptionsExpirationInDays(keys[0]);
    let exp2 = getOptionsExpirationInDays(keys[1]);
    if (exp1 == -1 || exp2 == -1) {
        return false;
    }
    let gap = Math.abs(exp1 - exp2);
    return gap < 10;
}
const getOptionsExpirationInDays = (contractKey: string) => {
    let parts = contractKey.split(':');
    if (parts.length < 2) {
        Firestore.logError(`no expiration days in contract key ${contractKey}`);
        return -1;
    }
    let dayString = parts[1];
    let result = parseInt(dayString);
    if (Number.isNaN(result)) {
        Firestore.logError(`not a number for expiration days in contract key ${contractKey}`);
        return -1;
    } else {
        return result;
    }
}
/* #endregion */

export const getFundamentals = async (symbol: string) => {
    let url = `${API_HOST}/marketdata/v1`;
    url += `?symbol=${symbol}&projection=fundamental`;
    return webRequest.asyncGet(url, window.HybridApp.Secrets.schwab.accessToken).then(response => response.json())  // convert to json
        .then(json => {
            let result = json[symbol];
            console.log(result);
            let fundamental = result.fundamental;
            let summary = {
                "symbol": symbol,
                "cusip": result.cusip,
                "sharesOutstanding": fundamental.sharesOutstanding,
                "marketCapFloat": fundamental.marketCapFloat,
                "marketCap": fundamental.marketCap,
                "bookValuePerShare": fundamental.bookValuePerShare,
                "shortIntToFloat": fundamental.shortIntToFloat,
                "shortIntDayToCover": fundamental.shortIntDayToCover,
                "beta": fundamental.beta,
            };
            let f: Models.SymbolFundamental = {
                symbol: symbol,
                marketCapFloat: fundamental.marketCapFloat,
                marketCap: fundamental.marketCap,
            };
            return f;
        })
        .catch(err => {
            console.log('Request Failed', err);
            return null;
        });
};

/* #region Account Info */
export const getAccountInfo = async () => {
    let url = `${getTraderApiHost()}/accounts?fields=positions`;
    let accessToken = window.HybridApp.Secrets.schwab.accessToken;
    let response = await webRequest.asyncGet(url, accessToken);
    let accounts = await response.json();
    let account = accounts[0].securitiesAccount;
    let accountHash = secret.schwab().accountHash;
    let ordersData = await getAllOrders(accountHash, accessToken);
    //console.log(ordersData);
    //console.log(account);
    let entryOrders = OrderFactory.extractEntryOrders(ordersData);
    //console.log(entryOrders);
    let result: Models.BrokerAccount = {
        trades: new Map<string, Models.TradeExecution[]>(),
        tradesCount: 0,
        nonBreakevenTradesCount: 0,
        realizedPnL: 0,
        orderExecutions: OrderFactory.extractOrderExecutionsFromAllSymbols(ordersData),
        entryOrders: OrderFactory.buildEntryOrderModelBySymbol(entryOrders),
        exitPairs: OrderFactory.extractWorkingExitPairs(ordersData),
        positions: buildPositionModel(account),
        rawAccount: ordersData,
        currentBalance: account.currentBalances.liquidationValue,
    };
    window.HybridApp.AccountCache = result;

    return result;
}

const buildPositionModel = (account: any) => {
    let positions = new Map<string, Models.Position>();
    if (!account || !account.positions) {
        return positions;
    }
    account.positions.forEach((position: any) => {
        let symbol = position.instrument.symbol;
        let p: Models.Position = {
            symbol: symbol,
            ...position,
        };
        if (position.longQuantity > 0) {
            p.netQuantity = position.longQuantity;
        } else if (position.shortQuantity > 0) {
            p.netQuantity = -position.shortQuantity;
        }
        positions.set(symbol, p);
    });
    return positions;
};
export const getAllOrders = async (accountId: string, accessToken: string) => {
    let from = TimeHelper.getTodayString() + 'T00:00:00.000Z';
    let tomorrow = TimeHelper.getTomorrowString() + 'T00:00:00.000Z';
    let ordersUrl = `${getTraderApiHost()}/accounts/${accountId}/orders?fromEnteredTime=${from}&toEnteredTime=${tomorrow}`;
    let ordersResponse = await webRequest.asyncGet(ordersUrl, accessToken);
    let ordersData = await ordersResponse.json();
    /*
    let equityOrders = OrderFactory.filterToEquityOrders(ordersData);
    return equityOrders;
    */
    return ordersData;
}
const filterOrdersNotOnSameDay = (orders: any) => {
    let result: any[] = [];
    let startTime = Config.Settings.dtStartTime;
    orders.forEach((o: any) => {
        if (!o.closeTime) {
            result.push(o);
        } else {
            let closeTime = new Date(o.closeTime);
            if (closeTime > startTime) {
                result.push(o);
            }
        }
    });
    return result;
}
/* #endregion */

/* #region Orders */
export const placeOrderBase = async (order: any, logTags: Models.LogTags) => {
    Firestore.logOrder(order, logTags);
    let start = new Date();
    let accessToken = getAccessTokenFromStorage();
    let accountId = secret.schwab().accountHash;
    let url = `${getTraderApiHost()}/accounts/${accountId}/orders`;
    let response = await webRequest.sendJsonPostRequestWithAccessToken(url, order, accessToken);
    let statusCode = response.status;
    let json = await response.json();
    let end = new Date();
    let duration = end.getTime() - start.getTime();

    if (statusCode == 200 || statusCode == 201) {
        Firestore.logSuccess(`${statusCode}, duration: ${duration} ms, placed order: ${JSON.stringify(json)}`, logTags);
    } else {
        Firestore.logError(`${statusCode}, duration: ${duration} ms placed order: ${JSON.stringify(json)}`, logTags);
    }
};

const replaceOrderBase = async (newOrder: any, oldOrderId: string, logTags: Models.LogTags) => {
    if (replacedOrderIds.has(oldOrderId)) {
        // Avoid replacing the same order multiple times in a short period
        Firestore.logError(`Order with ID ${oldOrderId} already replaced`);
        return;
    }
    replacedOrderIds.add(oldOrderId); // track replaced orders to avoid duplicates in the future
    Firestore.logOrder(newOrder, logTags);
    let accessToken = getAccessTokenFromStorage();
    let accountId = secret.schwab().accountHash;
    let url = `${getTraderApiHost()}/accounts/${accountId}/orders/${oldOrderId}`;
    let response = await webRequest.sendJsonPutRequestWithAccessToken(url, newOrder, accessToken);

    console.log(response.status);
    let json = await response.json();
    console.log(json);
    if (response.status != 200) {
        console.error(`replace order error status code: ${response.status}`);
        replacedOrderIds.delete(oldOrderId);
        //logErrorForObject(json);
    }
};
export const replaceSingleOrderWithMarketOrder = async (oldOrder: Models.OrderModel, logTags: Models.LogTags) => {
    let o = oldOrder;
    let newOrder = OrderFactory.createSingleOrder(
        o.symbol, Models.OrderType.MARKET, o.quantity, 0, o.isBuy, o.positionEffectIsOpen,
    );
    replaceOrderBase(newOrder, oldOrder.orderID, logTags);
}
export const replaceSingleOrderWithNewPrice = async (oldOrder: Models.OrderModel, newPrice: number, logTags: Models.LogTags) => {
    let o = oldOrder;
    let newOrder = OrderFactory.createSingleOrder(
        o.symbol, o.orderType, o.quantity, newPrice, o.isBuy, o.positionEffectIsOpen,
    );
    replaceOrderBase(newOrder, oldOrder.orderID, logTags);
};

export const cancelOrderBase = async (orderId: string) => {
    let accountHash = secret.schwab().accountHash;
    let accessToken = getAccessTokenFromStorage();
    let url = `${getTraderApiHost()}/accounts/${accountHash}/orders/${orderId}`;
    let response = await webRequest.asyncDelete(url, accessToken);
    if (response.status != 200) {
        let data = await response.json();
        logErrorForObject(data);
    }
};
const isExitPairValid = (pair: Models.ExitPair, logTags: Models.LogTags) => {
    if (!pair.LIMIT) {
        Firestore.logError(`missing limit leg from exit pair`, logTags);
        return false;
    } else {
        if (!pair.LIMIT.price) {
            Firestore.logError(`missing price in limit leg from exit pair`, logTags);
            return false;
        }
    }
    if (!pair.STOP) {
        Firestore.logError(`missing stop leg from exit pair`, logTags);
        return false;
    } else {
        if (!pair.STOP.price) {
            Firestore.logError(`missing price in stop leg from exit pair`, logTags);
            return false;
        }
    }
    return true;
}

export const replaceExitPairDirectlyWithNewPrice = async (pair: Models.ExitPair, newPrice: number,
    isStopLeg: boolean, positionIsLong: boolean, logTags: Models.LogTags) => {
    let isValid = isExitPairValid(pair, logTags);
    if (!isValid) {
        return;
    }
    if (!pair.LIMIT || !pair.STOP || !pair.LIMIT.price || !pair.STOP.price) {
        return;
    }
    if (isStopLeg) {
        replaceSingleOrderWithNewPrice(pair.STOP, newPrice, logTags);
    } else {
        replaceSingleOrderWithNewPrice(pair.LIMIT, newPrice, logTags);
    }
}

/**
 * Cancel both exit legs and place a new OCO exit pair
 */
export const cancelAndReplaceExitPairWithNewPrice = (
    pair: Models.ExitPair, newPrice: number,
    isStopLeg: boolean, positionIsLong: boolean, logTags: Models.LogTags) => {
    let isValid = isExitPairValid(pair, logTags);
    if (!isValid) {
        return;
    }
    if (!pair.LIMIT || !pair.STOP || !pair.LIMIT.price || !pair.STOP.price) {
        return;
    }
    let symbol = pair.symbol;
    let quantity = pair.LIMIT.quantity;
    let target = pair.LIMIT.price;
    let stopLoss = pair.STOP.price;
    if (isStopLeg) {
        stopLoss = newPrice;
    } else {
        target = newPrice;
    }
    cancelOrderBase(pair.LIMIT.orderID);
    cancelOrderBase(pair.STOP.orderID);
    setTimeout(() => {
        exitWithBracket(symbol, quantity, positionIsLong, target, stopLoss, logTags);
    }, 1000);
}

export const replaceExitPairWithOneMarketOrderLeg = (symbol: string, positionIsLong: boolean,
    pair: Models.ExitPair, logTags: Models.LogTags) => {
    let quantity = 0;
    let isBuy = false;
    if (pair.LIMIT) {
        quantity = pair.LIMIT.quantity;
        isBuy = pair.LIMIT.isBuy
    } else if (pair.STOP) {
        quantity = pair.STOP.quantity;
        isBuy = pair.STOP.isBuy;
    }
    if (quantity == 0) {
        Firestore.logError(`no legs in exit pair`, logTags);
        return;
    }
    let marketOrderLeg = OrderFactory.createSingleOrder(
        symbol, Models.OrderType.MARKET, quantity, 0, isBuy, false,
    );
    if (pair.LIMIT) {
        replaceOrderBase(marketOrderLeg, pair.LIMIT.orderID, logTags);
    } else if (pair.STOP) {
        replaceOrderBase(marketOrderLeg, pair.STOP.orderID, logTags);
    }
}

// this may not be needed. It's a slower version. it cancels the order, submits another market order
export const cancelAndReplaceWithMarketOrder = (
    symbol: string, positionIsLong: boolean,
    pair: Models.ExitPair, logTags: Models.LogTags) => {
    let quantity = 0;
    if (pair.LIMIT) {
        quantity = pair.LIMIT.quantity;
    } else if (pair.STOP) {
        quantity = pair.STOP.quantity;
    }
    if (quantity == 0) {
        Firestore.logError(`no legs in exit pair`, logTags);
        return;
    }
    if (pair.LIMIT) {
        cancelOrderBase(pair.LIMIT.orderID);
    }
    if (pair.STOP) {
        cancelOrderBase(pair.STOP.orderID);
    }

    setTimeout(() => {
        submitSingleOrder(
            symbol, Models.OrderType.MARKET, quantity, 0, !positionIsLong, false, logTags);
    }, 750);
}
export const submitSingleOrder = async (
    symbol: string, orderType: Models.OrderType, quantity: number,
    price: number, isBuy: boolean, positionEffectIsOpen: boolean,
    logTags: Models.LogTags) => {
    let order = OrderFactory.createSingleOrder(
        symbol, orderType, quantity, price, isBuy, positionEffectIsOpen
    )
    placeOrderBase(order, logTags);
};
export const submitPremarketOrder = async (
    symbol: string, quantity: number,
    price: number, isBuy: boolean, positionEffectIsOpen: boolean,
    logTags: Models.LogTags) => {
    let order = OrderFactory.createPremarketOrder(
        symbol, quantity, price, isBuy, positionEffectIsOpen
    )
    placeOrderBase(order, logTags);
};


export const cancelOrders = async (orderIds: string[]) => {
    orderIds.forEach(orderId => {
        cancelOrderBase(orderId);
    });
};
const getTestTarget = () => {
    let targets: Models.ProfitTarget[] = [];
    targets.push({
        quantity: 1,
        target: 200,
    });
    targets.push({
        quantity: 1,
        target: 200,
    });
    return targets;
}

export const testReplaceEntry2 = async () => {
    let newOrder = OrderFactory.createOneEntryWithMultipleExits(
        'MSFT', true, Models.OrderType.STOP, 2,
        200, getTestTarget(), 100);
    let entry = Models.getEntryOrders('MSFT');
    replaceOrderBase(newOrder, entry[0].orderID, {});
}


export const entryWithMultipleBrackets = async (
    symbol: string, quantity: number,
    isLong: boolean, orderType: Models.OrderType,
    entryPrice: number, profitTargets: Models.ProfitTarget[], stopPrice: number, logTags: Models.LogTags,
    orderIdToReplace: string) => {

    let order = OrderFactory.createOneEntryWithMultipleExits(
        symbol, isLong, orderType, quantity,
        entryPrice, profitTargets, stopPrice);

    if (orderIdToReplace && orderIdToReplace.length > 0) {
        replaceOrderBase(order, orderIdToReplace, logTags);
    } else {
        placeOrderBase(order, logTags);
    }
};
export const entryWithBracket = async (
    symbol: string, quantity: number,
    isLong: boolean, orderType: Models.OrderType,
    entryPrice: number, limitPrice: number, stopPrice: number, logTags: Models.LogTags) => {

    let order = OrderFactory.createOneEntryWithTwoExits(
        symbol, isLong, orderType,
        quantity, entryPrice,
        quantity, limitPrice,
        quantity, stopPrice);

    placeOrderBase(order, logTags);
};
export const exitWithBracket = async (
    symbol: string, quantity: number, positionIsLong: boolean,
    targetPrice: number, stopLossPrice: number, logTags: Models.LogTags) => {

    let order = OrderFactory.createOcoExitOrder(
        symbol, positionIsLong, quantity,
        targetPrice, stopLossPrice);

    placeOrderBase(order, logTags);
};


const logErrorForObject = (obj: any) => {
    Firestore.logDebug(obj);
    Firestore.logError(JSON.stringify(obj));
}