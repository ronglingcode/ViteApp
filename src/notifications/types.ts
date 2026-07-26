export interface TradingNotification {
    ruleId: string;
    symbol: string;
    message: string;
    speechMessage: string;
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
