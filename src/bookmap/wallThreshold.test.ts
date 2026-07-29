import assert from "node:assert/strict";
import test from "node:test";

import {
    getBookmapSizeThreshold,
    meetsBookmapSizeThreshold,
} from "./wallThreshold.ts";

test("uses Bookmap's effective wall threshold directly", () => {
    assert.equal(getBookmapSizeThreshold({
        effectiveWallThreshold: 14_600,
    }), 14_600);
});

test("reads the threshold from every snapshot without caching an older P97", () => {
    assert.equal(getBookmapSizeThreshold({
        effectiveWallThreshold: 20_000,
    }), 20_000);
    assert.equal(getBookmapSizeThreshold({
        effectiveWallThreshold: 7_000,
    }), 7_000);
});

test("does not guess a threshold when Bookmap omits an effective value", () => {
    assert.equal(getBookmapSizeThreshold(undefined), undefined);
    assert.equal(getBookmapSizeThreshold({}), undefined);
    assert.equal(getBookmapSizeThreshold({ effectiveWallThreshold: 0 }), undefined);
    assert.equal(getBookmapSizeThreshold({ effectiveWallThreshold: Number.NaN }), undefined);
});

test("accepts walls at the effective threshold and rejects smaller protected levels", () => {
    const threshold = getBookmapSizeThreshold({ effectiveWallThreshold: 14_600 });

    assert.equal(meetsBookmapSizeThreshold(14_600, threshold), true);
    assert.equal(meetsBookmapSizeThreshold(6_000, threshold), false);
    assert.equal(meetsBookmapSizeThreshold(5_000, threshold), false);
    assert.equal(meetsBookmapSizeThreshold(20_000, undefined), false);
});
