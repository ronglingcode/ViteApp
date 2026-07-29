/**
 * Canonical price contract for the ViteApp <-> Bookmap WebSocket.
 *
 * Every wire price is a real instrument price (for example, 122.21 USD), never
 * a Bookmap price level. Bookmap alone translates between wire prices and its
 * internal price levels using the instrument's pips value.
 */
export const BOOKMAP_WIRE_PRICE_UNIT = "real" as const;
export const BOOKMAP_WIRE_PRICE_UNIT_FIELD = "priceUnit" as const;

export type BookmapPriceBearingPayload<T extends object> = T & {
    priceUnit: typeof BOOKMAP_WIRE_PRICE_UNIT;
};

export const withBookmapWirePriceUnit = <T extends object>(
    payload: T,
): BookmapPriceBearingPayload<T> => ({
    ...payload,
    priceUnit: BOOKMAP_WIRE_PRICE_UNIT,
});

export const isSupportedBookmapWirePriceUnit = (value: unknown): boolean => {
    return value === undefined
        || value === null
        || (typeof value === "string"
            && (value.trim() === ""
                || value.trim().toLowerCase() === BOOKMAP_WIRE_PRICE_UNIT));
};

export const normalizeBookmapWirePrice = (value: unknown): number | undefined => {
    try {
        const parsed = typeof value === "number" ? value : Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    } catch {
        return undefined;
    }
};

export const getBookmapWirePrice = (
    source: unknown,
    ...fieldNames: string[]
): number | undefined => {
    if (!source || typeof source !== "object") {
        return undefined;
    }
    const record = source as Record<string, unknown>;
    for (const fieldName of fieldNames) {
        const normalized = normalizeBookmapWirePrice(record[fieldName]);
        if (normalized !== undefined) {
            return normalized;
        }
    }
    return undefined;
};
