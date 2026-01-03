import * as Models from '../models/models';
import * as CamPivots from '../indicators/camPivots';

export const updateIndicators = (symbol: string, symbolData: Models.SymbolData, dailyCandles: Models.Candle[]) => {
    updateAllTimeHigh(symbolData, dailyCandles);
    CamPivots.updateCamPivots(symbol, symbolData, dailyCandles);
}

export const updateAllTimeHigh = (symbolData: Models.SymbolData, dailyCandles: Models.Candle[]) => {
    // Need at least one daily candle to calculate all-time high
    if (!dailyCandles || dailyCandles.length === 0) {
        return;
    }
    
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