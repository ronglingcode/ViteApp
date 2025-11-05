import * as Secret from '../../config/secret';
import * as Helper from '../../utils/helper';
import * as OrderFactory from './orderFactory';
import * as Firestore from '../../firestore';
import * as TimeHelper from '../../utils/timeHelper';
import * as Models from '../../models/models';
declare let window: Models.MyWindow;

const TRADING_API_HOST = "https://api.alpaca.markets";
const DATA_API_HOST = "https://data.alpaca.markets";
export const test1 = () => {
    let orderType = Models.OrderType.LIMIT;
    /*
    let order = OrderFactory.createOneEntryWithTwoExits(
        'AAPL', 1, true, Models.OrderType.STOP, 198, 188, 208);
    
    
    let order = OrderFactory.createOcoExits(
        'AAPL', 1, false, 180, 200
    );*/
    let order = OrderFactory.createOneEntryWithTwoExits(
        'AAPL', 1, true, Models.OrderType.MARKET, 0, 180, 200
    )
    exitWithBracket('CHWY', 1, true, 22, 20, {});
}

const getRequestHeader = () => {
    const alpacaSecrets = Secret.alpaca();
    return {
        "APCA-API-KEY-ID": alpacaSecrets.apiKey,
        "APCA-API-SECRET-KEY": alpacaSecrets.apiSecret
    };
}
const sendGetRequest = async (urlPath: string) => {
    const config = {
        method: 'GET',
        headers: getRequestHeader(),
    };
    const url = `${TRADING_API_HOST}${urlPath}`;
    return fetch(url, config);
}
const sendPostRequest = async (urlPath: string, data: any) => {
    const config = {
        method: 'POST',
        headers: getRequestHeader(),
        body: JSON.stringify(data)
    };
    const url = `${TRADING_API_HOST}${urlPath}`;
    return fetch(url, config);
}
const sendPatchRequest = async (urlPath: string, data: any) => {
    const config = {
        method: 'PATCH',
        headers: getRequestHeader(),
        body: JSON.stringify(data)
    };
    const url = `${TRADING_API_HOST}${urlPath}`;
    return fetch(url, config);
}
/* #region Account */
export const getAccountInfo = async () => {
    let account = await getAccount();
    let positions = await getPositions();
    let { entryOrderMap, exitPairs } = await getOpenOrders();
    let trades = await getTrades();
    let result: Models.BrokerAccount = {
        trades: new Map<string, Models.TradeExecution[]>(),
        tradesCount: 0,
        nonBreakevenTradesCount: 0,
        realizedPnL: 0,
        orderExecutions: new Map<string, Models.OrderExecution[]>(),
        entryOrders: entryOrderMap,
        exitPairs: exitPairs,
        positions: positions,
        rawAccount: null,
        currentBalance: account.currentBalance,
    };
    window.HybridApp.AccountCache = result;
    buildOrderExecutions(trades, result);
    return result;
}
export const getAccount = async () => {
    let response = await sendGetRequest("/v2/account");
    let data = await response.json();
    return {
        accountNumber: data.account_number,
        buyingPower: Number(data.buying_power),
        currentBalance: Number(data.portfolio_value),
    }
}
export const getPositions = async () => {
    let response = await sendGetRequest("/v2/positions");
    let data = await response.json();
    console.log(data);

    let positions = new Map<string, Models.Position>();
    if (!data || data.length == 0) {
        return positions;
    }
    data.forEach((position: any) => {
        let symbol = position.symbol;
        let p: Models.Position = {
            symbol: symbol,
            netQuantity: Number(position.qty),
            averagePrice: Math.abs(Number(position.avg_entry_price)),
        };
        positions.set(symbol, p);
    });

    return positions;
}
/* #endregion */
/* #region Orders */
export const getOpenOrders = async () => {
    let response = await sendGetRequest(`/v2/orders?status=all&limit=500&nested=true&after=${TimeHelper.getTodayString()}`);
    let data = await response.json();
    console.log(`raw orders count: ${data.length}`);
    return OrderFactory.processOrders(data);
}
export const getTrades = async () => {
    let response = await sendGetRequest(`/v2/account/activities/FILL?after=${TimeHelper.getTodayString()}`);
    let data = await response.json();
    //console.log(data);
    return data;
}
export const buildOrderExecutions = (trades: any[], result: Models.BrokerAccount) => {
    trades.forEach((trade: any) => {
        if (trade.activity_type == 'FILL') {
            let isBuy = trade.side == 'buy';
            let tradeTime = new Date(trade.transaction_time);
            let minutesSinceOpen = Helper.getMinutesSinceMarketOpen(tradeTime);
            minutesSinceOpen = Math.floor(minutesSinceOpen);
            let e: Models.OrderExecution = {
                symbol: trade.symbol,
                price: Number(trade.price),
                time: tradeTime,
                tradingViewTime: Helper.jsDateToTradingViewUTC(tradeTime), // one minute bucket time
                quantity: Number(trade.qty),
                isBuy: isBuy,
                positionEffectIsOpen: true,
                roundedPrice: Helper.roundPrice(trade.symbol, trade.price),
                minutesSinceOpen: minutesSinceOpen,
            }
            if (!result.orderExecutions.has(trade.symbol)) {
                result.orderExecutions.set(trade.symbol, []);
            }
            result.orderExecutions.get(trade.symbol)?.push(e);
        }
    });

}

export const entryWithBracket = async (
    symbol: string, quantity: number,
    isLong: boolean, orderType: Models.OrderType,
    entryPrice: number, limitPrice: number, stopPrice: number, logTags: Models.LogTags) => {

    let order = OrderFactory.createOneEntryWithTwoExits(
        symbol, quantity, isLong, orderType,
        entryPrice, stopPrice, limitPrice);

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
export const submitSingleOrder = async (
    symbol: string, orderType: Models.OrderType,
    quantity: number, price: number, isBuy: boolean,
    logTags: Models.LogTags) => {
    if (orderType == Models.OrderType.MARKET) {
        let order = OrderFactory.createMarketOrder(symbol, quantity, isBuy);
        placeOrderBase(order, logTags);
    } else if (orderType == Models.OrderType.LIMIT) {
        let order = OrderFactory.createLimitOrder(symbol, quantity, price, isBuy);
        placeOrderBase(order, logTags);
    } else if (orderType == Models.OrderType.STOP) {
        let order = OrderFactory.createStopOrder(symbol, quantity, price, isBuy);
        placeOrderBase(order, logTags);
    }
};
const placeOrderBase = async (order: any, logTags: Models.LogTags) => {
    Firestore.logOrder(order, logTags);
    let url = `/v2/orders`;
    sendPostRequest(url, order).then(response => {
        handleResponse(response);
    });
};
export const replaceOrderWithNewTarget = async (orderId: string, newTarget: number, logTags: Models.LogTags) => {
    let data = { 'limit_price': newTarget };
    replaceOrderBase(orderId, data, logTags);
}
export const replaceOrderWithNewStopLoss = async (orderId: string, newStopLoss: number, logTags: Models.LogTags) => {
    let data = { 'stop_price': newStopLoss };
    replaceOrderBase(orderId, data, logTags);
}
const replaceOrderBase = async (orderId: string, data: any, logTags: Models.LogTags) => {
    let url = `/v2/orders/${orderId}`;
    sendPatchRequest(url, data).then(response => {
        handleResponse(response);
    });
};
export const handleResponse = async (response: Response) => {
    let data = await response.json();
    if (!response.ok) {
        if (data && data.message) {
            Firestore.logError(data.message);
        } else {
            console.error(data);
        }
    }
}
export const cancelOrders = async (orderIds: string[]) => {
    const config = {
        method: 'DELETE',
        headers: getRequestHeader(),
    };

    orderIds.forEach(orderId => {
        let url = `${TRADING_API_HOST}/v2/orders/${orderId}`;
        fetch(url, config);
    });
};
/* #endregion */
/* #region Market data */
export const getPriceHistory = async (symbol: string, timeframe: number) => {
    let url = `${DATA_API_HOST}/v2/stocks/bars?symbols=${symbol}&timeframe=1T`;
    if (timeframe == 5) {
        url = `${DATA_API_HOST}/v2/stocks/bars?symbols=${symbol}&timeframe=5Min`;
    } else if (timeframe == 15) {
        url = `${DATA_API_HOST}/v2/stocks/bars?symbols=${symbol}&timeframe=15Min`;
    }
    return getBars(symbol, url);
};

export const get15MinuteChart = async (symbol: string, startDate: string) => {
    let url = `${DATA_API_HOST}/v2/stocks/bars?symbols=${symbol}&timeframe=15Min&start=${startDate}`;
    return getBars(symbol, url);
};

export const getDailyChart = async (symbol: string, startDate: string) => {
    let url = `${DATA_API_HOST}/v2/stocks/bars?symbols=${symbol}&timeframe=1D&start=${startDate}`;
    return getBars(symbol, url);
};

export const getBars = async (symbol: string, url: string) => {
    const config = {
        method: 'GET',
        headers: getRequestHeader(),
    };
    let response = await fetch(url, config);
    let responseJson = await response.json();
    let candles: any[] = [];
    let data = responseJson.bars[symbol];
    if (data) {
        data.forEach((bar: any) => {
            candles.push(buildCandle(symbol, bar));
        });
    } else {
        Firestore.logError(`no data for getBars()`);
    }

    return candles;
};

export const buildCandle = (symbol: string, bar: any) => {
    let newD = new Date(bar.t);
    return {
        symbol: symbol,
        time: Helper.jsDateToUTC(newD),
        datetime: newD,
        open: bar.o,
        close: bar.c,
        high: bar.h,
        low: bar.l,
        volume: bar.v,
        vwap: bar.vw,
    }
}
/* #endregion */