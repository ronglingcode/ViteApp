import { SchwabReadApi } from '../../trading/libraries/broker/schwab/readApi.ts';
import { projectAccount } from '../../trading/libraries/broker/schwab/accountProjection.ts';
import { toBrowserAccount } from '../../trading/adapters/browserAccount.ts';
import { SchwabOAuth } from '../../trading/libraries/broker/schwab/oauth.ts';
import type { SchwabCredentials } from '../../trading/ports/credentials.ts';
import { browserCredentials } from '../../trading/adapters/browserCredentials.ts';
import { browserHttp } from '../../trading/adapters/browserHttp.ts';
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
import * as GlobalSettings from '../../config/globalSettings';
import { recordBrokerToken, getBrokerToken, recordBrokerObservation, canApplyBrokerObservation } from '../../trading/adapters/browserBrokerMetadata';
import { brokerResponseError, readBrokerJson, describeError, fetchBrokerResponse } from '../../utils/errorDetails';
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
    let local = `${GlobalSettings.localhostWithPort}/schwabApi`;
    let host = window.location.hostname;
    if (host == 'localhost') {
        return API_HOST
    } else {
        return local;
    }
}
export const getTraderApiHost = () => {
    let host = window.location.hostname;
    let local = `${GlobalSettings.localhostWithPort}/schwabApi`;
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
const oauth = new SchwabOAuth(browserHttp, browserCredentials, value => btoa(value), () => `${getAuthApiHost()}/v1/oauth/token`);
const publishToken = (credentials: SchwabCredentials) => {
    window.HybridApp.Secrets.schwab.accessToken = credentials.access_token;
    const previous = getBrokerToken();
    if (!previous || previous.accessToken !== credentials.access_token || Math.abs(previous.expiresAt - (credentials.expires_at ?? 0)) > 1000)
        recordBrokerToken(credentials.access_token, ((credentials.expires_at ?? 0) - Date.now()) / 1000);
    return credentials.access_token;
};
export const generateRefreshToken = async (url: string) => {
    publishToken(await oauth.exchangeAuthorizationCode(url));
    Firestore.logInfo('Schwab authorization tokens saved locally.');
};
export const refreshAccessToken = async () => publishToken(await oauth.refresh());
export const maintainAccessToken = async () => {
    await oauth.accessToken();
    return publishToken(browserCredentials.loadSchwab());
};
const readApi = new SchwabReadApi(browserHttp, getTraderApiHost);
const getAccessTokenFromStorage = () => {
    return window.HybridApp.Secrets.schwab.accessToken;
};

export const getUserPreference = async () => {
    const streamerInfo = await readApi.getStreamerInfo(getAccessTokenFromStorage());
    Object.assign(window.HybridApp.Secrets.schwab, streamerInfo);
    return streamerInfo;
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
                sharesOutstanding: fundamental.sharesOutstanding,
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
    const observationStartedAt = Date.now();
    const accountHash = secret.schwab().accountHash;
    const accessToken = getAccessTokenFromStorage();
    const account = await readApi.getAccount(accessToken);
    const ordersData = Config.Settings.fetchOrdersByTimeWindows
        ? await getAllOrdersByTimeWindows(accountHash, accessToken)
        : await getAllOrders(accountHash, accessToken);
    const result = toBrowserAccount(projectAccount(account, ordersData, TimeHelper.getTodayString(), Models.getCurrentPrice));
    if (!canApplyBrokerObservation(observationStartedAt)) return window.HybridApp.AccountCache;
    window.HybridApp.AccountCache = result;
    recordBrokerObservation(observationStartedAt);

    return result;
}

export const getAllOrders = (accountId: string, accessToken: string) =>
    readApi.getOrders(accountId, accessToken, TimeHelper.getTodayString());
export const getAllOrdersByTimeWindows = (accountId: string, accessToken: string) =>
    readApi.getOrders(accountId, accessToken, TimeHelper.getTodayString(), true);

/* #endregion */

/* #region Orders */
export const placeOrderBase = async (order: any, logTags: Models.LogTags) => {
    try { return await placeOrderBaseCore(order, logTags); }
    catch (error) { Firestore.logError(`POST Schwab order failed: ${describeError(error)}`, logTags); }
};
const placeOrderBaseCore = async (order: any, logTags: Models.LogTags) => {
    Firestore.logOrder(order, logTags);
    let start = new Date();
    let accessToken = getAccessTokenFromStorage();
    let accountId = secret.schwab().accountHash;
    let url = `${getTraderApiHost()}/accounts/${accountId}/orders`;
    let response = await webRequest.sendJsonPostRequestWithAccessToken(url, order, accessToken);
    let statusCode = response.status;
    let json = await readBrokerJson(response, 'POST Schwab order', accessToken, accountId);
    if (statusCode >= 500 || (response.ok && (!json.orderId || json.orderId == -1))) {
        throw brokerResponseError('POST Schwab order outcome unknown; review broker orders', response,
            response.ok ? 'accepted response missing a valid orderId' : json, accessToken, accountId);
    }
    let end = new Date();
    let duration = end.getTime() - start.getTime();

    if (statusCode == 200 || statusCode == 201) {
        Firestore.logSuccess(`${statusCode}, duration: ${duration} ms, placed order: ${JSON.stringify(json)}`, logTags);
    } else {
        Firestore.logError(`${statusCode}, duration: ${duration} ms placed order: ${JSON.stringify(json)}`, logTags);
    }
    if (!json.orderId || json.orderId == -1 || json.orderId == "-1") {
        Helper.speak(`order failed`);
    }
};

const replaceOrderBase = async (newOrder: any, oldOrderId: string, logTags: Models.LogTags) => {
    try { return await replaceOrderBaseCore(newOrder, oldOrderId, logTags); }
    catch (error) { Firestore.logError(`PUT Schwab order ${oldOrderId} failed: ${describeError(error)}`, logTags); }
};
const replaceOrderBaseCore = async (newOrder: any, oldOrderId: string, logTags: Models.LogTags) => {
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
    let json = await readBrokerJson(response, `PUT Schwab order ${oldOrderId}`, accessToken, accountId);
    if (response.status >= 500) throw brokerResponseError(`PUT Schwab order ${oldOrderId} outcome unknown; review broker orders`, response, json, accessToken, accountId);

    console.log(response.status);
    console.log(json);
    if (response.status != 200) {
        Firestore.logError(brokerResponseError(`PUT Schwab order ${oldOrderId}`, response, json, accessToken, accountId), logTags);
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
    try { return await cancelOrderBaseCore(orderId); }
    catch (error) { Firestore.logError(`DELETE Schwab order ${orderId} failed: ${describeError(error)}`); }
};
const cancelOrderBaseCore = async (orderId: string) => {
    let accountHash = secret.schwab().accountHash;
    let accessToken = getAccessTokenFromStorage();
    let url = `${getTraderApiHost()}/accounts/${accountHash}/orders/${orderId}`;
    let response = await webRequest.asyncDelete(url, accessToken);
    if (response.status >= 500) {
        const body = await response.text();
        throw brokerResponseError(`DELETE Schwab order ${orderId} outcome unknown; review broker orders`, response, body, accessToken, accountHash);
    }
    if (response.status != 200) {
        let data = await response.text();
        Firestore.logError(brokerResponseError(`DELETE Schwab order ${orderId}`, response, data, accessToken, accountHash));
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
