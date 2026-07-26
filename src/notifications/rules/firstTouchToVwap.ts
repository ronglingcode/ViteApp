import * as GlobalSettings from '../../config/globalSettings';
import * as Models from '../../models/models';
import * as TradingState from '../../models/tradingState';
import type {
    NotificationRule,
    NotificationRuleResult,
} from '../types';

interface FirstVwapTouchState {
    positionKey?: string;
    alertedPositionKey?: string;
    entryPrice?: number;
    entryVwap?: number;
    isLong?: boolean;
}

interface CurrentPosition {
    positionKey: string;
    entryPrice: number;
    entryVwap: number;
    isLong: boolean;
}

const ruleId = 'first-vwap-touch-after-entry-away-from-vwap';

const getVwapAtOrBefore = (symbol: string, time: number) => {
    const vwaps = Models.getSymbolData(symbol).m1Vwaps;
    let result = 0;
    for (const vwap of vwaps) {
        if (vwap.time > time) {
            break;
        }
        result = vwap.value;
    }
    return result;
};

const getCurrentPosition = (symbol: string): CurrentPosition | undefined => {
    const netQuantity = Models.getPositionNetQuantity(symbol);
    if (netQuantity === 0) {
        return;
    }

    const isLong = netQuantity > 0;
    const trade = Models.getCurrentOpenTrade(symbol);
    if (!trade || trade.isLong !== isLong || trade.entries.length === 0) {
        return;
    }

    const firstFill = trade.entries.reduce((earliest, entry) =>
        entry.time < earliest.time ? entry : earliest,
    );
    const breakoutState = TradingState.getBreakoutTradeState(symbol, isLong);
    const entryPrice = breakoutState.entryPrice || firstFill.price;
    const entryVwap = getVwapAtOrBefore(symbol, firstFill.tradingViewTime);
    if (entryPrice <= 0 || entryVwap <= 0) {
        return;
    }

    return {
        positionKey: [
            isLong ? 'long' : 'short',
            firstFill.time.getTime(),
            firstFill.price,
            firstFill.quantity,
        ].join(':'),
        entryPrice,
        entryVwap,
        isLong,
    };
};

const evaluate = (
    symbol: string,
    currentPrice: number,
    state: FirstVwapTouchState,
): NotificationRuleResult<FirstVwapTouchState> => {
    if (!GlobalSettings.notificationSettings.firstTouchToVwap.enabled) {
        return { state };
    }

    const position = getCurrentPosition(symbol);
    if (!position) {
        return { state };
    }

    const isNewPosition = state.positionKey !== position.positionKey;
    const positionState: FirstVwapTouchState = isNewPosition
        ? {
            ...position,
        }
        : state;

    const enteredAwayFromVwap = position.isLong
        ? position.entryPrice < position.entryVwap
        : position.entryPrice > position.entryVwap;
    const currentVwap = Models.getCurrentVwap(symbol);
    const touchedVwap = currentVwap > 0 && (position.isLong
        ? currentPrice >= currentVwap
        : currentPrice <= currentVwap);

    const alreadyAlerted =
        positionState.alertedPositionKey === position.positionKey;
    if (!enteredAwayFromVwap || alreadyAlerted || !touchedVwap) {
        return {
            state: positionState,
            persist: isNewPosition,
        };
    }

    const notifiedState: FirstVwapTouchState = {
        ...positionState,
        alertedPositionKey: position.positionKey,
    };
    const direction = position.isLong ? 'long' : 'short';
    const entryRelation = position.isLong ? 'below' : 'above';
    const article = position.isLong ? 'a' : 'an';
    const approach = position.isLong ? 'pop' : 'dip';
    return {
        state: notifiedState,
        persist: true,
        notification: {
            ruleId,
            symbol,
            message: `First ${approach} to VWAP after ${article} ${entryRelation}-VWAP ${direction} entry at ${position.entryPrice}. Manage the ${direction} at this make-or-break level.`,
            speechMessage: `${symbol}, first ${approach} to V WAP after ${article} ${entryRelation} V WAP ${direction} entry. Make or break. Manage the ${direction}.`,
        },
    };
};

export const firstTouchToVwapRule: NotificationRule<FirstVwapTouchState> = {
    id: ruleId,
    createInitialState: () => ({}),
    evaluate,
};
