import type * as Models from '../models/models';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface TradingNotification {
    id: string;
    ruleId: string;
    symbol: string;
    title: string;
    message: string;
    speechMessage: string;
    severity: NotificationSeverity;
    occurredAt: number;
    details?: Record<string, number | string | boolean>;
}

export interface NotificationContext {
    symbol: string;
    sessionDate: string;
    now: Date;
    isRegularSession: boolean;
    hasOpenPrice: boolean;
    openingPrice: number;
    openingVwap: number;
    currentPrice: number;
    currentVwap: number;
    atr: number;
    netQuantity: number;
    longPositionOpenedAt?: number;
    currentCandle?: Models.CandlePlus;
    candlesSinceOpen: Models.CandlePlus[];
    vwapsSinceOpen: Models.LineSeriesData[];
}

export interface NotificationRuleResult<State> {
    state: State;
    notification?: TradingNotification;
    persist?: boolean;
}

export interface NotificationRule<State = unknown> {
    id: string;
    createInitialState: () => State;
    hydrate: (
        context: NotificationContext,
        state: State,
        includeCurrentCandle: boolean,
    ) => NotificationRuleResult<State>;
    evaluate: (context: NotificationContext, state: State) => NotificationRuleResult<State>;
    reconcilePosition?: (
        context: NotificationContext,
        state: State,
    ) => NotificationRuleResult<State>;
}
