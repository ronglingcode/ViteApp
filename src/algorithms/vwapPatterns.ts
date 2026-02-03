import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';

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
            if ((currentCandle.high > prevCandle.high) || (current != candles.length - 1 && currentCandle.low > prevCandle.low)) {
                status = "bouncing off vwap";
                break;
            }
        }
        current++;
    }
    return status;
}

/**
 * Similar to getStatusForVwapBounceFail but for the opposite direction.
 */
export const getStatusForVwapPushdownFail = (symbol: string) => {
    let candles = Models.getCandlesFromM1SinceOpen(symbol);
    // get the lowest candle to start with
    let lowestCandleIndex = 0;
    for (let i = 1; i < candles.length; i++) {
        if (candles[i].low < candles[lowestCandleIndex].low) {
            lowestCandleIndex = i;
        }
    }
    // assume lowest candle is below vwap
    let current = lowestCandleIndex;
    let vwaps = Models.getVwapsSinceOpen(symbol);
    let status = "below vwap";
    while (current < candles.length) {
        let candle = candles[current];
        if (candle.high > vwaps[current].value) {
            status = "testing vwap";
            break;
        }
        current++;
    }

    if (current >= candles.length - 1) {
        return status;
    }
    current++;

    // once it stops making new high or makes a new low after close, we are in the vwap pushdown phase
    while (current < candles.length) {
        let prev = current - 1;
        let currentCandle = candles[current];
        if (prev >= 0) {
            let prevCandle = candles[prev];
            if ((currentCandle.low < prevCandle.low) || (current != candles.length - 1 && currentCandle.high < prevCandle.high)) {
                status = "pushing down from vwap";
                break;
            }
        }
        current++;
    }
    return status;
}

export const getAboveWaterMomentumForPrice = (isLong: boolean, price: number, keyLevel: number, vwap: number) => {
    if (isLong) {
        if (price >= keyLevel) {
            return 1;
        } else {
            if (price >= vwap) {
                return 0;
            } else {
                return -1;
            }
        }
    } else {
        if (price <= keyLevel) {
            return 1;
        } else {
            if (price <= vwap) {
                return 0;
            } else {
                return -1;
            }
        }
    }
}

export const getStatusForOpenDrive = (symbol: string, timeframe: number, isLong: boolean, keyLevel: number) => {
    let candles = Models.getCandlesSinceOpenForTimeframe(symbol, timeframe);
    let vwaps = Models.getVwapsSinceOpenForTimeframe(symbol, timeframe);
    if (candles.length != vwaps.length) {
        console.log(`candles ${candles.length} vwaps ${vwaps.length}`);
        return "error: candles and vwaps lengths do not match";
    }
    if (candles.length == 0) {
        // not open yet
        return "good";
    }
    if (candles.length <= 2) {
        let price = candles[candles.length - 1].open;
        let vwap = vwaps[vwaps.length - 1].value;
        let momentum = getAboveWaterMomentumForPrice(isLong, price, keyLevel, vwap);
        if (momentum == 1) {
            return "good";
        } else if (momentum == 0) {
            return "weak momentum";
        } else {
            return "reversal";
        }
    }
    let lastStatus = "";
    for (let i = 1; i < candles.length - 1; i++) {
        let prevCandle = candles[i - 1];
        let currentCandle = candles[i];
        let prevVwap = vwaps[i - 1].value;
        let currentVwap = vwaps[i].value;
        let prevMomentum = getAboveWaterMomentumForPrice(isLong, prevCandle.close, keyLevel, prevVwap);
        let currentMomentum = getAboveWaterMomentumForPrice(isLong, currentCandle.close, keyLevel, currentVwap);
        if (prevMomentum == -1 && currentMomentum == -1) {
            return `2 consecutive reversal candles, ${i}`;
        }
        if (prevMomentum <= 0 && currentMomentum <= 0) {
            lastStatus = `2 consecutive weak momentum candles, ${i}`;
        } else {
            lastStatus = "good";
        }
    }
    return lastStatus;
}
export const hasTwoConsecutiveCandlesAgainstLevel = (symbol: string, isLong: boolean, level: number, timeframe: number) => {
    let candles = Models.getCandlesSinceOpenForTimeframe(symbol, timeframe);
    if (candles.length < 2) {
        // not 2 closed candles yet
        return false;
    }
    for (let i = 1; i < candles.length; i++) {
        let prevCandle = candles[i - 1];
        let currentCandle = candles[i];
        let prevCloseBelowLevel = isLong ? prevCandle.close < level : prevCandle.close > level;
        let currentCloseBelowLevel = isLong ? currentCandle.close < level : currentCandle.close > level;
        if (prevCloseBelowLevel && currentCloseBelowLevel) {
            return true;
        }
    }
    return false;
}
export const hasTwoConsecutiveCandlesAgainstLevelAfterCloseAbove = (symbol: string, isLong: boolean, level: number, timeframe: number) => {
    let candles = Models.getCandlesSinceOpenForTimeframe(symbol, timeframe);
    if (candles.length < 2) {
        // not 2 closed candles yet
        return false;
    }
    let firstCandleClosedAboveLevelIndex = -1;
    for (let i = 0; i < candles.length; i++) {
        let candle = candles[i];
        if (isLong ? candle.close >= level : candle.close <= level) {
            firstCandleClosedAboveLevelIndex = i;
            break;
        }
    }
    if (firstCandleClosedAboveLevelIndex == -1) {
        return false;
    }
    for (let i = firstCandleClosedAboveLevelIndex + 2; i < candles.length; i++) {
        let prevCandle = candles[i - 1];
        let currentCandle = candles[i];
        let prevCloseBelowLevel = isLong ? prevCandle.close < level : prevCandle.close > level;
        let currentCloseBelowLevel = isLong ? currentCandle.close < level : currentCandle.close > level;
        if (prevCloseBelowLevel && currentCloseBelowLevel) {
            return true;
        }
    }
    return false;
}

/**
 * If we have 2 candles closed below vwap,
 * then the momentum is losing and we give up for this timeframe
 */
export const hasTwoConsecutiveCandlesAgainstVwap = (symbol: string, isLong: boolean, timeframe: number) => {
    let candles = Models.getCandlesSinceOpenForTimeframe(symbol, timeframe);
    let vwaps = Models.getVwapsSinceOpenForTimeframe(symbol, timeframe);
    if (candles.length != vwaps.length) {
        Firestore.logError(`candles ${candles.length} vwaps ${vwaps.length}`);
        //return false;
    }
    if (candles.length < 2) {
        // not 2 closed candles yet
        return false;
    }
    let maxCount = Math.min(candles.length, vwaps.length);
    for (let i = 1; i < maxCount - 1; i++) {
        let prevCandle = candles[i - 1];
        let currentCandle = candles[i];
        let prevVwap = vwaps[i - 1].value;
        let currentVwap = vwaps[i].value;
        let currentCloseBelowVwap = isLong ? currentCandle.close < currentVwap : currentCandle.close > currentVwap;
        let prevCloseBelowVwap = isLong ? prevCandle.close < prevVwap : prevCandle.close > prevVwap;
        if (currentCloseBelowVwap && prevCloseBelowVwap) {
            return true;
        }
    }
    return false;
}
export const getNumberOfCandlesClosedAgainstVwap = (symbol: string, isLong: boolean, timeframe: number) => {
    let candles = Models.getCandlesSinceOpenForTimeframe(symbol, timeframe);
    let vwaps = Models.getVwapsSinceOpenForTimeframe(symbol, timeframe);
    if (candles.length < 2 || vwaps.length < 2) {
        return 0;
    }
    let maxCount = Math.min(candles.length, vwaps.length);
    // Count consecutive candles closed against VWAP from the most recent closed candle
    // Last candle (index maxCount - 1) is considered not closed yet, so start from maxCount - 2
    let count = 0;
    for (let i = 0; i <= maxCount - 2; i++) {
        let candle = candles[i];
        let vwap = vwaps[i].value;
        let closedAgainstVwap = isLong ? candle.close < vwap : candle.close > vwap;
        if (closedAgainstVwap) {
            count++;
        } else {
            break;
        }
    }
    return count;
}

export const isVwapContinuationEntry = (symbol: string, isLong: boolean, entryPrice: number) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    if (!TradingPlans.hasSingleMomentumLevel(plan)) {
        return false;
    }
    let openPrice = Models.getOpenPrice(symbol);
    if (!openPrice) {
        return false;
    }
    let keyLevel = TradingPlans.getSingleMomentumLevel(plan);
    let vwap = Models.getCurrentVwap(symbol);
    if (isLong) {
        return openPrice >= vwap && entryPrice >= vwap && vwap >= keyLevel.high;
    } else {
        return openPrice <= vwap && entryPrice <= vwap && vwap <= keyLevel.low;
    }
}

export const isNearAgainstVwap = (symbol: string, isLong: boolean, price: number) => {
    let vwap = Models.getCurrentVwap(symbol);
    let topPlan = TradingPlans.getTradingPlans(symbol);
    let atr = topPlan.atr.average;
    let buffer = atr * 0.15;
    if (isLong) {
        return price < vwap && price >= vwap - buffer;
    } else {
        return price > vwap && price <= vwap + buffer;
    }
}
export const isNearAlignWithVwap = (symbol: string, isLong: boolean, price: number) => {
    let vwap = Models.getCurrentVwap(symbol);
    let topPlan = TradingPlans.getTradingPlans(symbol);
    let atr = topPlan.atr.average;
    let buffer = atr * 0.15;
    if (isLong) {
        return price >= vwap && price <= vwap + buffer;
    } else {
        return price <= vwap && price >= vwap - buffer;
    }
}

export const isNearAgainstLevel = (symbol: string, isLong: boolean, price: number, level: number) => {
    let topPlan = TradingPlans.getTradingPlans(symbol);
    let atr = topPlan.atr.average;
    let buffer = atr * 0.15;
    if (isLong) {
        return price < level && price >= level - buffer;
    } else {
        return price > level && price <= level + buffer;
    }
}
