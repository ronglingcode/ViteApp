import * as Helper from '../utils/helper';
import * as Models from '../models/models';
export const calculateCamPivots = (symbol: string, prevHigh: number, prevLow: number, prevClose: number) => {
    const multiplier = 1.1;
    const range = (prevHigh - prevLow) * multiplier;
  
    // Core Camarilla levels
    const R1 = prevClose + range / 12;
    const R2 = prevClose + range / 6;
    const R3 = prevClose + range / 4;
    const R4 = prevClose + range / 2;
  
    const S1 = prevClose - range / 12;
    const S2 = prevClose - range / 6;
    const S3 = prevClose - range / 4;
    const S4 = prevClose - range / 2;
  
    // Linear extension step (commonly used)
    const step = R4 - R3;
  
    const R5 = R4 + step;
    const R6 = R5 + step;
  
    const S5 = S4 - step;
    const S6 = S5 - step;
  
    let pivots: Models.CamarillaPivots = {
        R1: Helper.roundPrice(symbol, R1),
        R2: Helper.roundPrice(symbol, R2),
        R3: Helper.roundPrice(symbol, R3),
        R4: Helper.roundPrice(symbol, R4),
        R5: Helper.roundPrice(symbol, R5),
        R6: Helper.roundPrice(symbol, R6),
        S1: Helper.roundPrice(symbol, S1),
        S2: Helper.roundPrice(symbol, S2),
        S3: Helper.roundPrice(symbol, S3),
        S4: Helper.roundPrice(symbol, S4),
        S5: Helper.roundPrice(symbol, S5),
        S6: Helper.roundPrice(symbol, S6),
    }
    return pivots;
  };
  
export const updateCamPivots = (symbol: string, symbolData: Models.SymbolData, dailyCandles: Models.Candle[]) => {
    // Need at least one daily candle to calculate pivots
    if (!dailyCandles || dailyCandles.length === 0) {
        return;
    }
    
    // Get the most recent daily candle (should be yesterday's candle)
    // Daily candles are sorted by time, so the last one is the most recent
    const prevDayCandle = dailyCandles[dailyCandles.length - 1];
    
    // Extract high, low, and close from previous day's candle
    const prevHigh = prevDayCandle.high;
    const prevLow = prevDayCandle.low;
    const prevClose = prevDayCandle.close;
    
    // Calculate Camarilla pivots using the previous day's data
    const pivots = calculateCamPivots(symbol, prevHigh, prevLow, prevClose);
    
    // Update symbolData with the calculated pivots
    symbolData.camPivots = pivots;
}