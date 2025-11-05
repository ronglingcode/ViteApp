import * as Models from '../models/models';

/**
 * If current quote is already more aggressive than specified price, use the quote price
 */
export const updateStopPriceFromCurrentQuote = (symbol: string, price: number, orderIsLong: boolean) => {
    let symbolData = Models.getSymbolData(symbol);
    if (orderIsLong) {
        return Math.max(price, symbolData.askPrice);
    } else {
        return Math.min(price, symbolData.bidPrice);
    }
}

export const getPercentageString = (upper: number, lower: number, precision: number) => {
    let percentage = upper * 100 / lower;
    return `${percentage.toFixed(precision)}%`;
}