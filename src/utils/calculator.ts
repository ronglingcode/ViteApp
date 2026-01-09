import * as Models from '../models/models';

/**
 * If current quote is already more aggressive than specified price, use the quote price
 */
export const updateStopPriceFromCurrentQuote = (symbol: string, price: number, orderIsLong: boolean) => {
    let symbolData = Models.getSymbolData(symbol);
    if (orderIsLong) {
        if (symbolData.askPrice) {
            return Math.max(price, symbolData.askPrice);
        } else {
            return price;
        }
    } else {
        if (symbolData.bidPrice) {
            return Math.min(price, symbolData.bidPrice);
        } else {
            return price;
        }
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

export const median = (numbers: number[]): number => {
    if (numbers.length === 0) {
        return 0;
    }
    const sorted = numbers.sort((a, b) => a - b);
    const n = sorted.length;
    
    if (n === 1) {
        return sorted[0];
    }
    
    if (n % 2 === 0) {
        // Even number: get middle 2 items
        const middle1 = n / 2 - 1;
        const middle2 = n / 2;
        return (sorted[middle1] + sorted[middle2]) / 2;
    } else {
        // Odd number: get middle 3 items
        const middle = Math.floor(n / 2);
        const sum = sorted[middle - 1] + sorted[middle] + sorted[middle + 1];
        return sum / 3;
    }
}
export const ratioToPercentageString = (ratio: number) => {
    if (ratio < 1) {
        return (ratio * 100).toFixed(1) + '%';
    } else {
        return (ratio * 100).toFixed(0) + '%';
    }
}