import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as Firestore from '../firestore';
import * as Models from '../models/models';
import * as Helper from '../utils/helper';
export const isReversalBar = (symbol: string, bar: Models.SimpleCandle, isLong: boolean, strictMode: boolean) => {
    let passedStrictMode = isReversalBarStrict(symbol, bar, isLong);
    if (strictMode) {
        if (!passedStrictMode) {
            //Firestore.logInfo(`not reversal yet using strict mode for checking reversal bar`);
        }
        return passedStrictMode;
    } else {
        if (passedStrictMode) {
            return true;
        }
        if (isLong) {
            return isRedBar(bar) || hasBottomWick(bar) || hasTopWick(bar);
        } else {
            return isGreenBar(bar) || hasTopWick(bar) || hasBottomWick(bar);
        }
    }
}

const isReversalBarStrict = (symbol: string, bar: Models.SimpleCandle, isLong: boolean) => {
    let barPrint = Helper.printBar(bar.open, bar.high, bar.low, bar.close);
    let range = bar.high - bar.low;
    let topWick = bar.high - Math.max(bar.close, bar.open);
    let bottomWick = Math.min(bar.close, bar.open) - bar.low;
    let redBody = isRedBar(bar) ? bar.open - bar.close : 0;
    let greenBodoy = isGreenBar(bar) ? bar.close - bar.open : 0;
    if (isLong) {
        if (isRedBar(bar) || ((redBody + bottomWick) / range > 0.45) || (bottomWick / range > 0.32)) {
            return true;
        } else {
            //Firestore.logError(`${symbol} not isReversalBarStrict for long, ${barPrint}`);
            return false;
        }
    } else {
        if (isGreenBar(bar) || ((greenBodoy + topWick) / range > 0.45) || (topWick / range > 0.32)) {
            return true;
        } else {
            //Firestore.logError(`${symbol} not isReversalBarStrict for short, ${barPrint}`);
            return false;
        }
    }
}
export const isRedBar = (bar: Models.SimpleCandle) => {
    return bar.close < bar.open;
};
export const isGreenBar = (bar: Models.SimpleCandle) => {
    return bar.close > bar.open;
};
const hasBottomWick = (bar: Models.SimpleCandle) => {
    let wick = Math.min(bar.close, bar.open) - bar.low;
    let range = bar.high - bar.low;
    return wick / range > 0.33;
};
const hasTopWick = (bar: Models.SimpleCandle) => {
    let wick = bar.high - Math.max(bar.close, bar.open);
    let range = bar.high - bar.low;
    return wick / range > 0.33;
};

const getTotalRange = (bar: Models.Candle) => {
    return bar.high - bar.low;
};
export const getBodyRatio = (bar: Models.Candle) => {
    let total = getTotalRange(bar);
    let body = Math.abs(bar.open - bar.close);
    return body / total;
}
export const isRedOpenBar = (bar: Models.Candle) => {
    if (!isRedBar(bar))
        return false;
    // body is more than 1/3 of the total candle
    return getBodyRatio(bar) >= 0.34;
};
export const isGreenOpenBar = (bar: Models.Candle) => {
    if (!isGreenBar(bar))
        return false;
    // body is more than 1/3 of the total candle
    return getBodyRatio(bar) >= 0.34;
};

export const hasBreakoutOccurredForNewCandle = (breakoutPrice: number, isLong: boolean, newCandle: Models.Candle) => {
    if (isLong) {
        return newCandle.high >= breakoutPrice;
    } else {
        return newCandle.low <= breakoutPrice;
    }
}
export const isFalseBreakoutForNewCandle = (isLong: boolean, newCandle: Models.Candle, breakoutPrice: number) => {
    if (isLong) {
        return newCandle.close < breakoutPrice;
    } else {
        return newCandle.close > breakoutPrice;
    }
};


export const hasGreenBarSinceOpen = (symbol: string) => {
    let time = Helper.getMarketOpenTime();
    let tvTime = Helper.jsDateToTradingViewUTC(time);
    let candles = Models.getUndefinedCandleSinceTime(symbol, tvTime);
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (isGreenBar(c)) {
            return true;
        }
    }
    return false;
};

export const hasRedBarSinceOpen = (symbol: string) => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (isRedBar(c)) {
            return true;
        }
    }
    return false;
};
// the body of the first bar is less than 35%
export const firstBarIsPinBar = (symbol: string) => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    if (candles.length == 0) {
        Firestore.logError(`no candles after open, firstBarIsPinBar`);
        return false;
    }
    let openBar = candles[0];
    let range = openBar.high - openBar.low;
    let body = Math.abs(openBar.open - openBar.close);
    return (body / range) <= 0.35;
}

/**
 * including current bar which may not be closed. 
 */
export const hasReversalBarSinceOpen = (symbol: string, isLong: boolean,
    strictMode: boolean, considerCurrentCandleAfterOneMinute: boolean,
    caller: string) => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    if (candles.length == 0) {
        Firestore.logError(`${caller} no candles after open, hasReversalBarSinceOpen`);
        return false;
    } else if (candles.length == 1) {
        return isReversalBar(symbol, candles[0], isLong, strictMode);
    }
    let end = considerCurrentCandleAfterOneMinute ? candles.length : candles.length - 1;

    for (let i = 0; i < end; i++) {
        const c = candles[i];
        if (isLong) {
            if (isRedBar(c)) {
                return true;
            }
        } else {
            if (isGreenBar(c)) {
                return true;
            }
        }
    }
    return false;
}
export const isPriceOutsideLevel = (isLong: boolean, price: number, level: number, strictCompare: boolean) => {
    if (strictCompare) {
        return ((isLong && price > level) || (!isLong && price < level));
    } else {
        return ((isLong && price >= level) || (!isLong && price <= level));
    }
}
export const isBarClosed = (candle: Models.SimpleCandle) => {
    let now = new Date();
    let candleTime = Helper.tvTimestampToLocalJsDate(candle.time); // candleTime is candle open time
    candleTime.setSeconds(candleTime.getSeconds() + 60); // candleTime is candle close time now
    return now >= candleTime;
};

export const isPriceInLowerRange = (symbol: string, price: number) => {
    let symbolData = Models.getSymbolData(symbol);
    let range = symbolData.highOfDay - symbolData.lowOfDay;
    let threshold = range * 0.25 + symbolData.lowOfDay;
    return price <= threshold;
};

export const isPriceInUpperRange = (symbol: string, price: number) => {
    let symbolData = Models.getSymbolData(symbol);
    let range = symbolData.highOfDay - symbolData.lowOfDay;
    let threshold = symbolData.highOfDay - range * 0.25;
    return price >= threshold;
};

export const hasLostVwapMomentum = (symbol: string, isLong: boolean, entryTime: Date) => {
    let symbolData = Models.getSymbolData(symbol);
    let candles = Models.getUndefinedCandles(symbol);
    let vwap = symbolData.vwap;
    let consecutiveMinutesAgainstVwap = 0;
    let startMinute = Helper.getSecondsSinceMarketOpen(entryTime) / 60;
    for (let i = 0; i < candles.length; i++) {
        if (candles[i].minutesSinceMarketOpen < startMinute) {
            continue;
        }
        if (!vwap[i]) {
            continue;
        }
        if ((isLong && candles[i].close < vwap[i].value) ||
            (!isLong && candles[i].close > vwap[i].value)) {
            consecutiveMinutesAgainstVwap++;
            if (consecutiveMinutesAgainstVwap >= 3) {
                return true;
            }
        }
    }
    return false;
}

export const isPriceAboveVwap = (symbol: string, isLong: boolean, price: number) => {
    let vwap = Models.getCurrentVwap(symbol);
    if (isLong) {
        return price >= vwap;
    } else {
        return price <= vwap;
    }
}

export const isFirstRetracement = (symbol: string, isLong: boolean) => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    if (!isBarSameDirection(candles[0], isLong)) {
        // first candle needs to be in the same direction
        return false;
    }
    if (candles.length == 2) {
        // if it's at 2nd minute, second candle can be a weak retracement that didn't really reverse
        return true;
    }
    if (candles.length == 3) {
        // if it's at 3rd minute, 2nd or 3rd candle must be retracement
        return !isBarSameDirection(candles[1], isLong) ||
            !isBarSameDirection(candles[2], isLong);
    }
    if (!isBarSameDirection(candles[1], isLong)) {
        // if more than 3 candles, first 2 must be in the same direction
        return false;
    }
    if (candles.length == 4) {
        return !isBarSameDirection(candles[2], isLong) ||
            !isBarSameDirection(candles[3], isLong);
    }
    if (!isBarSameDirection(candles[2], isLong)) {
        // if more than 4 candles, first 3 must be in the same direction
        return false;
    }
    if (isLong) {
        return hasRedBarSinceOpen(symbol);
    } else {
        return hasGreenBarSinceOpen(symbol);
    }
}

export const isBarSameDirection = (candle: Models.SimpleCandle, isLong: boolean) => {
    if (isLong) {
        return isGreenBar(candle);
    } else {
        return isRedBar(candle);
    }
}

export const isConsecutiveBarsSameDirection = (symbol: string, isLong: boolean) => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    let l = candles.length;
    if (l < 5) {
        return false;
    } else if (l < 10) {
        return isBarSameDirection(candles[l - 1], isLong) &&
            isBarSameDirection(candles[l - 2], isLong) &&
            isBarSameDirection(candles[l - 3], isLong) &&
            isBarSameDirection(candles[l - 4], isLong) &&
            isBarSameDirection(candles[l - 5], isLong);
    } else {
        return isBarSameDirection(candles[l - 1], isLong) &&
            isBarSameDirection(candles[l - 2], isLong) &&
            isBarSameDirection(candles[l - 3], isLong);
    }
}
export const analyzeBreakoutPatterns = (symbol: string, isLong: boolean, level: number) => {
    let candles = Models.getCandlesFromM1SinceOpen(symbol);
    let firstTestingCandle = null;
    let firstTestingCandleIsClosed = false;
    let firstCandleClosedBeyondLevel = null;
    let firstCandleClosedBeyondLevelIndex = -1;
    for(let i = 0; i < candles.length; i++) {
        let c = candles[i];
        let isClosed = i < candles.length - 1;
        if(firstTestingCandle == null) {
            if((isLong && c.high >= level) ||
                (!isLong && c.low <= level)) {
                firstTestingCandle = c;
                firstTestingCandleIsClosed = isClosed;                     
            }
        }
        if(firstCandleClosedBeyondLevel == null) {
            if (isClosed) {
                if (isLong && candles[i].close >= level) {
                    firstCandleClosedBeyondLevel = candles[i];
                } else if (!isLong && candles[i].close <= level) {
                    firstCandleClosedBeyondLevel = candles[i];
                    firstCandleClosedBeyondLevelIndex = i;
                }
            }
        }
    }
    return {
        firstTestingCandle: firstTestingCandle,
        firstTestingCandleIsClosed: firstTestingCandleIsClosed,
        firstCandleClosedBeyondLevel: firstCandleClosedBeyondLevel,
        firstCandleClosedBeyondLevelIndex: firstCandleClosedBeyondLevelIndex,
    }
}
export const hasClosedBeyondPrice = (symbol: string, isLong: boolean, price: number) => {
    let usedTimeframe = Models.getUsedTimeframe();
    // temporary fix for above water breakout tradebook
    if (usedTimeframe > 1) {
        return true;
    }
    let c = getFirstCandleClosedBeyondPrice(symbol, isLong, price);
    if (c) {
        return true;
    } else {
        return false;
    }
}
export const getFirstCandleClosedBeyondPrice = (symbol: string, isLong: boolean, price: number) => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    let l = candles.length;
    for (let i = 0; i < l - 1; i++) {
        let closePrice = candles[i].close;
        if ((isLong && closePrice >= price) ||
            (!isLong && closePrice <= price)) {
            return candles[i];
        }
    }
    return null;
}
export const hasConfirmationForBreakoutEntry = (symbol: string, isLong: boolean, breakoutPrice: number) => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    if (candles.length < 1) {
        // no candles
        return false;
    }
    let threshold = isLong ? candles[0].high : candles[0].low;
    if (candles.length == 1) {
        // first 60 seconds, ok to use its high low
        if (isLong) {
            return breakoutPrice >= threshold
        } else {
            return breakoutPrice <= threshold;
        }
    }
    // after 1 minute, only use closed candles
    for (let i = 0; i < candles.length - 1; i++) {
        let c = candles[i];
        threshold = isLong ? c.high : c.low;
        if ((isLong && breakoutPrice >= threshold) ||
            (!isLong && breakoutPrice <= threshold)) {
            return true;
        }
    }
    return false;
}

export const hasFalseHighOfDayBreakout = (symbol: string, entryPrice: number, isLong: boolean,
    logTags: Models.LogTags) => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    if (candles.length <= 1) {
        Firestore.logError(`not enough candles since open`, logTags);
        return false;
    }
    let previousCandle = candles[0];
    let firstHighLow = isLong ? previousCandle.low : previousCandle.high;
    let secondHighLow = 0;
    for (let i = 1; i < candles.length; i++) {
        let currentCandle = candles[i];
        if (isLong) {
            if (currentCandle.low < firstHighLow) {
                secondHighLow = firstHighLow;
                firstHighLow = currentCandle.low;
            }
        } else {
            if (currentCandle.high > firstHighLow) {
                secondHighLow = firstHighLow;
                firstHighLow = currentCandle.high;
            }
        }
    }
    if (secondHighLow == 0) {
        Firestore.logError(`no breakout yet`, logTags);
        return false;
    }
    if (isLong) {
        if (entryPrice < secondHighLow) {
            Firestore.logError(`hasFalseHighOfDayBreakout: entry price ${entryPrice} is still below breakout level`, logTags);
            return false;
        }
    } else {
        if (entryPrice > secondHighLow) {
            Firestore.logError(`hasFalseHighOfDayBreakout: entry price ${entryPrice} is still above breakout level`, logTags);
            return false;
        }
    }
    return true;
}
export const hasFalseBreakout = (symbol: string, threshold: number, isLong: boolean, price: number) => {
    let symbolData = Models.getSymbolData(symbol);
    if (isLong) {
        return symbolData.lowOfDay < threshold && price > threshold;
    } else {
        return symbolData.highOfDay > threshold && price < threshold;
    }
}

export const hasConfirmationForMarketEntry = (symbol: string, isLong: boolean) => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    if (candles.length < 2) {
        // first candle not closed
        return false;
    }
    let threshold = isLong ? candles[0].high : candles[0].low;
    // go through each next candle
    for (let i = 1; i < candles.length; i++) {
        let nextCandle = candles[i];
        if (isLong) {
            if (nextCandle.high > threshold) {
                return true;
            } else {
                threshold = nextCandle.high;
            }
        } else {
            if (nextCandle.low < threshold) {
                return true;
            } else {
                threshold = nextCandle.low;
            }
        }
    }
    return false;
}
export const getFirstNewHighLowPrice = (symbol: string, isLong: boolean) => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    let result = isLong ? candles[0].high : candles[0].low;
    // last candle is always not closed
    for (let i = 1; i < candles.length - 1; i++) {
        let c = candles[i];
        if (isLong) {
            if (c.high < result) {
                result = c.high;
            } else {
                return result;
            }
        } else {
            if (c.low > result) {
                result = c.low;
            } else {
                return result;
            }
        }
    }
    return result;
}

export const checkFirstNewHighPattern = (symbol: string, isLong: boolean, timeframe: number) => {
    let result = {
        status: '',
        entryPrice: 0,
    }
    let rawCandles = Models.getUndefinedCandlesSinceOpen(symbol);
    let candles = timeframe > 1 ? Models.aggregateCandles(rawCandles, timeframe) : rawCandles;
    if (candles.length <= 2) {
        result.status = 'first 2 candles not closed';
        return result;
    }
    result.entryPrice = isLong ? candles[0].high : candles[0].low;

    // last candle is always not closed
    for (let i = 1; i < candles.length - 1; i++) {
        let c = candles[i];
        if (isLong) {
            if (c.high <= result.entryPrice) {
                result.entryPrice = c.high;
            } else {
                result.status = 'already triggered in previous candle';
                return result;
            }
        } else {
            if (c.low >= result.entryPrice) {
                result.entryPrice = c.low;
            } else {
                result.status = 'already triggered in previous candle';
                return result;
            }
        }
    }
    // at least one closed candle need to be reversal bar
    let hasReversalBar = false;
    for (let i = 0; i < candles.length - 1; i++) {
        if (isLong && isRedBar(candles[i]) ||
            (!isLong && isGreenBar(candles[i]))) {
            hasReversalBar = true;
            break;
        }
    }
    if (!hasReversalBar) {
        result.status = 'no closed reversal bar';
        return result;
    }
    // check last candle
    let lastCandle = candles[candles.length - 1];
    if ((isLong && lastCandle.high > result.entryPrice) ||
        (!isLong && lastCandle.low < result.entryPrice)) {
        result.status = 'already triggered in current candle';
        return result;
    }
    result.status = 'ok';
    return result;
}

export const hasPremarketBreakout = (symbol: string, isLong: boolean) => {
    let symbolData = Models.getSymbolData(symbol);
    if (isLong) {
        return symbolData.highOfDay > symbolData.premktHigh;
    } else {
        return symbolData.lowOfDay < symbolData.premktLow;
    }
}
export const getOpenExtensionFromVwapInAtr = (symbol: string, isLong: boolean) => {
    let openPrice = Models.getOpenPrice(symbol);
    if (!openPrice) {
        openPrice = Models.getCurrentPrice(symbol);
    }
    let vwap = Models.getLastVwapBeforeOpen(symbol);
    if ((isLong && openPrice > vwap) ||
        (!isLong && openPrice < vwap)) {
        return 0;
    }

    let distanceToVwap = Math.abs(openPrice - vwap);
    let atr = Models.getAtr(symbol).average;
    let vwapExtensionInAtr = distanceToVwap / atr;
    return Math.round(vwapExtensionInAtr * 100) / 100;
}

export const hasRetracementFromPremarket = (symbol: string, isLong: boolean) => {
    let currentPrice = Models.getCurrentPrice(symbol);
    let symbolData = Models.getSymbolData(symbol);
    if (isLong) {
        return currentPrice < symbolData.premktHigh;
    } else {
        return currentPrice > symbolData.premktLow;
    }
}

export const checkWave = (showLogs: boolean) => {
    let wl = Models.getWatchlist();
    wl.forEach(element => {
        let symbol = element.symbol;
        let wave = countWaveSinceEntry(symbol);
        if (wave != 0 && showLogs) {
            Firestore.logInfo(`${symbol} wave: ${wave}`);
        }
    });
}
export const getFirstPullbackStatus = (symbol: string) => {
    let result = {
        status: 'not valid',
        pivot: 0,
    }
    let q = Models.getPositionNetQuantity(symbol);
    if (q == 0) {
        return result;
    }
    let isLong = q > 0;
    let lastEntryTime = Models.getLastEntryTime(symbol);
    if (!lastEntryTime) {
        return result;
    }
    // TODO: if after 9:45, use 5-min candles
    let candleStartTime = Helper.jsDateToTradingViewUTC(lastEntryTime);
    let candles = Models.getUndefinedCandleSinceTime(symbol, candleStartTime);
    if (candles.length == 0) {
        return result;
    }
    result.status = "not started";
    // check the first pullback start condition
    let i = 0;
    let highLowOfDay = isLong ? candles[0].high : candles[0].low;

    while (i + 1 < candles.length) {
        i = i + 1;
        let current = candles[i];
        let previous = candles[i - 1];
        if (isLong) {
            if (current.high > highLowOfDay) {
                highLowOfDay = current.high;
            }
            if (isLong && current.low < previous.low) {
                result.status = "in progress";
                result.pivot = current.low;
                break;
            }
        } else {
            if (current.low < highLowOfDay) {
                highLowOfDay = current.low;
            }
            if (!isLong && current.high > previous.high) {
                result.status = "in progress";
                result.pivot = current.high;
                break;
            }
        }
    }
    // check whether we break high/low of the day again
    while (i + 1 < candles.length) {
        i = i + 1;
        let current = candles[i];
        if (isLong) {
            if (current.low < result.pivot) {
                result.pivot = current.low;
            }
            if (current.high > highLowOfDay) {
                result.status = "recovered";
                break;
            }
        } else {
            if (current.high > result.pivot) {
                result.pivot = current.high;
            }
            if (current.low < highLowOfDay) {
                result.status = "recovered";
                break;
            }
        }
    }
    return result;
}
export const isPriceWorseThanVwap = (symbol: string, isLong: boolean, price: number) => {
    let vwap = Models.getCurrentVwap(symbol);
    if (isLong) {
        return price < vwap;
    } else {
        return price > vwap;
    }
}
export const isPriceWorseThanKeyLevel = (symbol: string, isLong: boolean,
    keyLevel: number, price: number) => {
    if (isLong) {
        return price < keyLevel;
    } else {
        return price > keyLevel;
    }
}

/**
 * closed one candle below the key level
 */
export const hasLostKeyLevel = (symbol: string, isLong: boolean, keyLevel: number) => {
    let candles = Models.getM1ClosedCandlesSinceOpen(symbol);
    if (candles.length == 0) {
        return false;
    }
    let i = 0;
    let breakoutCandle = null;
    while (i < candles.length && breakoutCandle == null) {
        let c = candles[i];
        if (isLong) {
            if (c.close >= keyLevel) {
                breakoutCandle = c;
            }
        } else {
            if (c.close <= keyLevel) {
                breakoutCandle = c;
            }
        }
        i++;
    }
    if (!breakoutCandle) {
        return false;
    }
    while (i < candles.length) {
        let c = candles[i];
        if (isLong) {
            if (c.close < keyLevel || c.low < breakoutCandle.low) {
                return true;
            }
        } else {
            if (c.close > keyLevel || c.high > breakoutCandle.high) {
                return true;
            }
        }
        i++;
    }

    return false;
}
export const countWaveSinceEntry = (symbol: string) => {
    let q = Models.getPositionNetQuantity(symbol);
    if (q == 0) {
        return 0;
    }
    let isLong = q > 0;
    let lastEntryTime = Models.getLastEntryTime(symbol);
    if (!lastEntryTime) {
        return 0;
    }

    let candleStartTime = Helper.jsDateToTradingViewUTC(lastEntryTime);
    let candles = Models.getUndefinedCandleSinceTime(symbol, candleStartTime);
    let currentDirectionIsLong = isLong;
    // wave 1
    let i = 0;
    let wave = 1;
    while (i + 1 < candles.length) {
        i = i + 1;
        let current = candles[i];
        let previous = candles[i - 1];
        if ((currentDirectionIsLong && current.low < previous.low) ||
            (!currentDirectionIsLong && current.high > previous.high)) {
            wave = 2;
            break;
        }
    }
    while (i + 1 < candles.length) {
        i = i + 1;
        let current = candles[i];
        let previous = candles[i - 1];
        if ((currentDirectionIsLong && current.high > previous.high) ||
            (!currentDirectionIsLong && current.low < previous.low)) {
            wave = 3;
            break;
        }
    }
    while (i + 1 < candles.length) {
        i = i + 1;
        let current = candles[i];
        let previous = candles[i - 1];
        if ((currentDirectionIsLong && current.low < previous.low) ||
            (!currentDirectionIsLong && current.high > previous.high)) {
            wave = 4;
            break;
        }
    }
    while (i + 1 < candles.length) {
        i = i + 1;
        let current = candles[i];
        let previous = candles[i - 1];
        if ((currentDirectionIsLong && current.high > previous.high) ||
            (!currentDirectionIsLong && current.low < previous.low)) {
            wave = 5;
            break;
        }
    }
    return wave;
}

export const hasLowerLow = (candles: Models.Candle[]) => {
    let previous = 0;
    let current = 1;
    while (current < candles.length) {
        if (candles[current].low < candles[previous].low) {
            return true;
        }
        previous++;
        current++;
    }
    return false;
}
export const hasHigherHigh = (candles: Models.Candle[]) => {
    let previous = 0;
    let current = 1;
    while (current < candles.length) {
        if (candles[current].high > candles[previous].high) {
            return true;
        }
        previous++;
        current++;
    }
    return false;
}

export const hasClosedOutsideVwap = (symbol: string, isLong: boolean) => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    if (candles.length <= 1) {
        // no closed candles yet
        return false;
    }
    let vwaps = Models.getVwapsSinceOpen(symbol);
    for (let i = 0; i < candles.length - 1; i++) {
        let c = candles[i].close;
        let v = vwaps[i].value;
        if ((isLong && c > v) ||
            (!isLong && c < v)) {
            return true;
        }
    }
    return false;
}

export const hasRetestLevel = (symbol: string, isLong: boolean) => {
    let openPrice = Models.getOpenPrice(symbol);
    if (!openPrice) {
        return false;
    }
    let plans = TradingPlans.getTradingPlans(symbol);
    if (TradingPlans.hasSingleMomentumLevel(plans)) {
        let keyLevel = TradingPlans.getSingleMomentumLevel(plans);
        let symbolData = Models.getSymbolData(symbol);
        if (isLong) {
            if (openPrice > keyLevel.high) {
                return symbolData.lowOfDay < keyLevel.high;
            } else {
                return openPrice > keyLevel.low && symbolData.lowOfDay < keyLevel.low;
            }
        } else {
            if (openPrice < keyLevel.low) {
                return symbolData.highOfDay > keyLevel.low;
            } else {
                return openPrice < keyLevel.high && symbolData.highOfDay > keyLevel.high;
            }
        }
    }
    return false;
}

export const hasPullbackToVwapBeforeOpen = (symbol: string, lookBackBarsCount: number) => {
    let time = Helper.getMarketOpenTime();
    let tvTime = Helper.jsDateToTradingViewUTC(time);
    let symbolData = Models.getSymbolData(symbol);
    let candles = Models.getUndefinedCandles(symbol);
    let vwap = symbolData.vwap;
    let candlesBeforeOpen: Models.CandlePlus[] = [];
    let vwapBeforeOpen: Models.LineSeriesData[] = [];
    for (let i = 0; i < candles.length; i++) {
        if (candles[i].time >= tvTime) {
            break;
        } else {
            candlesBeforeOpen.push(candles[i]);
            vwapBeforeOpen.push(vwap[i]);
        }
    }
    let begin = candlesBeforeOpen.length - lookBackBarsCount;
    let end = candlesBeforeOpen.length;
    for (let i = begin; i < end; i++) {
        let c = candlesBeforeOpen[i];
        let v = vwapBeforeOpen[i];
        if (c.low < v.value) {
            return true;
        }
    }
    return false;
}

export const isHigherLows = (candles: Models.Candle[], maxCount: number) => {
    let previousLow = candles[0].low;
    for (let i = 1; i < candles.length && i < maxCount; i++) {
        const c = candles[i];
        if (c.low < previousLow) {
            return false;
        }
        previousLow = c.low;
    }
    return true;
}

export const isLowerHighs = (candles: Models.Candle[], maxCount: number) => {
    let previousHigh = candles[0].high;
    for (let i = 1; i < candles.length && i < maxCount; i++) {
        const c = candles[i];
        if (c.high > previousHigh) {
            return false;
        }
        previousHigh = c.high;
    }
    return true;
}

export const getMinimumDistanceToVwap = (isLong: boolean, candle: Models.Candle, vwap: number) => {
    let price = isLong ? candle.low : candle.high;
    return getDirectionalDistanceToVwap(isLong, price, vwap);
}

export const getDirectionalDistanceToVwap = (isLong: boolean, price: number, vwap: number) => {
    if ((isLong && price <= vwap) || (!isLong && price >= vwap)) {
        return 0;
    }
    return Math.abs(price - vwap);
}

export const getFirstBreakoutCandle = (symbol: string, isLong: boolean, level: number) => {
    let candles = Models.getM1ClosedCandlesSinceOpen(symbol);
    for (let i = 0; i < candles.length; i++) {
        let c = candles[i];
        if (isLong) {
            if (c.close >= level) {
                return c;
            }
        } else {
            if (c.close <= level) {
                return c;
            }
        }
    }
    return null;
}
export const hasLevelRetest = (symbol: string, isLong: boolean, level: number) => {
    let symbolData = Models.getSymbolData(symbol);
    if (isLong) {
        return symbolData.lowOfDay <= level;
    } else {
        return symbolData.highOfDay >= level;
    }
}

export const hasApproachedTargetToAdd = (symbol: string, isLong: boolean) => {
    let symbolData = Models.getSymbolData(symbol);
    let maxDayLevel = isLong ? symbolData.highOfDay : symbolData.lowOfDay;
    let topPlan = TradingPlans.getTradingPlans(symbol);
    let targetToAdd = isLong ? topPlan.long.firstTargetToAdd : topPlan.short.firstTargetToAdd;
    if (targetToAdd <= 0) {
        return false;
    }
    let buffer = Models.getAtr(symbol).average * 0.1; // 10% of ATR buffer
    if (isLong) {
        return (maxDayLevel + buffer) >= targetToAdd;
    } else {
        return (maxDayLevel - buffer) <= targetToAdd;
    }
}

export const getFirstNewHighInFirstFiveMinutes = (symbol: string, isLong: boolean) => {
    let candles = Models.getM1ClosedCandlesSinceOpen(symbol);
    if (candles.length == 0 || candles.length >= 5) {
        return null;
    }
    let firstNewHigh = isLong ? candles[0].high : candles[0].low;
    let i = 1;
    for (i = 1; i < candles.length && i < 4; i++) {
        let c = candles[i];
        if (isLong) {
            if (c.high <= firstNewHigh) {
                firstNewHigh = c.high;
            } else {
                return null;
            }
        } else {
            if (c.low >= firstNewHigh) {
                firstNewHigh = c.low;
            } else {
                return null;
            }
        }
    }
    return firstNewHigh;
}