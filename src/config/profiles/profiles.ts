
export interface SystemProfile {
    name: string,
    maxTotalTrades: number,
};
export type BrokerName = "Schwab" | "TradeStation";
export interface Profile {
    name: string,
    brokerName: BrokerName,
    isEquity: boolean,
    isFutures: boolean,
    indexOnly: boolean,
    entryRules: EntryRulesConfig,
    exitRules: ExitRulesConfig,
    fixedRisk: boolean,
    isTestAccount: boolean,
    allowTighterStop: boolean,
    uiSettings: UIConfig,
};

export interface UIConfig {
};

export interface EntryRulesConfig {
    requireVwapSameDirection: boolean,
    maxSizeOnEarlyEntry: number,
};

export interface ExitRulesConfig {
    checkTimeSinceEntry: boolean,
    allowTightenStop: boolean,
};
