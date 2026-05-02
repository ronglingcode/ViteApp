import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as Firestore from '../firestore';
import * as Models from '../models/models';
import * as Helper from '../utils/helper';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';

export const hasAtLeastOneReasonSet = (plan: TradingPlansModels.GapAndGoPlan, symbol: string): boolean => {
    const hasOne =
        !!plan.recentPullback ||
        !!plan.nearAboveConsolidationRange ||
        !!plan.nearBelowConsolidationRangeTop ||
        !!plan.nearPreviousKeyEventLevel ||
        !!plan.previousInsideDay ||
        !!plan.allTimeHigh;
    if (!hasOne) {
        Firestore.logError(`${symbol} missing one reason set for gap and go plan`);
        return false;
    }
    return true;
};

// Entry rules:
// 1. mustOpenAboveVwap — if the plan flag is set, the open price must be at or above VWAP at open
// 2. Min support — entry price must be at or above basePlan.support.low
// 3. 15-minute window — only allowed within the first 15 minutes after market open
// 4. VWAP reclaim consistency — if the stock opened below VWAP but has since reclaimed it, entry is blocked if the last two 1m candles both closed back below VWAP
// 5. Basic global entry rules — delegates to EntryRulesChecker.checkBasicGlobalEntryRules (standard size/risk checks)
// 6. Below-VWAP penalty — if entry price is currently below VWAP, allowed only if within support.low + 2 × ATR; if so, size is cut to 50%
export const validateEntry = (
    symbol: string,
    plan: TradingPlansModels.GapAndGoPlan,
    entryPrice: number,
    stopOutPrice: number,
    useMarketOrder: boolean,
    logTags: Models.LogTags,
): number => {
    let openPrice = Models.getOpenPrice(symbol);
    let openVwap = Models.getLastVwapBeforeOpen(symbol);
    if (plan.mustOpenAboveVwap) {
        if (openPrice == null || openVwap == null) {
            Firestore.logError(`mustOpenAboveVwap: need open price and VWAP at open`, logTags);
            return 0;
        }
        if (openPrice < openVwap) {
            Firestore.logError(`mustOpenAboveVwap: open ${openPrice} below VWAP at open ${openVwap}`, logTags);
            return 0;
        }
    }
    let minSupport = plan.support.low;
    if (entryPrice < minSupport) {
        Firestore.logError(`entry price ${entryPrice} is below min daily support ${minSupport}`, logTags);
        return 0;
    }
    let secondsSinceMarketOpen = Helper.getSecondsSinceMarketOpen(new Date());
    if (secondsSinceMarketOpen > 15 * 60) {
        Firestore.logError(`only allowed for first 15 minutes`, logTags);
        return 0;
    }
    // if open below vwap, once it gets above it, it cannot close 2 candles below vwap to lose momentum
    if (openPrice && openVwap && openPrice < openVwap) {
        let hasReclaimedVwap = false;
        let candles = Models.getM1ClosedCandlesSinceOpen(symbol);
        for (let i = 0; i < candles.length; i++) {
            let candle = candles[i];
            if (candle.close > openVwap) {
                hasReclaimedVwap = true;
                break;
            }
        }
        let lastTwoCandlesCloseBelowVwap = false;
        if (candles.length >= 2) {
            let lastCandle = candles[candles.length - 1];
            let prevCandle = candles[candles.length - 2];
            if (lastCandle.close < openVwap && prevCandle.close < openVwap) {
                lastTwoCandlesCloseBelowVwap = true;
            }
        }
        if (hasReclaimedVwap && lastTwoCandlesCloseBelowVwap) {
            Firestore.logError(`reclaimed vwap but now 2 candles closed below vwap, giving up M1`, logTags);
            return 0;
        }
    }
    let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
        symbol, true, entryPrice, stopOutPrice, useMarketOrder,
        plan, false, logTags);
    let currentVwap = Models.getCurrentVwap(symbol);
    if (entryPrice < currentVwap) {
        let notTooFar = minSupport + 2 * Models.getAtr(symbol).average;
        if (entryPrice > notTooFar) {
            Firestore.logError(`entry price ${entryPrice} is too far from min support ${minSupport} by more than 0.5 ATR at ${notTooFar}`, logTags);
            return 0;
        } else {
            return allowedSize * 0.5;
        }
    }
    return allowedSize;
};
