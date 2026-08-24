import assert from "node:assert/strict";
import test from "node:test";

import { isNewPositionTransition } from "./newPositionTransition.ts";

test("detects only flat-to-open position transitions", () => {
    assert.equal(isNewPositionTransition(0, 100), true);
    assert.equal(isNewPositionTransition(0, -100), true);
    assert.equal(isNewPositionTransition(undefined, 100), false);
    assert.equal(isNewPositionTransition(100, 150), false);
    assert.equal(isNewPositionTransition(100, 0), false);
});
