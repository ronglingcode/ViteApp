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

const oneThousand = 1000;
const oneMillion = 1000*1000;
export const numberToString = (number: number) => {
    if (number < oneThousand) {
        return number.toFixed(0);
    } else if (number < 10*oneThousand) {
        return (number / oneThousand).toFixed(1) + 'k';
    } else if (number < oneMillion) {
        return (number / oneThousand).toFixed(0) + 'k';
    } else if (number < 10*oneMillion) {
        return (number / oneMillion).toFixed(1) + 'M';
    } else {
        return (number / oneMillion).toFixed(0) + 'M';
    }
}