import { marketTime } from '../../../core/marketdata/marketClock.ts';
import type { AccountFill } from '../../../models/account.ts';
export type { AccountFill } from '../../../models/account.ts';

type VendorOrder = Record<string, any>;
export interface AccountOrder {
    symbol: string; orderID: string; orderType: string; quantity: number; isBuy: boolean;
    positionEffectIsOpen: boolean; price: number; rawOrder: VendorOrder;
    exitStopPrice?: number; exitLimitPrice?: number;
}
export interface AccountExitPair { symbol: string; source: string; parentOrderID: string; STOP?: AccountOrder; LIMIT?: AccountOrder }
const terminal = ['FILLED', 'CANCELED', 'REPLACED', 'REJECTED', 'EXPIRED'];
const working = ['PENDING_ACTIVATION', 'QUEUED', 'WORKING', 'AWAITING_PARENT_ORDER', 'PARTIALLY_FILLED'];
const isEquityLeg = (leg: VendorOrder) =>
    (leg.instrument?.assetType === undefined || leg.instrument.assetType === 'EQUITY')
    && (leg.orderLegType === undefined || leg.orderLegType === 'EQUITY');
const isEquityOrder = (order: VendorOrder): boolean =>
    (order.orderLegCollection ?? []).every(isEquityLeg)
    && (order.childOrderStrategies ?? []).every(isEquityOrder);
export const orderSymbol = (order: VendorOrder): string => order.orderLegCollection?.[0]?.instrument?.symbol
    ?? (order.childOrderStrategies?.[0] ? orderSymbol(order.childOrderStrategies[0]) : '');

function orderModel(order: VendorOrder, currentPrice: (symbol: string) => number): AccountOrder {
    const leg = order.orderLegCollection?.[0], symbol = orderSymbol(order);
    if (!leg || !symbol) throw new Error('Schwab single equity order missing leg/symbol');
    return {
        symbol, orderID: String(order.orderId ?? order.orderID ?? ''), orderType: order.orderType,
        quantity: Math.max(0, Number(order.quantity ?? leg.quantity) - Number(order.filledQuantity ?? 0)),
        isBuy: ['BUY', 'BUY_TO_COVER'].includes(leg.instruction), positionEffectIsOpen: leg.positionEffect === 'OPENING',
        price: Number(order.orderType === 'STOP' ? order.stopPrice : order.orderType === 'LIMIT' ? order.price : currentPrice(symbol)),
        rawOrder: order,
    };
}
function workingChildren(order: VendorOrder): VendorOrder[] {
    return (order.childOrderStrategies ?? []).flatMap((child: VendorOrder) => child.orderStrategyType === 'OCO'
        ? workingChildren(child) : child.orderStrategyType === 'SINGLE' && working.includes(child.status) ? [child] : []);
}
function exitPair(oco: VendorOrder, parent: VendorOrder, source: string, currentPrice: (symbol: string) => number): AccountExitPair | undefined {
    const children = workingChildren(oco);
    const result: AccountExitPair = { symbol: orderSymbol(parent), source, parentOrderID: String(oco.orderId ?? '') };
    for (const child of children) {
        if (child.orderType === 'STOP') result.STOP = orderModel(child, currentPrice);
        if (child.orderType === 'LIMIT') result.LIMIT = orderModel(child, currentPrice);
    }
    if (!result.STOP && !result.LIMIT) return undefined;
    // A partially filled limit may precede the broker's sibling-quantity update.
    if (result.STOP && result.LIMIT) result.STOP.quantity = result.LIMIT.quantity = Math.min(result.STOP.quantity, result.LIMIT.quantity);
    if ((result.STOP ?? result.LIMIT)!.quantity <= 0) return undefined;
    return result;
}
function add<T>(map: Record<string, T[]>, symbol: string, value: T) { (map[symbol] ??= []).push(value); }

/** Vendor JSON becomes explicit headless models. Includes fills on partial/canceled/replaced orders. */
export function projectAccount(account: VendorOrder, orders: VendorOrder[], date: string, currentPrice = (_symbol: string) => 0) {
    const positions: Record<string, any> = {}, entryOrders: Record<string, AccountOrder[]> = {}, exitPairs: Record<string, AccountExitPair[]> = {}, executions: Record<string, AccountFill[]> = {};
    for (const position of account.positions ?? []) {
        if (position.instrument?.assetType !== undefined && position.instrument.assetType !== 'EQUITY') continue;
        const symbol = position.instrument?.symbol;
        if (typeof symbol !== 'string') throw new Error('Schwab position missing symbol');
        positions[symbol] = { ...position, symbol, netQuantity: Number(position.longQuantity ?? 0) - Number(position.shortQuantity ?? 0) };
    }
    const visitFills = (order: VendorOrder) => {
        const leg = order.orderLegCollection?.[0], symbol = orderSymbol(order);
        if (leg && (leg.instrument?.assetType === 'EQUITY' || leg.orderLegType === 'EQUITY')) {
            for (const activity of order.orderActivityCollection ?? []) {
                if (activity.activityType !== 'EXECUTION' || activity.executionType !== 'FILL') continue;
                const legs = (activity.executionLegs ?? []).filter((fill: VendorOrder) => fill.legId === undefined || leg.legId === undefined || fill.legId === leg.legId);
                const quantity = legs.reduce((sum: number, fill: VendorOrder) => sum + Number(fill.quantity), 0);
                if (!quantity) continue;
                const timestamp = Date.parse(legs[0].time);
                if (!Number.isFinite(timestamp) || marketTime(timestamp).date !== date) continue;
                const dollars = legs.reduce((sum: number, fill: VendorOrder) => sum + Number(fill.quantity) * Number(fill.price), 0);
                add(executions, symbol, { symbol, orderID: String(order.orderId ?? ''), timestamp, quantity, price: dollars / quantity,
                    isBuy: ['BUY', 'BUY_TO_COVER'].includes(leg.instruction), positionEffectIsOpen: leg.positionEffect === 'OPENING' });
            }
        }
        for (const child of order.childOrderStrategies ?? []) visitFills(child);
    };
    const equityOrders = orders.filter(isEquityOrder);
    for (const order of equityOrders) {
        visitFills(order);
        const symbol = orderSymbol(order);
        if (!symbol) continue;
        const leg = order.orderLegCollection?.[0];
        if (order.orderStrategyType === 'SINGLE' && !terminal.includes(order.status) && leg?.positionEffect === 'OPENING'
            || order.orderStrategyType === 'TRIGGER' && order.cancelable) {
            const model = orderModel(order, currentPrice);
            const child = order.childOrderStrategies?.find((child: VendorOrder) => child.orderStrategyType === 'OCO');
            if (child) {
                const pair = exitPair(child, order, 'OTO', currentPrice);
                model.exitStopPrice = pair?.STOP?.price; model.exitLimitPrice = pair?.LIMIT?.price;
            }
            if (model.quantity > 0) add(entryOrders, symbol, model);
        }
        if (order.orderStrategyType === 'OCO') {
            const pair = exitPair(order, order, 'OCO', currentPrice); if (pair) add(exitPairs, symbol, pair);
        } else if (order.orderStrategyType === 'TRIGGER' && (order.status === 'FILLED' || Number(order.filledQuantity) > 0)) {
            for (const child of order.childOrderStrategies ?? []) if (child.orderStrategyType === 'OCO') {
                const pair = exitPair(child, order, 'OTO', currentPrice); if (pair) add(exitPairs, symbol, pair);
            }
        }
    }
    for (const fills of Object.values(executions)) fills.sort((a, b) => a.timestamp - b.timestamp);
    const balance = Number(account.currentBalances?.liquidationValue);
    if (!Number.isFinite(balance)) throw new Error('Schwab account missing liquidationValue');
    return { positions, entryOrders, exitPairs, executions, currentBalance: balance, rawOrders: equityOrders };
}
