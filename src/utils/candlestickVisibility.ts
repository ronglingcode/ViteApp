import * as GlobalSettings from '../config/globalSettings';

export const shouldShowCandles = (currentTime: Date, marketOpenTime: Date): boolean => {
    if (GlobalSettings.showCandles !== "auto") {
        return GlobalSettings.showCandles;
    }
    return currentTime.getTime() >= marketOpenTime.getTime()
        + GlobalSettings.showCandlesMinutesAfterMarketOpen * 60_000;
};
