import * as Helper from "../utils/helper";
import * as Models from "../models/models";
import * as Config from "../config/config";
import {
    BOOKMAP_WIRE_PRICE_UNIT,
    normalizeBookmapWirePrice,
} from "./priceNormalization";

const VWAP_HANDOFF_MINUTES_BEFORE_MARKET_OPEN = 25;
const NEW_YORK_TIME_ZONE = "America/New_York";

export interface BookmapVwapSeed {
    type: "vwap_seed";
    priceUnit: typeof BOOKMAP_WIRE_PRICE_UNIT;
    symbol: string;
    sessionDate: string;
    continueFromTimeMs: number;
    cumulativeVolume: number;
    cumulativeNotional: number;
    sentAtMs: number;
}

const formatNewYorkDate = (timeMs: number): string => {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: NEW_YORK_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date(timeMs));
    const values = new Map(parts.map(part => [part.type, part.value]));
    return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
};

const isPositiveFinite = (value: number): boolean => {
    return Number.isFinite(value) && value > 0;
};

export const getVwapHandoffTimeMs = (): number => {
    return Config.Settings.marketOpenTime.getTime()
        - VWAP_HANDOFF_MINUTES_BEFORE_MARKET_OPEN * 60_000;
};

/**
 * Builds the cumulative VWAP state immediately before 9:05 AM New York time.
 * Bookmap owns trades whose timestamps are at or after continueFromTimeMs.
 */
export const buildVwapSeedForSymbol = (
    symbol: string,
    sentAtMs: number = Date.now(),
): BookmapVwapSeed | undefined => {
    if (!symbol || Helper.isFutures(symbol)) {
        return undefined;
    }

    const continueFromTimeMs = getVwapHandoffTimeMs();
    if (sentAtMs < continueFromTimeMs) {
        return undefined;
    }

    const symbolData = Models.getSymbolData(symbol);
    if (!symbolData?.candles?.length) {
        return undefined;
    }

    const cumulativeVolume = symbolData.bookmapVwapSeedVolume;
    const cumulativeNotional = symbolData.bookmapVwapSeedNotional;

    if (!isPositiveFinite(cumulativeVolume) || !isPositiveFinite(cumulativeNotional)) {
        return undefined;
    }
    if (normalizeBookmapWirePrice(cumulativeNotional / cumulativeVolume) === undefined) {
        return undefined;
    }

    return {
        type: "vwap_seed",
        priceUnit: BOOKMAP_WIRE_PRICE_UNIT,
        symbol,
        sessionDate: formatNewYorkDate(continueFromTimeMs),
        continueFromTimeMs,
        cumulativeVolume,
        cumulativeNotional,
        sentAtMs,
    };
};
