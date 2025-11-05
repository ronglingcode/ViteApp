import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as Helper from './helper';
import * as DB from '../data/db';

export interface ThresholdValidatorConfig {
    symbol: string;
    isLong: boolean;
    entryPrice: number;
    keyLevel: {
        high: number;
        low: number;
    };
}

export function validateEntryThreshold(config: ThresholdValidatorConfig, logTags: Models.LogTags): boolean {
    const { symbol, isLong, entryPrice, keyLevel } = config;
    const seconds = Helper.getSecondsSinceMarketOpen(new Date());
    const candles = Models.getUndefinedCandlesSinceOpen(symbol);
    let threshold = isLong ? candles[0].high : candles[0].low;
    let keyLevelThreshold = isLong ? keyLevel.high : keyLevel.low;
    if (entryIsLessThanThreshold(entryPrice, keyLevelThreshold, isLong)) {
        Firestore.logError(`entry inside key level`, logTags);
        return false;
    }

    /**
     * sometimes it's too far to take 1 minute ORB, it's better to take a breakout before that
     * using tight stop after a pullback. It may not be based on a closed candle. 
     */
    // TODO: make it work with 5 minute time frame chart
    return true;

    if (60 <= seconds && seconds < 120) {
        if (entryIsLessThanThreshold(entryPrice, threshold, isLong)) {
            Firestore.logError(`entry at least use 1-minute ORB, threshold: ${threshold}`, logTags);
            return false;
        }
    } else if (120 <= seconds && seconds < 5 * 60) {
        for (let i = 1; i < candles.length - 1; i++) {
            let thresholdCandidate = isLong ? candles[i].high : candles[i].low;
            if ((isLong && thresholdCandidate < threshold && thresholdCandidate >= keyLevel.high) ||
                (!isLong && thresholdCandidate > threshold && thresholdCandidate <= keyLevel.low)) {
                threshold = thresholdCandidate;
            }
        }
        if (entryIsLessThanThreshold(entryPrice, threshold, isLong)) {
            Firestore.logError(`entry at least first new high/low for first 5 minutes, threshold: ${threshold}`, logTags);
            return false;
        }
    } else if (5 * 60 <= seconds && Models.getUsedTimeframe() == 1) {
        // allow if already breakout 1-minute ORB
        let orbCandle = candles[0];
        let symbolData = Models.getSymbolData(symbol);
        if ((isLong && symbolData.highOfDay > orbCandle.high) ||
            (!isLong && symbolData.lowOfDay < orbCandle.low)) {
            return true;
        }
        let m5Candles = Models.aggregateCandles(candles, 5);
        let m5Threshold = isLong ? m5Candles[0].high : m5Candles[0].low;
        for (let i = 1; i < m5Candles.length - 1; i++) {
            let m5ThresholdCandidate = isLong ? m5Candles[i].high : m5Candles[i].low;
            if ((isLong && m5ThresholdCandidate < m5Threshold && m5ThresholdCandidate >= keyLevel.high) ||
                (!isLong && m5ThresholdCandidate > m5Threshold && m5ThresholdCandidate <= keyLevel.low)) {
                m5Threshold = m5ThresholdCandidate;
            }
        }
        if (entryIsLessThanThreshold(entryPrice, m5Threshold, isLong)) {
            Firestore.logInfo(`entry at least first new high/low on 5-minute chart, threshold: ${m5Threshold}`, logTags);
            Helper.speak(`use 5-minute breakout level`);
            return false;
        }
    }
    return true;
}

export function entryIsLessThanThreshold(entryPrice: number, threshold: number, isLong: boolean): boolean {
    return (isLong && entryPrice < threshold) || (!isLong && entryPrice > threshold);
} 