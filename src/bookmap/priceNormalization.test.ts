import assert from "node:assert/strict";
import test from "node:test";

import {
    BOOKMAP_WIRE_PRICE_UNIT,
    getBookmapWirePrice,
    isSupportedBookmapWirePriceUnit,
    normalizeBookmapWirePrice,
    withBookmapWirePriceUnit,
} from "./priceNormalization.ts";

test("wire contract uses real instrument prices", () => {
    assert.equal(BOOKMAP_WIRE_PRICE_UNIT, "real");
    assert.deepEqual(
        withBookmapWirePriceUnit({ type: "key_levels_config", price: 122.21 }),
        { type: "key_levels_config", price: 122.21, priceUnit: "real" });
});

test("normalizes every incoming wire price through one validator", () => {
    assert.equal(normalizeBookmapWirePrice(122.21), 122.21);
    assert.equal(normalizeBookmapWirePrice("122.21"), 122.21);
    assert.equal(normalizeBookmapWirePrice(0), undefined);
    assert.equal(normalizeBookmapWirePrice(Number.NaN), undefined);
    assert.equal(normalizeBookmapWirePrice(Symbol("invalid")), undefined);
    assert.equal(getBookmapWirePrice({ target_price: 120.5 }, "target_price", "price"), 120.5);
});

test("accepts the real marker and legacy missing marker but rejects tick units", () => {
    assert.equal(isSupportedBookmapWirePriceUnit("real"), true);
    assert.equal(isSupportedBookmapWirePriceUnit(" REAL "), true);
    assert.equal(isSupportedBookmapWirePriceUnit(undefined), true);
    assert.equal(isSupportedBookmapWirePriceUnit("ticks"), false);
});
