export const CORE_TARGET_PROGRESS_RATIO = 0.9;
export const ALWAYS_UNRESTRICTED_PARTIALS = 3;
export const DEFAULT_PARTIALS_COUNT = 10;
export const MAX_RESTRICTED_PARTIALS = DEFAULT_PARTIALS_COUNT - ALWAYS_UNRESTRICTED_PARTIALS;

export interface CoreTargetRuleInput {
    isLong: boolean;
    entryPrice: number;
    coreTarget: number;
    coreCount: number;
    partialNumber: number;
    proposedExitPrice: number;
    makesExitEarlier: boolean;
}

export interface CoreTargetRuleResult {
    allowed: boolean;
    reason: string;
}

export const calculateBufferedCoreTarget = (entryPrice: number, coreTarget: number) => {
    return entryPrice + (coreTarget - entryPrice) * CORE_TARGET_PROGRESS_RATIO;
};

export const normalizeRestrictedPartialCount = (
    coreCount: number,
    partialsCount = DEFAULT_PARTIALS_COUNT,
) => {
    if (!Number.isFinite(coreCount)) {
        return Math.max(0, partialsCount - ALWAYS_UNRESTRICTED_PARTIALS);
    }
    return Math.min(
        Math.max(0, partialsCount - ALWAYS_UNRESTRICTED_PARTIALS),
        Math.max(0, Math.trunc(coreCount)),
    );
};

export const estimateCompletedPartials = (
    initialQuantity: number,
    exitedQuantity: number,
    remainingExitPairs: number,
    partialsCount = DEFAULT_PARTIALS_COUNT,
) => {
    let countFromRemainingPairs = Math.max(
        0,
        partialsCount - Math.min(partialsCount, Math.max(0, remainingExitPairs)),
    );
    if (!Number.isFinite(initialQuantity) || initialQuantity <= 0) {
        return countFromRemainingPairs;
    }
    let countFromQuantity = Math.max(
        0,
        Math.min(partialsCount, Math.round(exitedQuantity / (initialQuantity / partialsCount))),
    );
    // A partial is complete only after its exit pair is gone. This also prevents
    // a temporary order-replacement gap from being mistaken for a fill.
    return Math.min(countFromQuantity, countFromRemainingPairs);
};

export const evaluateCoreTargetRule = (input: CoreTargetRuleInput): CoreTargetRuleResult => {
    if (!input.makesExitEarlier) {
        return {
            allowed: true,
            reason: 'the adjustment does not make the exit happen earlier',
        };
    }

    if (!Number.isFinite(input.proposedExitPrice) || input.proposedExitPrice <= 0) {
        return {
            allowed: false,
            reason: 'proposed exit price must be positive and finite',
        };
    }

    let restrictedCount = normalizeRestrictedPartialCount(input.coreCount);
    let firstRestrictedPartial = DEFAULT_PARTIALS_COUNT - restrictedCount + 1;
    if (input.partialNumber <= ALWAYS_UNRESTRICTED_PARTIALS
        || input.partialNumber < firstRestrictedPartial) {
        let unrestrictedCount = DEFAULT_PARTIALS_COUNT - restrictedCount;
        return {
            allowed: true,
            reason: `partial ${input.partialNumber} is within the first ${unrestrictedCount} unrestricted partials`,
        };
    }

    if (!Number.isFinite(input.entryPrice) || input.entryPrice <= 0) {
        return {
            allowed: false,
            reason: 'missing the original entry price for the core-target rule',
        };
    }
    if (!Number.isFinite(input.coreTarget) || input.coreTarget <= 0) {
        return {
            allowed: false,
            reason: 'missing coreTarget for a protected partial',
        };
    }
    if ((input.isLong && input.coreTarget <= input.entryPrice)
        || (!input.isLong && input.coreTarget >= input.entryPrice)) {
        return {
            allowed: false,
            reason: `coreTarget ${input.coreTarget} is not on the profitable side of entry ${input.entryPrice}`,
        };
    }

    let bufferedTarget = calculateBufferedCoreTarget(input.entryPrice, input.coreTarget);
    let meetsTarget = input.isLong
        ? input.proposedExitPrice + 1e-9 >= bufferedTarget
        : input.proposedExitPrice - 1e-9 <= bufferedTarget;
    return {
        allowed: meetsTarget,
        reason: meetsTarget
            ? `partial ${input.partialNumber} exit ${input.proposedExitPrice} meets buffered core target ${bufferedTarget}`
            : `partial ${input.partialNumber} exit ${input.proposedExitPrice} must be ${input.isLong ? '>=' : '<='} ${bufferedTarget}`,
    };
};
