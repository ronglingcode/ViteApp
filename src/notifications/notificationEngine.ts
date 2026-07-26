import * as Firestore from '../firestore';
import { AudioHelper } from '../utils/audioHelper';
import * as Helper from '../utils/helper';
import { firstTouchToVwapRule } from './rules/firstTouchToVwap';
import type {
    NotificationRule,
    NotificationRuleResult,
    TradingNotification,
} from './types';

const rules: NotificationRule<any>[] = [
    firstTouchToVwapRule,
];
const stateByRuleAndSymbol = new Map<string, unknown>();
const storagePrefix = 'tradingscripts.notification';

const getStateKey = (ruleId: string, symbol: string) =>
    `${ruleId}:${symbol}`;

const getStorageKey = (ruleId: string, symbol: string) =>
    `${storagePrefix}.${getStateKey(ruleId, symbol)}`;

const dispatchTradingNotification = (notification: TradingNotification) => {
    AudioHelper.playWarningTone();
    Helper.speak(notification.speechMessage, Number.POSITIVE_INFINITY);

    Firestore.logInfo(
        `[notification:${notification.ruleId}] ${notification.message}`,
        { symbol: notification.symbol },
    );
};

const loadPersistedState = <State>(rule: NotificationRule<State>, symbol: string): State => {
    try {
        const value = sessionStorage.getItem(getStorageKey(rule.id, symbol));
        if (value) {
            return JSON.parse(value) as State;
        }
    } catch (error) {
        console.warn(`could not restore notification state for ${symbol} ${rule.id}`, error);
    }
    return rule.createInitialState();
};

const persistState = <State>(rule: NotificationRule<State>, symbol: string, state: State) => {
    try {
        sessionStorage.setItem(getStorageKey(rule.id, symbol), JSON.stringify(state));
    } catch (error) {
        console.warn(`could not persist notification state for ${symbol} ${rule.id}`, error);
    }
};

const applyRuleResult = <State>(
    rule: NotificationRule<State>,
    symbol: string,
    result: NotificationRuleResult<State>,
) => {
    stateByRuleAndSymbol.set(getStateKey(rule.id, symbol), result.state);
    if (result.persist) {
        persistState(rule, symbol, result.state);
    }
    if (result.notification) {
        dispatchTradingNotification(result.notification);
    }
};

export const onPriceTick = (symbol: string, currentPrice: number) => {
    rules.forEach(rule => {
        const key = getStateKey(rule.id, symbol);
        const state = stateByRuleAndSymbol.get(key) ?? loadPersistedState(rule, symbol);
        applyRuleResult(rule, symbol, rule.evaluate(symbol, currentPrice, state));
    });
};
