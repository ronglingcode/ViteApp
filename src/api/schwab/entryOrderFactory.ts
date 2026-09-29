import { createClosingEquityOrder } from './closingOrderFactory.ts';

export const createBracketedEquityEntry = (symbol: string, isLong: boolean, type: 'MARKET' | 'STOP' | 'LIMIT',
    quantity: number, price: number, targets: { target: number; quantity: number }[], stop: number) => {
    const order: any = createClosingEquityOrder(symbol, type, quantity, price, !isLong);
    order.orderLegCollection[0].instruction = isLong ? 'BUY' : 'SELL_SHORT';
    order.orderStrategyType = 'TRIGGER';
    order.childOrderStrategies = targets.map(target => ({ orderStrategyType: 'OCO', childOrderStrategies: [
        createClosingEquityOrder(symbol, 'STOP', target.quantity, stop, !isLong),
        createClosingEquityOrder(symbol, 'LIMIT', target.quantity, target.target, !isLong),
    ] }));
    return order;
};
