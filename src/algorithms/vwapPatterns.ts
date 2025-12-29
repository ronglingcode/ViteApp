import * as Models from '../models/models';

export const test = () => {
    let symbol = 'NKE';
    for (let i = 90; i < 120; i++) {
        let status = getStatusForVwapContinuationLongWithPremarketHigh(symbol, i);
        console.log(`${i}: ${status}`);
    }
}
export const getStatusForVwapContinuationLongWithPremarketHigh = (symbol: string,
    maxCount: number) => {
    let candles = structuredClone(Models.getCandlesFromM1SinceOpen(symbol));
    let vwaps = structuredClone(Models.getVwapsSinceOpen(symbol));
    if (maxCount > 0) {
        candles = candles.slice(0, maxCount);
        vwaps = vwaps.slice(0, maxCount);
    }
    let symbolData = Models.getSymbolData(symbol);
    let premktHigh = symbolData.premktHigh;
    let currentPrice = candles[candles.length - 1].close;
    let currentVwap = vwaps[vwaps.length - 1].value;
    console.log(`${maxCount}: ${currentPrice} ${premktHigh}`);
    // assume last candle is not closed yet
    if (currentPrice > premktHigh) {
        if (candles.length >= 3) {
            let lastClosedCandle = candles[candles.length - 2];
            let secondLastClosedCandle = candles[candles.length - 3];
            if (maxCount > 30) {
                console.log(`${maxCount}: ${lastClosedCandle.close} ${premktHigh}`);
            }
            if (lastClosedCandle.close >= premktHigh && secondLastClosedCandle.close >= premktHigh) {
                return "confirmed above pm high";
            }
        }
        return "testing premarket high";
    } else if (currentPrice < currentVwap) {
        // get the last closed candle that is below vwap
        let threashold = -1;
        for (let i = candles.length - 2; i >= 0; i--) {
            if (candles[i].close < vwaps[i].value) {
                if (threashold == -1) {
                    threashold = candles[i].low;
                } else {
                    threashold = Math.max(threashold, candles[i].low);
                }
            }
        }
        if (currentPrice < threashold) {
            return "confirmed below vwap";
        }
        return "testing vwap";
    } else {
        return "consolidation between vwap and pm high"
    }
}

export const getStatusForAboveWaterBreakout = (symbol: string,
    inflectionLevel: number,
    maxCount: number) => {
    let candles = structuredClone(Models.getCandlesFromM1SinceOpen(symbol));
    let vwaps = structuredClone(Models.getVwapsSinceOpen(symbol));
    if (maxCount > 0) {
        candles = candles.slice(0, maxCount);
        vwaps = vwaps.slice(0, maxCount);
    }
    let symbolData = Models.getSymbolData(symbol);
    let premktHigh = symbolData.premktHigh;
    let currentPrice = candles[candles.length - 1].close;
    let currentVwap = vwaps[vwaps.length - 1].value;
    console.log(`${maxCount}: ${currentPrice} ${premktHigh}`);
    // assume last candle is not closed yet
    if (currentPrice > inflectionLevel) {
        if (candles.length >= 3) {
            let lastClosedCandle = candles[candles.length - 2];
            let secondLastClosedCandle = candles[candles.length - 3];
            if (lastClosedCandle.close >= inflectionLevel && secondLastClosedCandle.close >= inflectionLevel) {
                return "confirmed above breakout level";
            }
        }
        return "testing breakout level";
    } else if (currentPrice < currentVwap) {
        // get the last closed candle that is below vwap
        let threashold = -1;
        for (let i = candles.length - 2; i >= 0; i--) {
            if (candles[i].close < vwaps[i].value) {
                if (threashold == -1) {
                    threashold = candles[i].low;
                } else {
                    threashold = Math.max(threashold, candles[i].low);
                }
            }
        }
        if (currentPrice < threashold) {
            return "confirmed below vwap";
        }
        return "testing vwap";
    } else {
        return "consolidation between vwap and pm high"
    }
}

/**
 * 
 * @returns a string representing the status of the VWAP bounce fail pattern 
 */
export const getStatusForVwapBounceFail = (symbol: string) => {
    let candles = Models.getCandlesFromM1SinceOpen(symbol);
    // get the highest candle to start with
    let highestCandleIndex = 0;
    for (let i = 1; i < candles.length; i++) {
        if (candles[i].high > candles[highestCandleIndex].high) {
            highestCandleIndex = i;
        }
    }
    // assume highest candle is above vwap
    let current = highestCandleIndex;
    let vwaps = Models.getVwapsSinceOpen(symbol);
    let status = "above vwap";
    while (current < candles.length) {
        let candle = candles[current];
        if (candle.low < vwaps[current].value) {
            status = "testing vwap";
            break;
        }
        current++;
    }

    if (current >= candles.length - 1) {
        return status;
    }
    current++;

    // once it stops making new low or makes a new high, we are in the vwap bounce phase
    while (current < candles.length) {
        let prev = current - 1;
        let currentCandle = candles[current];
        if (prev >= 0) {
            let prevCandle = candles[prev];
            if ((currentCandle.high > prevCandle.high) || (currentCandle.low > prevCandle.low)) {
                status = "bouncing off vwap";
                break;
            }
        }
        current++;
    }
    return status;
}

export const hasTwoConsecutiveCandlesAgainstVwap = (symbol: string, isLong: boolean): boolean => {
    let candles = Models.getCandlesFromM15SinceOpen(symbol);
    let vwaps = Models.getVwapsSinceOpen(symbol);
    let has = false;
    for (let i = 1; i < candles.length; i++) {
        let currentClose = candles[i].close;
        let prevClose = candles[i - 1].close;
        if (isLong && currentClose < vwaps[i].value && prevClose < vwaps[i - 1].value) {
            has = true;
        }
        if (!isLong && currentClose > vwaps[i].value && prevClose > vwaps[i - 1].value) {
            has = true;
        }
    }
    return has;
}