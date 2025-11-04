import * as webRequest from '../../utils/webRequest';
import * as Helper from '../../utils/helper';
import * as secret from '../../config/secret';
import type * as Models from '../../models/models';
import * as Firestore from '../../firestore';
import * as OrderFactory from './orderFactory';
import * as Config from '../../config/config';
declare let window: Models.MyWindow;



export const extractCodeFromUrl = (url: string) => {
    let raw_code = url.split('code=')[1];
    return decodeURIComponent(raw_code);
};

const getAccessTokenFromStorage = () => {
    return window.HybridApp.Secrets.tdameritrade.accessToken;
};

/* #region Order */
const placeOrderBase = async (accountId: string, order: any, logTags: Models.LogTags) => {
    Firestore.logOrder(order, logTags);
    let accessToken = getAccessTokenFromStorage();
    let url = `https://api.tdameritrade.com/v1/accounts/${accountId}/orders`;
    return webRequest.sendJsonPostRequestWithAccessToken(url, order, accessToken)//.then(response => console.log(response))
        .catch(err => {
            Firestore.logError('Order request Failed ' + err);
            console.log(err);
        }); // Catch errors;
};

const replaceOrderBase = async (accountId: string, newOrder: any, oldOrderId: string, logTags: Models.LogTags) => {
    Firestore.logOrder(newOrder, logTags);
    let accessToken = getAccessTokenFromStorage();
    let url = `https://api.tdameritrade.com/v1/accounts/${accountId}/orders/${oldOrderId}`;
    return webRequest.sendJsonPutRequestWithAccessToken(url, newOrder, accessToken)//.then(response => console.log(response))
        .catch(err => {
            Firestore.logError('Order request Failed ' + err);
            console.log(err);
        }); // Catch errors;
};
export const replaceWithNewPrice = async (accountId: string, oldOrder: Models.OrderModel, newPrice: number, logTags: Models.LogTags) => {
    let o = oldOrder;
    let newOrder = OrderFactory.createSingleOrder(
        o.symbol, o.orderType, o.quantity, newPrice, o.isBuy, o.positionEffectIsOpen,
    );
    replaceOrderBase(accountId, newOrder, oldOrder.orderID, logTags);
};


const getOrdersForSymbol = (symbol: string) => {
    let account = window.HybridApp.tosAccountCache;
    let orders = filterOrdersForSymbol(symbol, account.securitiesAccount.orderStrategies);
    return orders;
};



const filterOrdersForSymbol = (symbol: string, orders: any) => {
    let ordersForSymbol: any[] = [];
    orders.forEach((order: any) => {
        if (OrderFactory.getOrderSymbol(order) === symbol) {
            ordersForSymbol.push(order);
        }
    });
    return ordersForSymbol;
};

/* #endregion */

/* #region Read Order Fields */
const getOrderSymbol = (order: any): string => {
    if (order.orderLegCollection && order.orderLegCollection.length > 0) {
        let orderLeg = order.orderLegCollection[0];
        return orderLeg.instrument.symbol;
    }
    else if (order.childOrderStrategies && order.childOrderStrategies.length > 0) {
        let childOrder = order.childOrderStrategies[0];
        return getOrderSymbol(childOrder);
    }
    return "";
};
/* #endregion */

/* #region Price history, Quote */
export const getQuote = async (symbol: string) => {
    // took 0.1-0.2 seconds
    let url = `https://api.tdameritrade.com/v1/marketdata/${symbol}/quotes`;
    return webRequest.asyncGet(url, window.HybridApp.Secrets.tdameritrade.accessToken).then(response => response.json())  // convert to json
        .then(json => {
            return json[symbol];
        })
        .catch(err => {
            console.log('Request Failed', err);
            return err;
        });
};
export const getPriceHistory = async (symbol: string) => {
    let date = new Date();
    date.setDate(date.getDate() + 1);
    let end = Helper.jsDateToUTC(date) * 1000;
    // TODO: account for holidays
    date.setDate(date.getDate() - 4);
    let start = Helper.jsDateToUTC(date) * 1000;
    let clientId = secret.tdameritrade().clientId;
    let url = `https://api.tdameritrade.com/v1/marketdata/${symbol}/pricehistory?apikey=${clientId}&frequencyType=minute&frequency=1&startDate=${start}&endDate=${end}`;

    let response = await webRequest.asyncGet(url, window.HybridApp.Secrets.tdameritrade.accessToken);
    let json = await response.json();
    return json.candles;
};
/* #endregion */

/* #region Account */
export const getAccount = async (accountId: string) => {
    let url = `https://api.tdameritrade.com/v1/accounts/${accountId}?fields=positions,orders`;
    let response = await webRequest.asyncGet(url, window.HybridApp.Secrets.tdameritrade.accessToken);
    let json = await response.json();
    let account = json.securitiesAccount;

    let orders = account.orderStrategies;
    if (!orders) {
        orders = [];
    }
    orders = filterOrdersNotOnSameDay(orders);
    let entryOrders = OrderFactory.extractEntryOrders(orders);

    let result: Models.BrokerAccount = {
        trades: new Map<string, Models.TradeExecution[]>(),
        tradesCount: 0,
        nonBreakevenTradesCount: 0,
        realizedPnL: 0,
        orderExecutions: new Map<string, Models.OrderExecution[]>(),
        entryOrders: OrderFactory.buildEntryOrderModelBySymbol(entryOrders),
        exitPairs: new Map<string, Models.ExitPair[]>(),
        positions: buildPositionModel(account),
        rawAccount: json,
        currentBalance: account.currentBalances.liquidationValue,
    };
    window.HybridApp.tosAccountCache = json;
    window.HybridApp.AccountCache = result;
    let orderGroups = splitOrdersBySymbol(orders);
    orderGroups.forEach((orderGroup, symbol) => {
        let executions = OrderFactory.extractOrderExecutions(symbol, orderGroup);
        window.HybridApp.AccountCache?.orderExecutions.set(symbol, executions);
    });

    let exitPairs = OrderFactory.extractWorkingExitPairs(orders);
    exitPairs.forEach(element => {
        let mapValue = window.HybridApp.AccountCache?.exitPairs.get(element.symbol);
        if (!mapValue) {
            window.HybridApp.AccountCache?.exitPairs.set(element.symbol, [element]);
        } else {
            mapValue.push(element);
            window.HybridApp.AccountCache?.exitPairs.set(element.symbol, mapValue);
        }
    });
    return json;
};
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
        positions.set(symbol, p);
    });
    return positions;
};

const splitOrdersBySymbol = (orders: any[]) => {
    let orderGroups = new Map<string, any[]>();
    orders.forEach((order: any) => {
        let symbol = OrderFactory.getOrderSymbol(order);
        let group = orderGroups.get(symbol);
        if (!group) {
            orderGroups.set(symbol, [order]);
        } else {
            group.push(order);
            orderGroups.set(symbol, group);
        }
    });
    return orderGroups;
};
/* #endregion */

export const getFundamentals = async (symbol: string) => {
    let url = "https://api.tdameritrade.com/v1/instruments";
    url += `?symbol=${symbol}&projection=fundamental`;
    return webRequest.asyncGet(url, window.HybridApp.Secrets.tdameritrade.accessToken).then(response => response.json())  // convert to json
        .then(json => {
            let result = json[symbol];
            //console.log(result);
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

/* #region Options */
export const getOptionsChain = async (symbol: string) => {
    let clientId = secret.tdameritrade().clientId;
    let prefix = 'https://api.tdameritrade.com/v1/marketdata/chains';
    let url = `${prefix}?apikey=${clientId}&symbol=${symbol}`;
    return webRequest.asyncGetWithoutToken(url).then(response => response.json())  // convert to json
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