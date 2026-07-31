import type * as Models from "../models/models";
import {
    BOOKMAP_WIRE_PRICE_UNIT,
    normalizeBookmapWirePrice,
} from "./priceNormalization.ts";

const ONE_MINUTE_MS = 60_000;

export interface BookmapVwapUpdate {
    type: "vwap_update";
    priceUnit: typeof BOOKMAP_WIRE_PRICE_UNIT;
    symbol: string;
    vwap: number;
    effectiveTimeMs: number;
    sentAtMs: number;
}

export const getVwapEffectiveTimeMs = (point: Models.LineSeriesData): number => {
    const localCandleStart = new Date(Number(point.time) * 1000);
    localCandleStart.setTime(
        localCandleStart.getTime() + localCandleStart.getTimezoneOffset() * ONE_MINUTE_MS,
    );
    return localCandleStart.getTime() + ONE_MINUTE_MS;
};

export const buildVwapUpdate = (
    symbol: string,
    point: Models.LineSeriesData,
    sentAtMs: number = Date.now(),
): BookmapVwapUpdate | undefined => {
    const vwap = normalizeBookmapWirePrice(point?.value);
    const effectiveTimeMs = point ? getVwapEffectiveTimeMs(point) : 0;
    if (!symbol || vwap === undefined || !Number.isFinite(effectiveTimeMs) || effectiveTimeMs <= 0) {
        return undefined;
    }

    return {
        type: "vwap_update",
        priceUnit: BOOKMAP_WIRE_PRICE_UNIT,
        symbol,
        vwap,
        effectiveTimeMs,
        sentAtMs,
    };
};
