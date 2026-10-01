import { calculateCamPivots as calculateCoreCamPivots } from '../trading/core/marketdata/levels.ts';
import * as Helper from '../utils/helper';
import * as Models from '../models/models';
export const calculateCamPivots = (symbol: string, prevHigh: number, prevLow: number, prevClose: number) =>
    calculateCoreCamPivots(prevHigh, prevLow, prevClose, value => Helper.roundPrice(symbol, value));
export const updateCamPivots = (symbol: string, symbolData: Models.SymbolData, dailyCandles: Models.Candle[]) => {
    // Need at least one daily candle to calculate pivots
    if (!dailyCandles || dailyCandles.length === 0) {
        console.log(`[CamPivots] ${symbol}: no daily candles available, skipping`);
        return;
    }

    // Get the most recent daily candle (should be yesterday's candle)
    // Daily candles are sorted by time, so the last one is the most recent
    const prevDayCandle = dailyCandles[dailyCandles.length - 1];

    // Extract high, low, and close from previous day's candle
    const prevHigh = prevDayCandle.high;
    const prevLow = prevDayCandle.low;
    const prevClose = prevDayCandle.close;

    console.log(`[CamPivots] ${symbol}: prevDay H=${prevHigh} L=${prevLow} C=${prevClose} (${dailyCandles.length} daily candles)`);

    // Calculate Camarilla pivots using the previous day's data
    const pivots = calculateCamPivots(symbol, prevHigh, prevLow, prevClose);

    console.log(`[CamPivots] ${symbol}: R3=${pivots.R3} R4=${pivots.R4} S3=${pivots.S3} S4=${pivots.S4}`);

    // Update symbolData with the calculated pivots
    symbolData.camPivots = pivots;
}