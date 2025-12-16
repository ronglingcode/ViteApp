import * as Models from '../models/models';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
/**
 * After 5 minutes, whether the first 5 minute is consistent higher lows
 */
export const getFeatures = (symbol: string) => {
    let results = checkPremarketHighBreakoutAndHold(symbol);
    return results;
}

export const checkPremarketHighBreakoutAndHold = (symbol: string) => {
    let tradingPlans = TradingPlans.getTradingPlans(symbol);
    let levels = tradingPlans.analysis.singleMomentumKeyLevel;
    if (levels.length < 0) {
        return "";
    }
    let high = levels[0].high;
    let low = levels[0].low;
    let openPrice = Models.getOpenPrice(symbol);
    let symbolData = Models.getSymbolData(symbol);
    if (high >= symbolData.premktHigh) {
        return "";
    }

    let candles = Models.getM1ClosedCandlesSinceOpen(symbol);
    if (candles.length < 2) {
        return "";
    }
    if (candles[candles.length-1].close >= symbolData.premktHigh &&
        candles[candles.length-2].close >= symbolData.premktHigh) {
        // TODO: draw the low of pullback to pm high
        return "hold above pm high";
    }
    return "";
}