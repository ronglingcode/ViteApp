import assert from "node:assert/strict";
import test from "node:test";

import { buildVwapUpdate } from "./vwapUpdate.ts";

test("builds an authoritative value at the one-minute candle close", () => {
    const localCandleStart = new Date(2026, 6, 31, 6, 30, 0, 0);
    const tradingViewTime = Date.UTC(
        localCandleStart.getFullYear(),
        localCandleStart.getMonth(),
        localCandleStart.getDate(),
        localCandleStart.getHours(),
        localCandleStart.getMinutes(),
    ) / 1000;

    assert.deepEqual(buildVwapUpdate(
        "AAPL",
        { time: tradingViewTime as never, value: 212.3456 },
        123_456,
    ), {
        type: "vwap_update",
        priceUnit: "real",
        symbol: "AAPL",
        vwap: 212.3456,
        effectiveTimeMs: localCandleStart.getTime() + 60_000,
        sentAtMs: 123_456,
    });
});

test("rejects missing symbols and invalid VWAP values", () => {
    const point = { time: 1 as never, value: 100 };
    assert.equal(buildVwapUpdate("", point), undefined);
    assert.equal(buildVwapUpdate("AAPL", { ...point, value: 0 }), undefined);
});
