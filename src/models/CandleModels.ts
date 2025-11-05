import * as Models from './models';

export const getCurrentCandle = (symbol: string): Models.CandlePlus | null => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    if (candles.length == 0) {
        return null;
    }
    return candles[candles.length - 1];
}