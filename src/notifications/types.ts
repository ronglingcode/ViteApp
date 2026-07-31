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

export interface NotificationRuleResult<State> {
    state: State;
    notification?: TradingNotification;
    persist?: boolean;
}

export interface NotificationRule<State = unknown> {
    id: string;
    createInitialState: () => State;
    evaluate: (
        symbol: string,
        currentPrice: number,
        state: State,
    ) => NotificationRuleResult<State>;
}
