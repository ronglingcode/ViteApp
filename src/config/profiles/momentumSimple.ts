// day trading equities in tdameritrade
import type { Profile } from "./profiles";
export const settings: Profile = {
    name: "momentumSimple",
    brokerName: "Alpaca",
    isEquity: true,
    isFutures: false,
    indexOnly: false,
    entryRules: {
        requireVwapSameDirection: true,
        maxSizeOnEarlyEntry: 0.5
    },
    exitRules: {
        checkTimeSinceEntry: false,
        allowTightenStop: false,
    },
    fixedRisk: true,
    isTestAccount: false,
    allowTighterStop: true,
    uiSettings: {

    },
};