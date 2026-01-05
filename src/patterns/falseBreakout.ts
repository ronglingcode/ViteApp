import * as Models from '../models/models';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';

/**
 * If 1-minute candle closed above, the next 2 candles closed below, then it is a confirmed false breakout.
 * Unless it closed above again, then it is not a confirmed false breakout.
 */
export const isConfirmedFalseBreakout = (symbol: string, breakoutDirection: boolean, keyLevel: number) => {
    let candles = Models.getM1ClosedCandlesSinceOpen(symbol);
    // find the first candle closed above key level
    let firstCandleClosedAboveIndex = -1;
    for (let i = 0; i < candles.length; i++) {
        let candle = candles[i];
        if (breakoutDirection && candle.close > keyLevel) {
            firstCandleClosedAboveIndex = i;
            break;
        }
        if (!breakoutDirection && candle.close < keyLevel) {
            firstCandleClosedAboveIndex = i;
            break;
        }
    }
    if (firstCandleClosedAboveIndex == -1) {
        return false;
    }
    if (firstCandleClosedAboveIndex + 2 > candles.length -1) {
        // not enough candles to check for false breakout
        return false;
    }

    for(let i = firstCandleClosedAboveIndex + 1; i < candles.length - 1; i++) {
        let candle = candles[i];
        if (breakoutDirection && candle.close > keyLevel) {
            return false;
        }
        if (!breakoutDirection && candle.close < keyLevel) {
            return false;
        }
    }
    return true;
}

export const oneClosedAboveNextClosedBelowJustHappened = (closedCandles: Models.Candle[], keyLevel: number, breakoutDirectionIsLong: boolean) => {
    if (closedCandles.length < 2) {
        return false;
    }
    let firstBreakoutCandleIndex = -1;
    for (let i = 0; i < closedCandles.length - 1; i++) {
        let candle = closedCandles[i];
        if (breakoutDirectionIsLong && candle.close > keyLevel) {
            firstBreakoutCandleIndex = i;
            break;
        } else if (!breakoutDirectionIsLong && candle.close < keyLevel) {
            firstBreakoutCandleIndex = i;
            break;
        }
    }
    if (firstBreakoutCandleIndex === -1) {
        return false;
    }
    let nextCandleIndex = firstBreakoutCandleIndex + 1;
    // must be the last closed candle for the timing
    if (nextCandleIndex != closedCandles.length - 1) {
        return false;
    }
    if (breakoutDirectionIsLong) {
        return closedCandles[nextCandleIndex].close < keyLevel;
    } else {
        return closedCandles[nextCandleIndex].close > keyLevel;
    }
}
/**
 * @returns true if making higher lows from open to close 1st candle above key level
 */
export const isBreakoutOnFirstRally = (closedCandles: Models.Candle[], keyLevel: number, breakoutDirectionIsLong: boolean) => {
    if (closedCandles.length < 2) {
        return false;
    }

    for(let i = 1; i < closedCandles.length; i++) {
        let previousCandle = closedCandles[i - 1];
        let currentCandle = closedCandles[i];
        if (breakoutDirectionIsLong && currentCandle.low < previousCandle.low) {
            return false;          
        } else if (!breakoutDirectionIsLong && currentCandle.high > previousCandle.high) {
            return false;
        } 
        if (breakoutDirectionIsLong && currentCandle.close >= keyLevel) {
            return true;
        } else if (!breakoutDirectionIsLong && currentCandle.close <= keyLevel) {
            return true;
        }
    }
    return false;
}