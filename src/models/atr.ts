import * as Models from '../models/models';
import * as Calculator from '../utils/calculator';

export const getAtrPercentageString = (symbol: string, priceRange: number) => {
    let atr = Models.getAtr(symbol).average;
    let percentageString = Calculator.getPercentageString(priceRange, atr, 0);
    return `${percentageString} atr`;
}