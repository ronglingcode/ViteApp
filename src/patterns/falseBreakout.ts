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