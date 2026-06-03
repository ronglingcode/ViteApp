import * as StateLite from '../models/stateLite';

const API_HOST = 'https://api.schwabapi.com';
const LOCAL_TRADER_API_HOST = 'http://localhost:3000/schwabApi';

const getAuthApiHost = () => {
    let host = globalThis.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' ? API_HOST : LOCAL_TRADER_API_HOST;
};

const getTraderApiHost = () => {
    return LOCAL_TRADER_API_HOST;
};

const createAuthHeaders = (secrets: StateLite.SchwabSecrets) => {
    let headers = new Headers();
    headers.append('Content-Type', 'application/x-www-form-urlencoded');
    headers.append('Authorization', `Basic ${btoa(`${secrets.appKey}:${secrets.secret}`)}`);
    return headers;
};

const parseResponseBody = async (response: Response) => {
    let text = await response.text();
    if (!text) {
        return {};
    }
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
};

const getWithAccessToken = (url: string, accessToken: string) => {
    return fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
};

interface LiteAccountInfo {
    positions: StateLite.PositionSnapshot[];
    currentBalance: number;
    rawAccount: any;
}

const todayString = () => {
    return new Date().toISOString().slice(0, 10);
};

const tomorrowString = () => {
    let tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
};

const workingOrderStatuses = new Set([
    'PENDING_ACTIVATION',
    'QUEUED',
    'WORKING',
    'AWAITING_PARENT_ORDER',
]);

export const refreshSchwabAccessToken = async (secrets: StateLite.SchwabSecrets) => {
    let response = await fetch(`${getAuthApiHost()}/v1/oauth/token`, {
        method: 'POST',
        headers: createAuthHeaders(secrets),
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: secrets.refreshToken,
        }),
    });
    let data = await parseResponseBody(response);
    if (!response.ok || !data.access_token) {
        throw new Error(`Schwab token refresh failed: ${response.status} ${JSON.stringify(data)}`);
    }
    StateLite.saveSchwabAccessToken(data.access_token);
    return data.access_token as string;
};

export const getSchwabStreamerInfo = async (
    secrets: StateLite.SchwabSecrets,
    accessToken: string
): Promise<StateLite.SchwabStreamerInfo> => {
    let response = await getWithAccessToken(`${getTraderApiHost()}/userPreference`, accessToken);
    let data = await parseResponseBody(response);
    if (!response.ok) {
        throw new Error(`Schwab userPreference failed: ${response.status} ${JSON.stringify(data)}`);
    }
    let streamerInfo = data?.streamerInfo?.[0];
    if (!streamerInfo?.streamerSocketUrl) {
        throw new Error('Schwab userPreference response did not include streamer info');
    }
    return {
        schwabClientChannel: streamerInfo.schwabClientChannel,
        schwabClientCorrelId: streamerInfo.schwabClientCorrelId,
        schwabClientCustomerId: streamerInfo.schwabClientCustomerId,
        schwabClientFunctionId: streamerInfo.schwabClientFunctionId,
        streamerSocketUrl: streamerInfo.streamerSocketUrl,
    };
};

export const getPositions = async (accessToken: string): Promise<StateLite.PositionSnapshot[]> => {
    return (await getAccountInfo(accessToken)).positions;
};

const getAccountBalance = (account: any) => {
    let balance = Number(
        account?.currentBalances?.liquidationValue ??
        account?.initialBalances?.liquidationValue ??
        account?.currentBalances?.cashBalance ??
        0
    );
    return Number.isFinite(balance) ? balance : 0;
};

const getAccountInfo = async (accessToken: string): Promise<LiteAccountInfo> => {
    let response = await getWithAccessToken(`${getTraderApiHost()}/accounts?fields=positions`, accessToken);
    let data = await parseResponseBody(response);
    if (!response.ok) {
        throw new Error(`Schwab account fetch failed: ${response.status} ${JSON.stringify(data)}`);
    }
    let account = data?.[0]?.securitiesAccount;
    let rawPositions = account?.positions;
    let positions = Array.isArray(rawPositions)
        ? rawPositions
        .map((position: any): StateLite.PositionSnapshot => {
            let symbol = position.instrument?.symbol ?? '';
            let longQuantity = Number(position.longQuantity ?? 0);
            let shortQuantity = Number(position.shortQuantity ?? 0);
            let quantity = longQuantity > 0 ? longQuantity : -shortQuantity;
            return {
                symbol,
                quantity,
                averagePrice: Number(position.averagePrice ?? 0),
            };
        })
            .filter(position => position.symbol && position.quantity !== 0)
        : [];
    return {
        positions,
        currentBalance: getAccountBalance(account),
        rawAccount: account,
    };
};

export const getTodayOrders = async (secrets: StateLite.SchwabSecrets, accessToken: string): Promise<any[]> => {
    let from = `${todayString()}T00:00:00.000Z`;
    let to = `${tomorrowString()}T00:00:00.000Z`;
    let url = `${getTraderApiHost()}/accounts/${secrets.accountHash}/orders` +
        `?fromEnteredTime=${encodeURIComponent(from)}&toEnteredTime=${encodeURIComponent(to)}`;
    let response = await getWithAccessToken(url, accessToken);
    let data = await parseResponseBody(response);
    if (!response.ok) {
        throw new Error(`Schwab orders fetch failed: ${response.status} ${JSON.stringify(data)}`);
    }
    return Array.isArray(data) ? data : [];
};

const getOrderSymbol = (order: any): string => {
    let orderLegs = order.orderLegCollection;
    if (Array.isArray(orderLegs) && orderLegs.length > 0) {
        return orderLegs[0]?.instrument?.symbol ?? '';
    }
    let childOrders = order.childOrderStrategies;
    if (Array.isArray(childOrders) && childOrders.length > 0) {
        return getOrderSymbol(childOrders[0]);
    }
    return '';
};

const isBuyOrder = (instruction: string) => {
    return instruction === 'BUY' || instruction === 'BUY_TO_COVER';
};

const getPositionEffectIsOpen = (order: any) => {
    let orderLeg = order.orderLegCollection?.[0];
    return orderLeg?.positionEffect === 'OPENING';
};

const extractOrderPrice = (order: any) => {
    if (order.orderType === 'STOP') {
        return Number(order.stopPrice ?? 0);
    }
    if (order.orderType === 'LIMIT') {
        return Number(order.price ?? 0);
    }
    return undefined;
};

const buildOrderModel = (order: any): StateLite.LiteOrderModel => {
    let orderLeg = order.orderLegCollection?.[0] ?? {};
    let orderInstruction = orderLeg.instruction ?? '';
    let orderType: StateLite.LiteOrderType = 'MARKET';
    if (order.orderType === 'LIMIT') {
        orderType = 'LIMIT';
    } else if (order.orderType === 'STOP') {
        orderType = 'STOP';
    }
    return {
        symbol: getOrderSymbol(order),
        orderID: String(order.orderId ?? ''),
        rawOrder: order,
        orderType,
        quantity: Number(order.quantity ?? orderLeg.quantity ?? 0),
        isBuy: isBuyOrder(orderInstruction),
        positionEffectIsOpen: getPositionEffectIsOpen(order),
        price: extractOrderPrice(order),
    };
};

const isFilledOto = (order: any) => {
    return order.orderStrategyType === 'TRIGGER' && order.status === 'FILLED';
};

const isWorkingSingleEntryOrder = (order: any) => {
    return order.orderStrategyType === 'SINGLE' &&
        workingOrderStatuses.has(order.status) &&
        getPositionEffectIsOpen(order);
};

const isWorkingTriggerEntryOrder = (order: any) => {
    return order.orderStrategyType === 'TRIGGER' &&
        Boolean(order.cancelable) &&
        getOrderSymbol(order);
};

const extractWorkingChildOrdersFromOco = (oco: any): any[] => {
    let workingChildOrders: any[] = [];
    if (!Array.isArray(oco.childOrderStrategies)) {
        return workingChildOrders;
    }
    oco.childOrderStrategies.forEach((order: any) => {
        if (order.orderStrategyType === 'SINGLE' && workingOrderStatuses.has(order.status)) {
            workingChildOrders.push(order);
        } else if (order.orderStrategyType === 'OCO') {
            workingChildOrders.push(...extractWorkingChildOrdersFromOco(order));
        }
    });
    return workingChildOrders;
};

const buildExitPairFromOco = (symbol: string, ocoOrder: any, source: string): StateLite.LiteExitPair | undefined => {
    let children = extractWorkingChildOrdersFromOco(ocoOrder);
    if (children.length === 0) {
        return undefined;
    }
    if (children.length !== 2) {
        console.error(`OCO should have 2 working children, but got ${children.length}`);
        console.log(ocoOrder);
        return undefined;
    }
    let exitPair: StateLite.LiteExitPair = {
        symbol,
        source,
        parentOrderID: String(ocoOrder.orderId ?? ''),
    };
    children.forEach(childOrder => {
        let model = buildOrderModel(childOrder);
        if (childOrder.orderType === 'STOP') {
            exitPair.STOP = model;
        } else if (childOrder.orderType === 'LIMIT') {
            exitPair.LIMIT = model;
        }
    });
    return exitPair;
};

const sortExitPairs = (pairs: StateLite.LiteExitPair[]) => {
    pairs.sort((a, b) => {
        if (!a.LIMIT || !b.LIMIT) {
            return 1;
        }
        let isLong = !b.LIMIT.isBuy;
        let priceA = a.LIMIT.price ?? 0;
        let priceB = b.LIMIT.price ?? 0;
        return isLong ? priceA - priceB : priceB - priceA;
    });
};

export const extractWorkingExitPairs = (orders: any[]) => {
    let result = new Map<string, StateLite.LiteExitPair[]>();
    let addPair = (pair: StateLite.LiteExitPair | undefined) => {
        if (!pair) {
            return;
        }
        let pairs = result.get(pair.symbol) ?? [];
        pairs.push(pair);
        result.set(pair.symbol, pairs);
    };

    orders.forEach(order => {
        if (order.orderStrategyType === 'OCO') {
            addPair(buildExitPairFromOco(getOrderSymbol(order), order, 'OCO'));
            return;
        }
        if (!isFilledOto(order) || !Array.isArray(order.childOrderStrategies)) {
            return;
        }
        order.childOrderStrategies.forEach((childOrder: any) => {
            if (childOrder.orderStrategyType === 'OCO') {
                addPair(buildExitPairFromOco(getOrderSymbol(order), childOrder, 'OTO'));
            }
        });
    });

    result.forEach(sortExitPairs);
    return result;
};

export const extractWorkingEntryOrders = (orders: any[]) => {
    let result = new Map<string, StateLite.LiteOrderModel[]>();
    let addOrder = (order: any) => {
        let model = buildOrderModel(order);
        if (!model.symbol) {
            return;
        }
        let existingOrders = result.get(model.symbol) ?? [];
        existingOrders.push(model);
        result.set(model.symbol, existingOrders);
    };

    orders.forEach(order => {
        if (isWorkingSingleEntryOrder(order) || isWorkingTriggerEntryOrder(order)) {
            addOrder(order);
        }
    });

    return result;
};

export const getLiteAccountSnapshot = async (
    secrets: StateLite.SchwabSecrets,
    accessToken: string
): Promise<StateLite.LiteAccountSnapshot> => {
    let [accountInfo, orders] = await Promise.all([
        getAccountInfo(accessToken),
        getTodayOrders(secrets, accessToken),
    ]);
    return {
        positions: new Map(accountInfo.positions.map(position => [position.symbol, position])),
        entryOrders: extractWorkingEntryOrders(orders),
        exitPairs: extractWorkingExitPairs(orders),
        currentBalance: accountInfo.currentBalance,
    };
};

const createMarketOrder = (symbol: string, quantity: number, side: StateLite.OrderSide) => {
    return {
        session: 'NORMAL',
        duration: 'DAY',
        orderType: 'MARKET',
        orderStrategyType: 'SINGLE',
        orderLegCollection: [
            {
                orderLegType: 'EQUITY',
                instrument: {
                    assetType: 'EQUITY',
                    symbol,
                },
                instruction: side === 'buy' ? 'BUY' : 'SELL',
                quantity,
            },
        ],
    };
};

const createClosingMarketOrder = (symbol: string, quantity: number, netQuantity: number) => {
    return {
        session: 'NORMAL',
        duration: 'DAY',
        orderType: 'MARKET',
        orderStrategyType: 'SINGLE',
        orderLegCollection: [
            {
                orderLegType: 'EQUITY',
                instrument: {
                    assetType: 'EQUITY',
                    symbol,
                },
                instruction: netQuantity > 0 ? 'SELL' : 'BUY_TO_COVER',
                quantity,
            },
        ],
    };
};

export const placeMarketOrder = async (
    secrets: StateLite.SchwabSecrets,
    accessToken: string,
    symbol: string,
    quantity: number,
    side: StateLite.OrderSide
) => {
    let order = createMarketOrder(symbol, quantity, side);
    let response = await fetch(`${getTraderApiHost()}/accounts/${secrets.accountHash}/orders`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(order),
    });
    let data = await parseResponseBody(response);
    if (!response.ok) {
        throw new Error(`Schwab order failed: ${response.status} ${JSON.stringify(data)}`);
    }
    return {
        status: response.status,
        order,
        data,
    };
};

export const placeClosingMarketOrder = async (
    secrets: StateLite.SchwabSecrets,
    accessToken: string,
    symbol: string,
    quantity: number,
    netQuantity: number
) => {
    let order = createClosingMarketOrder(symbol, quantity, netQuantity);
    let response = await fetch(`${getTraderApiHost()}/accounts/${secrets.accountHash}/orders`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(order),
    });
    let data = await parseResponseBody(response);
    if (!response.ok) {
        throw new Error(`Schwab closing market order failed: ${response.status} ${JSON.stringify(data)}`);
    }
    return {
        status: response.status,
        order,
        data,
    };
};

const createReplacementOrder = (oldOrder: StateLite.LiteOrderModel, newPrice: number) => {
    let instruction = oldOrder.rawOrder?.orderLegCollection?.[0]?.instruction ?? (oldOrder.isBuy ? 'BUY_TO_COVER' : 'SELL');
    let orderLeg = {
        orderLegType: 'EQUITY',
        instrument: {
            assetType: 'EQUITY',
            symbol: oldOrder.symbol,
        },
        instruction,
        quantity: oldOrder.quantity,
    };
    let order: any = {
        session: 'NORMAL',
        duration: 'DAY',
        orderStrategyType: 'SINGLE',
        orderType: oldOrder.orderType,
        orderLegCollection: [orderLeg],
    };
    if (oldOrder.orderType === 'STOP') {
        order.stopPrice = newPrice;
    } else if (oldOrder.orderType === 'LIMIT') {
        order.price = newPrice;
    }
    return order;
};

const createMarketReplacementOrder = (oldOrder: StateLite.LiteOrderModel) => {
    let instruction = oldOrder.rawOrder?.orderLegCollection?.[0]?.instruction ?? (oldOrder.isBuy ? 'BUY_TO_COVER' : 'SELL');
    return {
        session: 'NORMAL',
        duration: 'DAY',
        orderStrategyType: 'SINGLE',
        orderType: 'MARKET',
        orderLegCollection: [
            {
                orderLegType: 'EQUITY',
                instrument: {
                    assetType: 'EQUITY',
                    symbol: oldOrder.symbol,
                },
                instruction,
                quantity: oldOrder.quantity,
            },
        ],
    };
};

const replaceSingleOrder = async (
    secrets: StateLite.SchwabSecrets,
    accessToken: string,
    order: StateLite.LiteOrderModel,
    replacementOrder: any
) => {
    if (!order.orderID) {
        throw new Error(`Missing Schwab order id for ${order.symbol}`);
    }
    let response = await fetch(`${getTraderApiHost()}/accounts/${secrets.accountHash}/orders/${order.orderID}`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(replacementOrder),
    });
    let data = await parseResponseBody(response);
    if (!response.ok) {
        throw new Error(`Schwab replace order failed: ${response.status} ${JSON.stringify(data)}`);
    }
    return {
        status: response.status,
        order: replacementOrder,
        data,
    };
};

export const replaceSingleOrderWithNewPrice = async (
    secrets: StateLite.SchwabSecrets,
    accessToken: string,
    order: StateLite.LiteOrderModel,
    newPrice: number
) => {
    let replacementOrder = createReplacementOrder(order, newPrice);
    return replaceSingleOrder(secrets, accessToken, order, replacementOrder);
};

export const replaceSingleOrderWithMarketOrder = async (
    secrets: StateLite.SchwabSecrets,
    accessToken: string,
    order: StateLite.LiteOrderModel
) => {
    let replacementOrder = createMarketReplacementOrder(order);
    return replaceSingleOrder(secrets, accessToken, order, replacementOrder);
};

export const replaceExitPairWithNewPrice = async (
    secrets: StateLite.SchwabSecrets,
    accessToken: string,
    pair: StateLite.LiteExitPair,
    newPrice: number,
    isStopLeg: boolean
) => {
    let order = isStopLeg ? pair.STOP : pair.LIMIT;
    if (!order) {
        throw new Error(`Missing ${isStopLeg ? 'STOP' : 'LIMIT'} leg for ${pair.symbol}`);
    }
    return replaceSingleOrderWithNewPrice(secrets, accessToken, order, newPrice);
};

export const replaceExitPairWithMarketOrder = async (
    secrets: StateLite.SchwabSecrets,
    accessToken: string,
    pair: StateLite.LiteExitPair
) => {
    let order = pair.LIMIT ?? pair.STOP;
    if (!order) {
        throw new Error(`Missing exit leg for ${pair.symbol}`);
    }
    return replaceSingleOrderWithMarketOrder(secrets, accessToken, order);
};

interface SchwabStreamerCallbacks {
    onStatus: (status: string) => void;
    onQuote: (quote: StateLite.QuoteSnapshot) => void;
    onAccountActivity: (summary: string) => void;
    onError: (message: string) => void;
}

export class SchwabStreamer {
    private websocket: WebSocket | null = null;

    constructor(
        private readonly accessToken: string,
        private readonly streamerInfo: StateLite.SchwabStreamerInfo,
        private readonly symbols: string[],
        private readonly callbacks: SchwabStreamerCallbacks
    ) { }

    connect() {
        this.close();
        this.callbacks.onStatus('connecting');
        this.websocket = new WebSocket(this.streamerInfo.streamerSocketUrl);
        this.websocket.onopen = () => {
            this.callbacks.onStatus('socket open');
            this.sendLoginRequest();
        };
        this.websocket.onmessage = (messageEvent) => this.handleMessage(messageEvent);
        this.websocket.onerror = () => this.callbacks.onError('Schwab streamer socket error');
        this.websocket.onclose = () => this.callbacks.onStatus('closed');
    }

    close() {
        if (!this.websocket) {
            return;
        }
        this.websocket.close();
        this.websocket = null;
    }

    private send(request: unknown) {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            return;
        }
        this.websocket.send(JSON.stringify(request));
    }

    private sendLoginRequest() {
        this.send({
            requestid: '1',
            service: 'ADMIN',
            command: 'LOGIN',
            SchwabClientCustomerId: this.streamerInfo.schwabClientCustomerId,
            SchwabClientCorrelId: this.streamerInfo.schwabClientCorrelId,
            parameters: {
                Authorization: this.accessToken,
                SchwabClientChannel: this.streamerInfo.schwabClientChannel,
                SchwabClientFunctionId: this.streamerInfo.schwabClientFunctionId,
            },
        });
    }

    private subscribeLevelOneQuotes() {
        if (this.symbols.length === 0) {
            return;
        }
        this.send({
            service: 'LEVELONE_EQUITIES',
            requestid: '2',
            command: 'SUBS',
            SchwabClientCustomerId: this.streamerInfo.schwabClientCustomerId,
            SchwabClientCorrelId: this.streamerInfo.schwabClientCorrelId,
            parameters: {
                keys: this.symbols.join(','),
                fields: '0,1,2,3,4,5',
            },
        });
    }

    private subscribeActivity() {
        this.send({
            service: 'ACCT_ACTIVITY',
            requestid: '3',
            command: 'SUBS',
            SchwabClientCustomerId: this.streamerInfo.schwabClientCustomerId,
            SchwabClientCorrelId: this.streamerInfo.schwabClientCorrelId,
            parameters: {
                keys: 'Account Activity',
                fields: '0,1,2,3',
            },
        });
    }

    private handleMessage(messageEvent: MessageEvent<string>) {
        let messageData = JSON.parse(messageEvent.data);
        if (messageData.notify) {
            return;
        }
        if (messageData.response) {
            this.handleResponse(messageData.response);
            return;
        }
        if (messageData.data) {
            this.handleData(messageData.data);
        }
    }

    private handleResponse(responses: any[]) {
        responses.forEach(response => {
            if (response.service === 'ADMIN' && response.command === 'LOGIN') {
                this.callbacks.onStatus('logged in');
                this.subscribeLevelOneQuotes();
                this.subscribeActivity();
            }
        });
    }

    private handleData(dataItems: any[]) {
        dataItems.forEach(item => {
            if (item.service === 'LEVELONE_EQUITIES' && item.command === 'SUBS') {
                let timestamp = Number(item.timestamp ?? Date.now());
                item.content?.forEach((content: any) => {
                    this.callbacks.onQuote({
                        symbol: content.key,
                        bid: content['1'],
                        ask: content['2'],
                        lastPrice: content['3'],
                        timestamp,
                        source: 'schwab',
                    });
                });
                return;
            }

            if (item.service === 'ACCT_ACTIVITY' && item.command === 'SUBS') {
                let summary: Record<string, number> = {};
                item.content?.forEach((content: any) => {
                    let messageType = content['2'] ?? 'activity';
                    summary[messageType] = (summary[messageType] ?? 0) + 1;
                });
                this.callbacks.onAccountActivity(
                    Object.entries(summary).map(([key, value]) => `${key}:${value}`).join(', ')
                );
            }
        });
    }
}
