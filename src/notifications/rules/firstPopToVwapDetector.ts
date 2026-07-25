export interface FirstPopToVwapHistoricalBar {
    candleTime: number;
    timeMs: number;
    high: number;
    vwap: number;
}

export interface FirstPopToVwapState {
    eligible?: boolean;
    openingPrice?: number;
    openingVwap?: number;
    firstApproachAt?: number;
    firstApproachPrice?: number;
    firstApproachVwap?: number;
    notifiedAt?: number;
    positionReconciliationPending?: boolean;
    lastObservedCandleTime?: number;
    lastObservedCandleHigh?: number;
}

export interface FirstPopToVwapInput {
    nowMs: number;
    isRegularSession: boolean;
    hasOpenPrice: boolean;
    openingPrice: number;
    openingVwap: number;
    currentPrice: number;
    currentVwap: number;
    atr: number;
    netQuantity: number;
    currentCandleTime?: number;
    currentCandleHigh?: number;
    approachAtrMultiplier: number;
    positionReconciliationWindowMs: number;
}

export interface FirstPopToVwapHydrationInput extends FirstPopToVwapInput {
    historicalBars: FirstPopToVwapHistoricalBar[];
}

export interface FirstPopToVwapReconciliationInput {
    nowMs: number;
    netQuantity: number;
    longPositionOpenedAt?: number;
    positionReconciliationWindowMs: number;
}

export interface FirstPopToVwapDetectorResult {
    state: FirstPopToVwapState;
    shouldNotify: boolean;
    persist: boolean;
}

const withOpeningSnapshot = (
    state: FirstPopToVwapState,
    input: Pick<FirstPopToVwapInput, 'hasOpenPrice' | 'openingPrice' | 'openingVwap'>,
) => {
    if (state.eligible !== undefined ||
        !input.hasOpenPrice ||
        input.openingPrice <= 0 ||
        input.openingVwap <= 0) {
        return false;
    }

    state.openingPrice = input.openingPrice;
    state.openingVwap = input.openingVwap;
    state.eligible = input.openingPrice < input.openingVwap;
    return true;
};

const getApproachBuffer = (atr: number, approachAtrMultiplier: number) => {
    if (!Number.isFinite(atr) || atr <= 0 ||
        !Number.isFinite(approachAtrMultiplier) || approachAtrMultiplier <= 0) {
        return 0;
    }
    return atr * approachAtrMultiplier;
};

const updateLastObservedCandle = (
    state: FirstPopToVwapState,
    candleTime: number | undefined,
    candleHigh: number | undefined,
) => {
    if (candleTime === undefined || candleHigh === undefined || candleHigh <= 0) {
        return;
    }
    state.lastObservedCandleTime = candleTime;
    state.lastObservedCandleHigh = candleHigh;
};

export const hydrateFirstPopToVwapState = (
    previousState: FirstPopToVwapState,
    input: FirstPopToVwapHydrationInput,
): FirstPopToVwapDetectorResult => {
    const state = { ...previousState };
    let persist = withOpeningSnapshot(state, input);

    const lastHistoricalBar = input.historicalBars[input.historicalBars.length - 1];
    if (lastHistoricalBar) {
        updateLastObservedCandle(state, lastHistoricalBar.candleTime, lastHistoricalBar.high);
    } else {
        updateLastObservedCandle(state, input.currentCandleTime, input.currentCandleHigh);
    }

    if (!state.eligible || state.firstApproachAt !== undefined) {
        return { state, shouldNotify: false, persist };
    }

    const buffer = getApproachBuffer(input.atr, input.approachAtrMultiplier);
    if (buffer <= 0) {
        return { state, shouldNotify: false, persist };
    }

    const approach = input.historicalBars.find(bar =>
        bar.vwap > 0 && bar.high >= bar.vwap - buffer
    );
    if (!approach) {
        return { state, shouldNotify: false, persist };
    }

    state.firstApproachAt = approach.timeMs;
    state.firstApproachPrice = approach.high;
    state.firstApproachVwap = approach.vwap;
    state.positionReconciliationPending = false;
    persist = true;
    return { state, shouldNotify: false, persist };
};

export const evaluateFirstPopToVwap = (
    previousState: FirstPopToVwapState,
    input: FirstPopToVwapInput,
): FirstPopToVwapDetectorResult => {
    const state = { ...previousState };
    let persist = withOpeningSnapshot(state, input);

    const candleChanged = input.currentCandleTime !== undefined &&
        input.currentCandleTime !== state.lastObservedCandleTime;
    const candleMadeNewHigh = input.currentCandleHigh !== undefined &&
        (candleChanged ||
            state.lastObservedCandleHigh === undefined ||
            input.currentCandleHigh > state.lastObservedCandleHigh);
    const observedPrice = candleMadeNewHigh
        ? Math.max(input.currentPrice, input.currentCandleHigh ?? 0)
        : input.currentPrice;

    updateLastObservedCandle(state, input.currentCandleTime, input.currentCandleHigh);

    if (state.firstApproachAt !== undefined) {
        if (state.positionReconciliationPending &&
            input.nowMs - state.firstApproachAt > input.positionReconciliationWindowMs) {
            state.positionReconciliationPending = false;
            persist = true;
        }
        return { state, shouldNotify: false, persist };
    }

    if (!input.isRegularSession ||
        !state.eligible ||
        input.currentVwap <= 0 ||
        observedPrice <= 0) {
        return { state, shouldNotify: false, persist };
    }

    const buffer = getApproachBuffer(input.atr, input.approachAtrMultiplier);
    if (buffer <= 0 || observedPrice < input.currentVwap - buffer) {
        return { state, shouldNotify: false, persist };
    }

    state.firstApproachAt = input.nowMs;
    state.firstApproachPrice = observedPrice;
    state.firstApproachVwap = input.currentVwap;
    state.positionReconciliationPending = input.netQuantity <= 0;
    if (input.netQuantity > 0) {
        state.notifiedAt = input.nowMs;
    }

    return {
        state,
        shouldNotify: input.netQuantity > 0,
        persist: true,
    };
};

export const reconcileFirstPopToVwapPosition = (
    previousState: FirstPopToVwapState,
    input: FirstPopToVwapReconciliationInput,
): FirstPopToVwapDetectorResult => {
    const state = { ...previousState };
    if (state.notifiedAt !== undefined ||
        !state.positionReconciliationPending ||
        state.firstApproachAt === undefined) {
        return { state, shouldNotify: false, persist: false };
    }

    if (input.nowMs - state.firstApproachAt > input.positionReconciliationWindowMs) {
        state.positionReconciliationPending = false;
        return { state, shouldNotify: false, persist: true };
    }

    if (input.netQuantity <= 0) {
        return { state, shouldNotify: false, persist: false };
    }

    state.positionReconciliationPending = false;
    if (input.longPositionOpenedAt === undefined ||
        input.longPositionOpenedAt > state.firstApproachAt) {
        return { state, shouldNotify: false, persist: true };
    }

    state.notifiedAt = input.nowMs;
    return { state, shouldNotify: true, persist: true };
};
