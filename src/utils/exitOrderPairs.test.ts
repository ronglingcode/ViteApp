import assert from "node:assert/strict";
import test from "node:test";

import { getFirstSmallestQuantityExitPairIndex } from "./exitPairSelection.ts";

test("selects the first exit pair with the smallest quantity", () => {
    let pairs = [
        { LIMIT: { quantity: 40 } },
        { LIMIT: { quantity: 10 } },
        { LIMIT: { quantity: 10 } },
        { LIMIT: { quantity: 25 } },
    ];

    assert.equal(getFirstSmallestQuantityExitPairIndex(pairs), 1);
});

test("uses the stop quantity when the limit leg is unavailable", () => {
    let pairs = [
        { STOP: { quantity: 8 } },
        { LIMIT: { quantity: 12 } },
    ];

    assert.equal(getFirstSmallestQuantityExitPairIndex(pairs), 0);
});

test("returns no selection when no pair has a positive quantity", () => {
    assert.equal(getFirstSmallestQuantityExitPairIndex([
        { LIMIT: { quantity: 0 } },
        {},
    ]), -1);
});
