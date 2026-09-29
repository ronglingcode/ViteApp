/** Pure closing branch of orderFactory.createSingleOrder; no opening instructions are supported here. */
export const createClosingEquityOrder = (
    symbol: string, orderType: 'MARKET' | 'STOP' | 'LIMIT', quantity: number, price: number, isBuy: boolean,
) => ({
    session: 'NORMAL', duration: 'DAY',
    orderLegCollection: [{ orderLegType: 'EQUITY', instrument: { assetType: 'EQUITY', symbol },
        instruction: isBuy ? 'BUY_TO_COVER' : 'SELL', quantity }],
    orderType, orderStrategyType: 'SINGLE',
    ...(orderType === 'MARKET' ? {} : orderType === 'STOP' ? { stopPrice: price } : { price }),
});
