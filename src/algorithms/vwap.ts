import * as Models from '../models/models';

export const isAgainstPremarketVwapStrongTrend = (symbol: string, isLong: boolean) => {
    let premarektVwapTrend = getStrongPremarketVwapTrend(symbol);
    return (isLong && premarektVwapTrend == -1) || (!isLong && premarektVwapTrend == 1);
}

export const isAgainstCurrentVwap = (symbol: string, isLong: boolean, entryPrice: number) => {
    let currentVwap = Models.getCurrentVwap(symbol);
    if (isLong) {
        return entryPrice < currentVwap;
    } else {
        return entryPrice > currentVwap;
    }
}

/**
 * @returns 1 if is strong bull trend and -1 if is strong bear trend. 0 otherwise
 */
export const getStrongPremarketVwapTrend = (symbol: string) => {
    let symbolData = Models.getSymbolData(symbol);
    return getFromCount(symbolData.premktBelowVwapCount, symbolData.premktAboveVwapCount);
}

const getFromCount = (belowVwapCount: number, aboveVwapCount: number) => {
    if (belowVwapCount > 5 && aboveVwapCount > 5) {
        return 0;
    }
    if (belowVwapCount > 5) {
        return -1;
    } else {
        return 1;
    }

    /*
    let below = belowVwapCount + 1;
    let above = aboveVwapCount + 1;
    if (below / above >= 4) {
        return -1;
    } else if (above / below >= 4) {
        return 1;
    } else {
        return 0;
    }*/
}

export const getPremarketTrendText = (belowVwapCount: number, aboveVwapCount: number) => {
    let trend = getFromCount(belowVwapCount, aboveVwapCount);
    let text = 'Netrual';
    if (trend == 1) {
        text = `Bull`;
    } else if (trend == -1) {
        text = `Bear`;
    }
    text = text + `: ${aboveVwapCount} / ${belowVwapCount}`;
    return text;
}

export const isCrossed = (candle: Models.Candle, vwap: number, isLong: boolean) => {
    if (isLong) {
        return candle.close <= vwap;
    } else {
        return candle.close >= vwap;
    }
}