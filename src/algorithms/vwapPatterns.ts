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