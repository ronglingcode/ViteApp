import type { Profile } from "./profiles";
export const settings: Profile = {
    name: "futures",
    brokerName: "TradeStation",
    isEquity: false,
    indexOnly: false,
    isFutures: true,
    entryRules: {
        requireVwapSameDirection: false,
        maxSizeOnEarlyEntry: 1,
    },
    exitRules: {
        checkTimeSinceEntry: false,
        allowTightenStop: true,
    },
    fixedRisk: false,
    isTestAccount: false,
    allowTighterStop: true,
    uiSettings: {
    },
};