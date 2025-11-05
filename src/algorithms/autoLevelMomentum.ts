import * as Models from '../models/models';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Helper from '../utils/helper';
import * as Chart from '../ui/chart';
import * as Patterns from './patterns';

interface AlgoStateEntry {
    hasCrossedKeyLevelBeforeClose: boolean,
    hasCrossedKeyLevelOnClose: boolean,
}
interface AlgoState {
    statePerLevel: Map<string, AlgoStateEntry>
}
export let algoStateBySymbol = new Map<string, AlgoState>();

const getStateEntry = (symbol: string, name: string) => {
    let s = algoStateBySymbol.get(symbol);
    if (!s) {
        s = {
            statePerLevel: new Map<string, AlgoStateEntry>(),
        }
        algoStateBySymbol.set(symbol, s);
    }
    let entry = s.statePerLevel.get(name);
    if (!entry) {
        entry = {
            hasCrossedKeyLevelBeforeClose: false,
            hasCrossedKeyLevelOnClose: false,
        }
        s.statePerLevel.set(name, entry);
        return entry;
    } else {
        return entry;
    }
}

export const checkMomentumLevelBeforeClose = (symbol: string) => {
    let plans = TradingPlans.getTradingPlans(symbol);
    let openPrice = Models.getOpenPrice(symbol);
    if (!openPrice) {
        return;
    }
    if (TradingPlans.hasSingleMomentumLevel(plans)) {
        let keyLevel = TradingPlans.getSingleMomentumLevel(plans);
        checkMomentumLevelPerLevelBeforeClose(
            symbol, "key level", keyLevel.high, keyLevel.low, openPrice
        );
    } else if (TradingPlans.hasDualMomentumLevels(plans)) {
        let { levelHigh, levelLow } = TradingPlans.getDualMomentumLevels(plans);
        checkMomentumLevelPerLevelBeforeClose(
            symbol, "level high", levelHigh, levelHigh, openPrice
        );
        checkMomentumLevelPerLevelBeforeClose(
            symbol, "level low", levelLow, levelLow, openPrice
        );
    }
}

export const checkMomentumLevelPerLevelBeforeClose = (
    symbol: string, levelName: string,
    levelHigh: number, levelLow: number,
    openPrice: number) => {
    let stateEntry = getStateEntry(symbol, levelName);
    if (stateEntry.hasCrossedKeyLevelBeforeClose) {
        // already notified
        return;
    }
    let symbolData = Models.getSymbolData(symbol);
    let isOpenAbove = openPrice > levelHigh;
    let isOpenBelow = openPrice < levelLow;
    if ((isOpenAbove && symbolData.lowOfDay < levelLow) ||
        (isOpenBelow && symbolData.highOfDay > levelHigh)) {
        stateEntry.hasCrossedKeyLevelBeforeClose = true;
        Helper.speak(`${symbol} crossing ${levelName}`);
        Chart.blinkChart(symbol, false);
    }
}
export const checkMomentumLevelOnClose = (symbol: string, newlyClosedCandle: Models.CandlePlus,
    symbolData: Models.SymbolData) => {
    let openPrice = Models.getOpenPrice(symbol);
    if (!openPrice) {
        return;
    }
    let plans = TradingPlans.getTradingPlans(symbol);
    if (TradingPlans.hasSingleMomentumLevel(plans)) {
        let keyLevel = TradingPlans.getSingleMomentumLevel(plans);
        checkMomentumLevelPerLevelOnClose(
            symbol, "key level", keyLevel.high, keyLevel.low, openPrice, newlyClosedCandle, symbolData
        );
    } else if (TradingPlans.hasDualMomentumLevels(plans)) {
        let { levelHigh, levelLow } = TradingPlans.getDualMomentumLevels(plans);
        checkMomentumLevelPerLevelOnClose(
            symbol, "level high", levelHigh, levelHigh, openPrice, newlyClosedCandle, symbolData
        );
        checkMomentumLevelPerLevelOnClose(
            symbol, "level low", levelLow, levelLow, openPrice, newlyClosedCandle, symbolData
        );
    }

    /*
let currentVwap = Models.getCurrentVwap(symbol);
let isOpenAboveVwap = Models.openPriceIsAboveVwap(symbol);

checkMomentumLevelPerLevelOnClose(
    symbol, "vwap", currentVwap, isOpenAboveVwap, newlyClosedCandle, symbolData
);*/
}
export const checkMomentumLevelPerLevelOnClose = (
    symbol: string, levelName: string, levelHigh: number, levelLow: number,
    openPrice: number, newlyClosedCandle: Models.CandlePlus,
    symbolData: Models.SymbolData) => {
    let isOpenAbove = openPrice > levelHigh;
    let isOpenBelow = openPrice < levelLow;
    let stateEntry = getStateEntry(symbol, levelName);

    if (stateEntry.hasCrossedKeyLevelOnClose) {
        return;
    }
    if ((isOpenAbove && symbolData.lowOfDay < levelLow) ||
        (isOpenBelow && symbolData.highOfDay > levelHigh)) {
        stateEntry.hasCrossedKeyLevelOnClose = true;
        let startWithLong = isOpenAbove;
        let closedBeyondLevel = (isOpenAbove && newlyClosedCandle.close < levelLow) ||
            (isOpenBelow && newlyClosedCandle.close > levelHigh);
        if (closedBeyondLevel) {
            let breakout = startWithLong ? "break down" : "breakout";
            Helper.speak(`${symbol} closed outside ${levelName}, look for retest and next ${breakout}`);
            Chart.blinkChart(symbol, false);
        } else {
            let breakout = startWithLong ? "breakout" : "break down";
            Helper.speak(`${symbol} closed inside ${levelName}, potential false ${breakout}`);
            Chart.blinkChart(symbol, false);
        }
    }
}

/**
 * @returns reason why it's not allowed. empty string if it's allowed.
 */
export const getDisallowReasonForDualLevelMomentum = (symbol: string, isLong: boolean,
    entryPrice: number, stopLossPrice: number,
    keyLevelHigh: number, keyLevelLow: number, openPrice: number, openPriceIsAboveVwap: boolean,) => {
    if ((isLong && entryPrice < keyLevelHigh) || (!isLong && entryPrice > keyLevelLow)) {
        return `entry is inside level`;
    }
    if ((isLong && openPrice > keyLevelHigh) || (!isLong && openPrice < keyLevelLow)) {
        // open in momentum zone
        return "";
    } else {
        // open in opposite momentum zone or in between
        // need to wait for 1 minute close outside
        let candles = Models.getUndefinedCandlesSinceOpen(symbol);
        if (candles.length <= 1) {
            return "no closed candles";
        }
        let threshold = isLong ? keyLevelHigh : keyLevelLow;
        let hasClosedOutside = Patterns.hasClosedBeyondPrice(symbol, isLong, threshold);
        if (!hasClosedOutside) {
            return "no candles closed outside";
        }
        return "";
    }
}

export const hasClosedOutsideKeyLevel = (symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea) => {
    let threshold = isLong ? keyLevel.high : keyLevel.low;
    return Patterns.hasClosedBeyondPrice(symbol, isLong, threshold);
}
/**
 * @returns reason why it's not allowed. empty string if it's allowed.
 */
export const getDisallowReasonForSingleLevelMomentum = (symbol: string, isLong: boolean,
    entryPrice: number, stopLossPrice: number,
    keyLevel: TradingPlansModels.LevelArea, openPrice: number, openPriceIsAboveVwap: boolean,
    plan: TradingPlansModels.TradingPlans, logTags: Models.LogTags
) => {
    let isTradeDirectionAgainstOpenVwap = (isLong && !openPriceIsAboveVwap) ||
        (!isLong && openPriceIsAboveVwap);
    let isEntryMomentum = isEntryOutsideVwapAndKeyLevel(symbol, isLong, keyLevel, entryPrice);
    let moreThanMinimumTarget = isMoreThanMinimumTarget(isLong, keyLevel, entryPrice, stopLossPrice);
    let openScenario = "";
    let openScore = getOpenZoneScore(symbol, keyLevel);
    if ((isLong && openScore > 0) || (!isLong && openScore < 0)) {
        openScenario = "open in momentum zone"
        return isAllowedForOpenInMomentumZone(openScenario, isLong, entryPrice, keyLevel, plan, moreThanMinimumTarget);
    } else if ((isLong && openScore < 0) || (!isLong && openScore > 0)) {
        openScenario = "open in opposite momentum zone";
        return isAllowedForOpenInOppositeMomentumZone(openScenario, isEntryMomentum, symbol, isLong, keyLevel, plan);
    } else if (openScore == 0) {
        if ((isLong && openPrice < keyLevel.high && openPriceIsAboveVwap) ||
            (!isLong && openPrice > keyLevel.low && !openPriceIsAboveVwap)) {
            openScenario = "open in vwap momentum zone but inside key level";
            return isAllowedForOpenInVwapMomentumButInsideKeyLevel(openScenario, symbol, isLong, keyLevel, moreThanMinimumTarget, isEntryMomentum, plan);
        } else if ((isLong && openPrice > keyLevel.high && !openPriceIsAboveVwap) ||
            (!isLong && openPrice < keyLevel.low && openPriceIsAboveVwap)) {
            openScenario = "open outside key level but against vwap";
            return isAllowedForOpenOutsideKeyLevelButAgainstVwap(openScenario, symbol, isLong, entryPrice, keyLevel, plan);
        }
    }
    // edge case, not suppose to happen unless price is exactly equal to key level
    return `disallowed due to unexpected case ${openPrice}, ${keyLevel}`;
}

export const isAllowedForOpenInMomentumZone = (openScenario: string, isLong: boolean,
    entryPrice: number, keyLevel: TradingPlansModels.LevelArea,
    plan: TradingPlansModels.TradingPlans, moreThanMinimumTarget: boolean) => {
    /* 2025/3/3 IBIT mistake, plus I didn't write this in my tradebook
if (moreThanMinimumTarget) {
    return "";
}*/

    // if open with vwap momentum, it's ok to get back inside vwap for a bit.
    // expect reclaim vwap as long as the level is holding.
    if ((isLong && entryPrice < keyLevel.high) ||
        (!isLong && entryPrice > keyLevel.low)) {
        return `${openScenario}, but entry is not in momentum zone`;
    }

    return "";
}
/**
 * Allow after 1 candle closed outside of both key level and vwaps
 */
export const isAllowedForOpenInOppositeMomentumZone = (openScenario: string,
    isEntryMomentum: boolean,
    symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
    plan: TradingPlansModels.TradingPlans) => {
    if (!hasClosedOrOpenOutsideKeyLevel(symbol, isLong, keyLevel)) {
        return `${openScenario}, has not closed outside key level yet`;
    }
    if (!isEntryMomentum) {
        return `${openScenario}, but entry is not in momentum zone`;
    }
    let currentVwap = Models.getCurrentVwap(symbol);
    if ((isLong && currentVwap > keyLevel.high) ||
        (!isLong && currentVwap < keyLevel.low)) {
        // current vwap is not supporting key level, need to be careful with more rules
        // for now, require having 1 candle closed outside vwap
        let hasClosedOutsideVwap = Patterns.hasClosedOutsideVwap(symbol, isLong);
        if (hasClosedOutsideVwap) {
            return "";
        } else {
            return `${openScenario}, current vwap is not supporting key level and has not 1 candle closed outside vwap before`;
        }
    }

    // current vwap is already supporting key level,
    return "";
}
export const isAllowedForOpenInVwapMomentumButInsideKeyLevel = (openScenario: string,
    symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea, moreThanMinimumTarget: boolean,
    isEntryMomentum: boolean, plan: TradingPlansModels.TradingPlans) => {
    /*
    2025/3/3 IBIT mistake, took a scalp long and made me miss the best short.
        if (moreThanMinimumTarget) {
        return "";
    }*/
    if (!hasClosedOrOpenOutsideKeyLevel(symbol, isLong, keyLevel)) {
        return `${openScenario}, not closed outside key level yet`;
    }
    if (!isEntryMomentum) {
        return `${openScenario}, entry not in momentum zone`;
    }

    return "";
}
/**
 * Need to have a retest of key level
 * the best setup is after it retested the key level, either short the key level breakdown, 
 * or long when such short trades fail.
 * close above vwap is not a good setup, because it can chop around vwap, so delete it
 * it's ok to be against vwap, as long as it retested key level. 
 * also ok after make a opposite momentum move, then watch that false momentum move to get closer to key level
 */
export const isAllowedForOpenOutsideKeyLevelButAgainstVwap = (openScenario: string,
    symbol: string, isLong: boolean, entryPrice: number, keyLevelArea: TradingPlansModels.LevelArea,
    plan: TradingPlansModels.TradingPlans) => {
    let keyLevel = isLong ? keyLevelArea.high : keyLevelArea.low;
    if ((isLong && entryPrice < keyLevel) || (!isLong && entryPrice > keyLevel)) {
        return `${openScenario}, entry price is still inside key level`;
    }
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);

    // need to have a retest of key level
    let atr = plan.atr.average;
    let buffer = 0.03 * atr; // use 3% of ATR as buffer, previous 10% was too big.
    for (let i = 0; i < candles.length; i++) {
        let c = candles[i];
        let keyLevelWithBuffer = isLong ? keyLevel + buffer : keyLevel - buffer;
        if ((isLong && c.low < keyLevelWithBuffer) ||
            (!isLong && c.high > keyLevelWithBuffer)) {
            return "";
        }
    }

    // also ok after make a opposite momentum move, then watch that false momentum move to get closer to key level
    if ((isLong && Patterns.hasLowerLow(candles)) ||
        (!isLong && Patterns.hasHigherHigh(candles))) {
        return "";
    }



    return `${openScenario}, not retest key level yet. and not both false breakout`;
}
export const hasClosedOrOpenOutsideKeyLevel = (symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea) => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    if (candles.length <= 1) {
        // no closed candles yet
        return false;
    }
    for (let i = 0; i < candles.length - 1; i++) {
        let c = candles[i].close;
        let o = candles[i].open;
        if ((isLong && c > keyLevel.high) ||
            (!isLong && c < keyLevel.low)) {
            return true;
        }
        if ((isLong && o > keyLevel.high) ||
            (!isLong && o < keyLevel.low)) {
            return true;
        }
    }
    return false;
}

export const hasClosedOutsideBothKeyLevelAndVwap = (symbol: string, isLong: boolean,
    keyLevel: number) => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    if (candles.length <= 1) {
        // no closed candles yet
        return false;
    }
    let vwaps = Models.getVwapsSinceOpen(symbol);
    for (let i = 0; i < candles.length - 1; i++) {
        let c = candles[i].close;
        let v = vwaps[i].value;
        if ((isLong && c > keyLevel && c > v) ||
            (!isLong && c < keyLevel && c < v)) {
            return true;
        }
    }
    return false;
}

export const isPriceOutsideKeyLevel = (isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
    price: number) => {
    if (isLong) {
        return Patterns.isPriceOutsideLevel(isLong, price, keyLevel.high, false);
    } else {
        return Patterns.isPriceOutsideLevel(isLong, price, keyLevel.low, false);
    }
}
export const isEntryOutsideVwapAndKeyLevel = (symbol: string, isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
    entryPrice: number) => {
    if (!isPriceOutsideKeyLevel(isLong, keyLevel, entryPrice)) {
        return false;
    }

    let currentVwap = Models.getCurrentVwap(symbol);
    if (!Patterns.isPriceOutsideLevel(isLong, entryPrice, currentVwap, false)) {
        return false;
    }
    return true;
}
export const isMoreThanMinimumTarget = (isLong: boolean, keyLevel: TradingPlansModels.LevelArea,
    entryPrice: number, stopLossPrice: number) => {
    let risk = Math.abs(entryPrice - stopLossPrice);
    let minimumTarget = isLong ? (entryPrice + 0.5 * risk) : (entryPrice - 0.5 * risk);
    //  at least 0.5 R away from key level
    let moreThanMinimumTarget = (isLong && keyLevel.low > minimumTarget) ||
        (!isLong && keyLevel.high < minimumTarget);
    return moreThanMinimumTarget;
}




/**
 * 
 * @param symbol 
 * @returns +1 if open above both vwap and key level. -1 if open below both and 0 if open in between
 */
export const getOpenZoneScore = (symbol: string, keyLevel: TradingPlansModels.LevelArea) => {
    let open = Models.getOpenPrice(symbol);
    if (!open) {
        return 0;
    }
    let lastVWap = Models.getLastVwapBeforeOpen(symbol);
    if ((open >= keyLevel.high && keyLevel.high > lastVWap) || (open > Math.max(keyLevel.high, lastVWap))) {
        return 1;
    }
    if ((open <= keyLevel.low && keyLevel.low < lastVWap) || (open < Math.min(keyLevel.low, lastVWap))) {
        return -1;
    }
    return 0;
}