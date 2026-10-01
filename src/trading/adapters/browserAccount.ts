import type * as Models from '../../models/models';
import * as Helper from '../../utils/helper';
import { marketTime } from '../core/marketdata/marketClock.ts';
import type { projectAccount, AccountOrder, AccountExitPair } from '../libraries/broker/schwab/accountProjection.ts';
import type { AccountFill } from '../models/account.ts';

export const toBrowserFill = (fill: AccountFill): Models.OrderExecution => ({
    ...fill, time: new Date(fill.timestamp), tradingViewTime: Helper.jsDateToTradingViewUTC(new Date(fill.timestamp)),
    roundedPrice: Helper.roundPrice(fill.symbol, fill.price), minutesSinceOpen: Math.floor(marketTime(fill.timestamp).minutesSinceMarketOpen),
});
export const toCoreFill = (fill: Models.OrderExecution): AccountFill => ({
    symbol: fill.symbol, orderID: 'orderID' in fill ? String(fill.orderID) : '', timestamp: fill.time.getTime(),
    price: fill.price, quantity: fill.quantity, isBuy: fill.isBuy, positionEffectIsOpen: fill.positionEffectIsOpen,
});

/** Chart dates/enums stay at this boundary; vendor projection remains headless. */
export function toBrowserAccount(account: ReturnType<typeof projectAccount>): Models.BrokerAccount {
    const order = (value: AccountOrder): Models.EntryOrderModel => ({ ...value, orderType: value.orderType as Models.OrderType });
    const pair = (value: AccountExitPair): Models.ExitPair => ({ ...value, STOP: value.STOP ? order(value.STOP) : undefined, LIMIT: value.LIMIT ? order(value.LIMIT) : undefined });
    return {
        positions: new Map(Object.entries(account.positions)),
        entryOrders: new Map(Object.entries(account.entryOrders).map(([symbol, orders]) => [symbol, orders.map(order)])),
        exitPairs: new Map(Object.entries(account.exitPairs).map(([symbol, pairs]) => [symbol, pairs.map(pair)])),
        orderExecutions: new Map(Object.entries(account.executions).map(([symbol, fills]) => [symbol, fills.map(toBrowserFill)])),
        currentBalance: account.currentBalance, rawAccount: account.rawOrders,
        trades: new Map(), tradesCount: 0, nonBreakevenTradesCount: 0, realizedPnL: 0,
    };
}
