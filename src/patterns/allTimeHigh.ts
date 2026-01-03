import * as Models from '../models/models';
export const getPatterns = (symbol: string) => {
    let symbolData = Models.getSymbolData(symbol);
    let allTimeHigh = symbolData.allTimeHigh;
    let openAboveAllTimeHigh = false;
    let openPrice = Models.getOpenPrice(symbol);
    if (openPrice && openPrice > allTimeHigh) {
        openAboveAllTimeHigh = true;
    }
    let candles = Models.getM1ClosedCandlesSinceOpen(symbol);
    let closedAboveAllTimeHigh = false;
    for (let i = 0; i < candles.length; i++) {
        let c = candles[i];
        if (c.close > allTimeHigh) {
            closedAboveAllTimeHigh = true;
            break;
        }
    }
    return {
        openAboveAllTimeHigh: openAboveAllTimeHigh,
        closedAboveAllTimeHigh: closedAboveAllTimeHigh
    }
}