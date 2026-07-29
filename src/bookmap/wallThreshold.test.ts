import assert from "node:assert/strict";
import test from "node:test";

import {
    BOOKMAP_WALL_THRESHOLD_FLOOR,
    getBookmapSizeThreshold,
    meetsBookmapSizeThreshold,
} from "./wallThreshold.ts";

test("falls back to the 5K wall threshold", () => {
    assert.equal(getBookmapSizeThreshold(undefined), BOOKMAP_WALL_THRESHOLD_FLOOR);
    assert.equal(getBookmapSizeThreshold({ wallThreshold: 3_000 }), BOOKMAP_WALL_THRESHOLD_FLOOR);
});

test("uses the maximum Bookmap percentile or configured threshold", () => {
    assert.equal(getBookmapSizeThreshold({
        wallThreshold: 5_000,
        absoluteWallThreshold: 5_000,
        percentileWallThreshold: 14_600,
        effectiveWallThreshold: 14_600,
    }), 14_600);

    assert.equal(getBookmapSizeThreshold({
        wallThreshold: 20_000,
        percentileWallThreshold: 14_600,
        effectiveWallThreshold: 14_600,
    }), 20_000);
});

test("accepts walls at the effective threshold and rejects smaller protected levels", () => {
    const thresholds = {
        absoluteWallThreshold: 5_000,
        percentileWallThreshold: 14_600,
        effectiveWallThreshold: 14_600,
    };

    assert.equal(meetsBookmapSizeThreshold(14_600, thresholds), true);
    assert.equal(meetsBookmapSizeThreshold(6_000, thresholds), false);
    assert.equal(meetsBookmapSizeThreshold(5_000, thresholds), false);
});
