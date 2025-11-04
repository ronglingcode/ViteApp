import * as Models from "../models/models";
import * as Patterns from "../algorithms/patterns";

export const isHigherVolumeInFavor = (symbol: string) => {
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    if (candles.length < 2) {
        return false;
    }
    let netQuantity = Models.getPositionNetQuantity(symbol);
    if (netQuantity == 0) {
        return false;
    }
    let isLong = netQuantity > 0;
    let volumes = Models.getVolumesSinceOpen(symbol);
    let currentVolume = volumes[volumes.length - 1];
    let previousVolume = volumes[volumes.length - 2];
    let isHigherVolume = currentVolume > previousVolume;
    if (!isHigherVolume) {
        return false;
    }
    let c = Models.getCurrentCandle(symbol);
    if (isLong && Patterns.isGreenBar(c) || !isLong && Patterns.isRedBar(c)) {
        return true;
    }
    return false;
}