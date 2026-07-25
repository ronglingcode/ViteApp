import * as Config from '../config/config';
import * as GlobalSettings from '../config/globalSettings';
import * as Models from '../models/models';
import * as Helper from '../utils/helper';
import * as TimeHelper from '../utils/timeHelper';
import { dispatchTradingNotification } from './notificationDispatcher';
import { firstPopToVwapRule } from './rules/firstPopToVwap';
import type {
    NotificationContext,
    NotificationRule,
    NotificationRuleResult,
} from './types';

const rules: NotificationRule<any>[] = [
    firstPopToVwapRule,
];
const stateByRuleAndSymbol = new Map<string, unknown>();
const initializedSymbols = new Set<string>();
let initialized = false;
const storagePrefix = 'tradingscripts.notification';

const getSessionDate = () => TimeHelper.formatDateToYYYYMMDD(Config.Settings.currentDay);

const getStateKey = (ruleId: string, symbol: string) =>
    `${getSessionDate()}:${ruleId}:${symbol}`;

const getStorageKey = (ruleId: string, symbol: string) =>
    `${storagePrefix}.${getStateKey(ruleId, symbol)}`;

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

const getLongPositionOpenedAt = (symbol: string) => {
    const trade = Models.getCurrentOpenTrade(symbol);
    if (!trade?.isLong || trade.entries.length === 0) {
        return undefined;
    }
    let openedAt = trade.entries[0].time.getTime();
    for (let i = 1; i < trade.entries.length; i++) {
        openedAt = Math.min(openedAt, trade.entries[i].time.getTime());
    }
    return openedAt;
};

const buildContext = (symbol: string, currentPrice?: number): NotificationContext => {
    const now = Helper.getCurrentMarketTime();
    const hasOpenPrice = Models.hasOpenPrice(symbol);
    let atr = 0;
    try {
        atr = Models.getAtr(symbol).average;
    } catch (error) {
        console.warn(`could not load ATR for notification context ${symbol}`, error);
    }
    return {
        symbol,
        sessionDate: getSessionDate(),
        now,
        isRegularSession: Helper.isRegularMarketSessionTime(now),
        hasOpenPrice,
        openingPrice: hasOpenPrice ? Models.getOpenPrice(symbol) : 0,
        openingVwap: Models.getLastVwapBeforeOpen(symbol),
        currentPrice: currentPrice ?? Models.getCurrentPrice(symbol),
        currentVwap: Models.getCurrentVwap(symbol),
        atr,
        netQuantity: Models.getPositionNetQuantity(symbol),
        longPositionOpenedAt: getLongPositionOpenedAt(symbol),
        currentCandle: Models.getCurrentCandle(symbol),
        candlesSinceOpen: Models.getCandlesFromM1SinceOpen(symbol),
        vwapsSinceOpen: Models.getVwapsSinceOpen(symbol),
    };
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

const initializeSymbolInternal = (symbol: string, includeCurrentCandle: boolean) => {
    if (!GlobalSettings.notificationSettings.enabled) {
        return;
    }
    const context = buildContext(symbol);
    rules.forEach(rule => {
        const state = loadPersistedState(rule, symbol);
        applyRuleResult(rule, symbol, rule.hydrate(context, state, includeCurrentCandle));
    });
    initializedSymbols.add(symbol);
};

export const initialize = () => {
    if (initialized) {
        return;
    }
    initialized = true;
    window.addEventListener('tradingscripts:account-ui-symbol-updated', event => {
        const customEvent = event as CustomEvent<{ symbol?: string }>;
        const symbol = customEvent.detail?.symbol;
        if (symbol) {
            onAccountDataRefresh(symbol);
        }
    });
};

export const initializeSymbol = (symbol: string) => {
    if (initializedSymbols.has(symbol)) {
        return;
    }
    initializeSymbolInternal(symbol, true);
};

export const onPriceTick = (symbol: string, currentPrice: number) => {
    if (!GlobalSettings.notificationSettings.enabled) {
        return;
    }
    if (!initializedSymbols.has(symbol)) {
        // Explicit startup initialization normally handles this. Excluding the
        // current candle here keeps the first live tick eligible to trigger.
        initializeSymbolInternal(symbol, false);
    }

    const context = buildContext(symbol, currentPrice);
    rules.forEach(rule => {
        const key = getStateKey(rule.id, symbol);
        const state = stateByRuleAndSymbol.get(key) ?? loadPersistedState(rule, symbol);
        applyRuleResult(rule, symbol, rule.evaluate(context, state));
    });
};

export const onAccountDataRefresh = (symbol: string) => {
    if (!GlobalSettings.notificationSettings.enabled || !initializedSymbols.has(symbol)) {
        return;
    }
    const context = buildContext(symbol);
    rules.forEach(rule => {
        if (!rule.reconcilePosition) {
            return;
        }
        const key = getStateKey(rule.id, symbol);
        const state = stateByRuleAndSymbol.get(key) ?? loadPersistedState(rule, symbol);
        applyRuleResult(rule, symbol, rule.reconcilePosition(context, state));
    });
};
