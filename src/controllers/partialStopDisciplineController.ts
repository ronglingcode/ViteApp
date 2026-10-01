import { stopDiscipline } from '../trading/core/controllers/workflows.ts';
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

    const data = Models.getSymbolData(symbol);
    const previous = bts.stopTightenPhase;
    const decision = stopDiscipline(previous, currentQty, initialQty, isLong, Models.getExitOrdersPairs(symbol), data.lowOfDay, data.highOfDay);
    bts.stopTightenPhase = decision.phase as Models.BreakoutTradeState['stopTightenPhase'];
    if (decision.phase === 'done') {
        clearReminder(symbol, isLong);
        if (previous !== 'done') Firestore.logInfo(`${symbol}: stop tightened. discipline complete.`);
    } else if (decision.phase === 'needs_tighten') {
        startReminder(symbol, isLong);
        if (decision.remind) triggerReminder(symbol, isLong, currentQty, initialQty);
    }
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
