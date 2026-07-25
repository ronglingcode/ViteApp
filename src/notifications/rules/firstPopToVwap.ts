import * as GlobalSettings from '../../config/globalSettings';
import type * as Models from '../../models/models';
import type {
    NotificationContext,
    NotificationRule,
    TradingNotification,
} from '../types';
import {
    evaluateFirstPopToVwap,
    hydrateFirstPopToVwapState,
    reconcileFirstPopToVwapPosition,
    type FirstPopToVwapHistoricalBar,
    type FirstPopToVwapInput,
    type FirstPopToVwapState,
} from './firstPopToVwapDetector';

export const firstPopToVwapRuleId = 'first-pop-to-vwap-from-below';

const getCandleTime = (candle: Models.CandlePlus) => Number(candle.time);

const getCandleTimeMs = (candle: Models.CandlePlus) => {
    if (candle.datetime > 0) {
        return candle.datetime;
    }
    return getCandleTime(candle) * 1000;
};

const getHistoricalBars = (
    context: NotificationContext,
    includeCurrentCandle: boolean,
): FirstPopToVwapHistoricalBar[] => {
    const vwapsByTime = new Map<number, number>();
    context.vwapsSinceOpen.forEach(vwap => {
        vwapsByTime.set(Number(vwap.time), vwap.value);
    });

    const candleCount = includeCurrentCandle
        ? context.candlesSinceOpen.length
        : Math.max(0, context.candlesSinceOpen.length - 1);
    const result: FirstPopToVwapHistoricalBar[] = [];
    for (let i = 0; i < candleCount; i++) {
        const candle = context.candlesSinceOpen[i];
        const candleTime = getCandleTime(candle);
        const vwap = vwapsByTime.get(candleTime);
        if (vwap === undefined) {
            continue;
        }
        result.push({
            candleTime,
            timeMs: getCandleTimeMs(candle),
            high: candle.high,
            vwap,
        });
    }
    return result;
};

const toDetectorInput = (context: NotificationContext): FirstPopToVwapInput => {
    const settings = GlobalSettings.notificationSettings.firstPopToVwap;
    return {
        nowMs: context.now.getTime(),
        isRegularSession: context.isRegularSession,
        hasOpenPrice: context.hasOpenPrice,
        openingPrice: context.openingPrice,
        openingVwap: context.openingVwap,
        currentPrice: context.currentPrice,
        currentVwap: context.currentVwap,
        atr: context.atr,
        netQuantity: context.netQuantity,
        currentCandleTime: context.currentCandle
            ? Number(context.currentCandle.time)
            : undefined,
        currentCandleHigh: context.currentCandle?.high,
        approachAtrMultiplier: settings.approachAtrMultiplier,
        positionReconciliationWindowMs: settings.positionReconciliationWindowMs,
    };
};

const buildNotification = (
    context: NotificationContext,
    state: FirstPopToVwapState,
): TradingNotification => {
    const approachPrice = state.firstApproachPrice ?? context.currentPrice;
    const approachVwap = state.firstApproachVwap ?? context.currentVwap;
    return {
        id: `${context.sessionDate}:${firstPopToVwapRuleId}:${context.symbol}`,
        ruleId: firstPopToVwapRuleId,
        symbol: context.symbol,
        title: `${context.symbol} — FIRST POP TO VWAP`,
        message: 'Opened below VWAP. This rally is at the make-or-break level. Manage the long; only re-add after a confirmed VWAP reclaim.',
        speechMessage: `${context.symbol}, first pop to V WAP. Make or break. Manage the long.`,
        severity: 'warning',
        occurredAt: state.firstApproachAt ?? context.now.getTime(),
        details: {
            openingPrice: state.openingPrice ?? context.openingPrice,
            openingVwap: state.openingVwap ?? context.openingVwap,
            approachPrice,
            approachVwap,
        },
    };
};

export const firstPopToVwapRule: NotificationRule<FirstPopToVwapState> = {
    id: firstPopToVwapRuleId,
    createInitialState: () => ({}),
    hydrate: (context, state, includeCurrentCandle) => {
        const result = hydrateFirstPopToVwapState(state, {
            ...toDetectorInput(context),
            historicalBars: getHistoricalBars(context, includeCurrentCandle),
        });
        return {
            state: result.state,
            persist: result.persist,
        };
    },
    evaluate: (context, state) => {
        if (!GlobalSettings.notificationSettings.firstPopToVwap.enabled) {
            return { state };
        }
        const result = evaluateFirstPopToVwap(state, toDetectorInput(context));
        return {
            state: result.state,
            notification: result.shouldNotify
                ? buildNotification(context, result.state)
                : undefined,
            persist: result.persist,
        };
    },
    reconcilePosition: (context, state) => {
        const settings = GlobalSettings.notificationSettings.firstPopToVwap;
        if (!settings.enabled) {
            return { state };
        }
        const result = reconcileFirstPopToVwapPosition(state, {
            nowMs: context.now.getTime(),
            netQuantity: context.netQuantity,
            longPositionOpenedAt: context.longPositionOpenedAt,
            positionReconciliationWindowMs: settings.positionReconciliationWindowMs,
        });
        return {
            state: result.state,
            notification: result.shouldNotify
                ? buildNotification(context, result.state)
                : undefined,
            persist: result.persist,
        };
    },
};
