import assert from 'node:assert/strict';
import test from 'node:test';

import {
    calculateBufferedCoreTarget,
    estimateCompletedPartials,
    evaluateCoreTargetRule,
} from './coreTargetRule.ts';

test('uses ninety percent of the planned profit as the buffered target', () => {
    assert.equal(calculateBufferedCoreTarget(100, 110), 109);
    assert.equal(calculateBufferedCoreTarget(100, 90), 91);
});

test('coreCount is the number of restricted original partials at the end', () => {
    for (let partialNumber = 1; partialNumber <= 5; partialNumber++) {
        assert.equal(evaluateCoreTargetRule({
            isLong: true,
            entryPrice: 100,
            coreTarget: 110,
            coreCount: 5,
            partialNumber,
            proposedExitPrice: 101,
            makesExitEarlier: true,
        }).allowed, true);
    }
    assert.equal(evaluateCoreTargetRule({
        isLong: true,
        entryPrice: 100,
        coreTarget: 110,
        coreCount: 5,
        partialNumber: 6,
        proposedExitPrice: 108.99,
        makesExitEarlier: true,
    }).allowed, false);
    assert.equal(evaluateCoreTargetRule({
        isLong: true,
        entryPrice: 100,
        coreTarget: 110,
        coreCount: 5,
        partialNumber: 6,
        proposedExitPrice: 109,
        makesExitEarlier: true,
    }).allowed, true);
});

test('the first three partials remain unrestricted with the maximum restricted count', () => {
    assert.equal(evaluateCoreTargetRule({
        isLong: false,
        entryPrice: 100,
        coreTarget: 90,
        coreCount: 7,
        partialNumber: 3,
        proposedExitPrice: 99,
        makesExitEarlier: true,
    }).allowed, true);
    assert.equal(evaluateCoreTargetRule({
        isLong: false,
        entryPrice: 100,
        coreTarget: 90,
        coreCount: 7,
        partialNumber: 4,
        proposedExitPrice: 91.01,
        makesExitEarlier: true,
    }).allowed, false);
    assert.equal(evaluateCoreTargetRule({
        isLong: false,
        entryPrice: 100,
        coreTarget: 90,
        coreCount: 7,
        partialNumber: 4,
        proposedExitPrice: 91,
        makesExitEarlier: true,
    }).allowed, true);
});

test('a coreCount of one restricts only the final partial', () => {
    assert.equal(evaluateCoreTargetRule({
        isLong: true,
        entryPrice: 100,
        coreTarget: 110,
        coreCount: 1,
        partialNumber: 9,
        proposedExitPrice: 101,
        makesExitEarlier: true,
    }).allowed, true);
    assert.equal(evaluateCoreTargetRule({
        isLong: true,
        entryPrice: 100,
        coreTarget: 110,
        coreCount: 1,
        partialNumber: 10,
        proposedExitPrice: 108.99,
        makesExitEarlier: true,
    }).allowed, false);
});

test('adjustments that cannot make the exit earlier are not restricted', () => {
    assert.equal(evaluateCoreTargetRule({
        isLong: true,
        entryPrice: 100,
        coreTarget: 110,
        coreCount: 7,
        partialNumber: 10,
        proposedExitPrice: 101,
        makesExitEarlier: false,
    }).allowed, true);
});

test('third-partial reminder tolerates uneven share splits but waits for completed pairs', () => {
    assert.equal(estimateCompletedPartials(21, 6, 7), 3);
    assert.equal(estimateCompletedPartials(21, 6, 8), 2);
    assert.equal(estimateCompletedPartials(100, 0, 7), 0);
});
