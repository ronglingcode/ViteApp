import { premarketEligibility } from '../trading/core/marketdata/eligibility.ts';
import * as GlobalSettings from '../config/globalSettings';
import type { PremarketDollarCollection } from '../models/models';

export const checkAbsolutePremarketVolume = ({ lastDayShares }: PremarketDollarCollection) => {
    const sharesInMillions = lastDayShares / 1000000;
    const threshold = GlobalSettings.premarketVolumeThresholdInMillions;
    return {
        passed: premarketEligibility(lastDayShares, 0, 0, threshold, 0).absolutePassed,
        description: `premarket volume ${sharesInMillions.toFixed(2)}M shares (threshold: ${threshold}M)`,
    };
};

export const checkPremarketVolumeHardFloor = ({ lastDayShares }: PremarketDollarCollection) => {
    const threshold = GlobalSettings.premarketVolumeHardFloorInShares;
    return {
        passed: premarketEligibility(lastDayShares, 0, threshold, 0, 0).hardFloorPassed,
        description: `premarket volume ${(lastDayShares / 1000).toFixed(0)}K shares (hard floor: ${threshold / 1000}K)`,
    };
};

export const checkRelativePremarketVolume = ({ lastDayShares, previousDaysSharesAverage }: PremarketDollarCollection) => {
    const threshold = GlobalSettings.premarketRelativeVolumeThreshold;
    const hasValidVolume = Number.isFinite(previousDaysSharesAverage)
        && previousDaysSharesAverage > 0
        && Number.isFinite(lastDayShares);
    const relativeVolumeText = hasValidVolume
        ? `${(lastDayShares / previousDaysSharesAverage).toFixed(2)}x`
        : 'unavailable';
    const historicalAverageText = Number.isFinite(previousDaysSharesAverage)
        ? `${(previousDaysSharesAverage / 1000000).toFixed(2)}M shares`
        : 'unavailable';
    return {
        passed: premarketEligibility(lastDayShares, previousDaysSharesAverage, 0, 0, threshold).relativePassed,
        description: `relative premarket volume ${relativeVolumeText} (threshold: ${threshold}x), historical average ${historicalAverageText}`,
    };
};
