import * as Models from '../models/models';
import * as CamPivots from '../indicators/camPivots';

export const updateIndicators = (symbol: string, symbolData: Models.SymbolData, dailyCandles: Models.CandlePlus[]) => {
    if (!dailyCandles || dailyCandles.length === 0) {
        return;
    }
    updateAllTimeHigh(symbolData, dailyCandles);
    symbolData.previousDayCandle = dailyCandles[dailyCandles.length - 1];
    CamPivots.updateCamPivots(symbol, symbolData, dailyCandles);
}

export const updateAllTimeHigh = (symbolData: Models.SymbolData, dailyCandles: Models.CandlePlus[]) => {
    // Find the highest high across all daily candles
    let allTimeHigh = 0;
    for (let i = 0; i < dailyCandles.length; i++) {
        const candle = dailyCandles[i];
        if (candle.high > allTimeHigh) {
            allTimeHigh = candle.high;
        }
    }
    
    // Update symbolData with the calculated all-time high
    symbolData.allTimeHigh = allTimeHigh;
}
