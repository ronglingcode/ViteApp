import * as Models from '../models/models';
import * as TradingState from '../models/tradingState';
import * as Firestore from '../firestore';
import * as Helper from '../utils/helper';

// Runtime-only interval handles (not persisted)
const remindIntervals = new Map<string, ReturnType<typeof setInterval>>();

const disciplineKey = (symbol: string, isLong: boolean) => `${symbol}-${isLong ? 'L' : 'S'}`;

export const checkAndUpdatePhase = (symbol: string, isLong: boolean) => {
    const bts = TradingState.getBreakoutTradeState(symbol, isLong);
    if (!bts.hasValue) return;

    // Treat missing field from older persisted state as idle
    if (!bts.stopTightenPhase) {
        bts.stopTightenPhase = 'idle';
    }

    const currentQty = Math.abs(Models.getPositionNetQuantity(symbol));
    if (currentQty === 0) {
        clearReminder(symbol, isLong);
        return;
    }

    const initialQty = bts.initialQuantity;
    if (initialQty <= 0) return;

    // Re-check 'done' state: adding back partials can push more than half back to loose stop
    if (bts.stopTightenPhase === 'done') {
        if (!isStopTightenedEnough(symbol, isLong, currentQty, initialQty)) {
            bts.stopTightenPhase = 'needs_tighten';
            startReminder(symbol, isLong);
            triggerReminder(symbol, isLong, currentQty, initialQty);
        }
        return;
    }

    if (bts.stopTightenPhase === 'needs_tighten') {
        if (isStopTightenedEnough(symbol, isLong, currentQty, initialQty)) {
            bts.stopTightenPhase = 'done';
            clearReminder(symbol, isLong);
            Firestore.logInfo(`${symbol}: stop tightened. discipline complete.`);
            return;
        }
        triggerReminder(symbol, isLong, currentQty, initialQty);
        return;
    }

    // idle: check if partials threshold crossed (current < 90% of initial)
    if (currentQty < initialQty * 0.90) {
        bts.stopTightenPhase = 'needs_tighten';
        startReminder(symbol, isLong);
        triggerReminder(symbol, isLong, currentQty, initialQty);
    }
};

// Stop is tightened for a long when its stop price > lowOfDay (short: stop < highOfDay).
// We need enough shares tightened: at least (currentQty - initialQty * 0.5) shares.
const isStopTightenedEnough = (
    symbol: string, isLong: boolean, currentQty: number, initialQty: number,
): boolean => {
    const symbolData = Models.getSymbolData(symbol);
    const pairs = Models.getExitOrdersPairs(symbol);
    const requiredTightenedQty = Math.max(0, currentQty - initialQty * 0.5);
    if (requiredTightenedQty === 0) return true;

    let tightenedQty = 0;
    for (const pair of pairs) {
        if (pair.STOP?.price !== undefined) {
            const isTightened = isLong
                ? pair.STOP.price > symbolData.lowOfDay
                : pair.STOP.price < symbolData.highOfDay;
            if (isTightened) {
                tightenedQty += pair.STOP.quantity;
            }
        }
    }
    return tightenedQty >= requiredTightenedQty;
};

const blinkAllChartsRed = (symbol: string) => {
    const charts = Models.getChartsHtmlInAllTimeframes(symbol);
    for (const chart of charts) {
        const a = setInterval(() => {
            if (chart.style.backgroundColor !== 'red') {
                chart.style.backgroundColor = 'red';
            } else {
                chart.style.backgroundColor = '';
            }
        }, 300);
        setTimeout(() => {
            clearInterval(a);
            chart.style.backgroundColor = '';
        }, 10_000);
    }
};

const triggerReminder = (
    symbol: string, _isLong: boolean, currentQty: number, initialQty: number,
) => {
    const neededShares = Math.max(0, currentQty - Math.floor(initialQty * 0.5));
    if (neededShares > 1) {
        const msg = `${symbol}: TIGHTEN STOP - check bookmap levels, raise stop for ${neededShares} shares`;
        blinkAllChartsRed(symbol);
        Firestore.addToLogView(`⚠️ ${msg}`, 'Error');
        Helper.speak('tighten your stop using bookmap levels');
    }
};

const startReminder = (symbol: string, isLong: boolean) => {
    const k = disciplineKey(symbol, isLong);
    if (remindIntervals.has(k)) return;
    const id = setInterval(() => checkAndUpdatePhase(symbol, isLong), 20_000);
    remindIntervals.set(k, id);
};

const clearReminder = (symbol: string, isLong: boolean) => {
    const k = disciplineKey(symbol, isLong);
    const id = remindIntervals.get(k);
    if (id !== undefined) {
        clearInterval(id);
        remindIntervals.delete(k);
    }
};

export const getPhase = (symbol: string, isLong: boolean): Models.BreakoutTradeState['stopTightenPhase'] => {
    return TradingState.getBreakoutTradeState(symbol, isLong).stopTightenPhase;
};

// Global periodic check: catches new partials even without an explicit hook.
// Runs every 30s across all symbols with an open position.
setInterval(() => {
    const watchlist = Models.getWatchlist();
    for (const w of watchlist) {
        const qty = Models.getPositionNetQuantity(w.symbol);
        if (qty > 0) checkAndUpdatePhase(w.symbol, true);
        else if (qty < 0) checkAndUpdatePhase(w.symbol, false);
    }
}, 30_000);
