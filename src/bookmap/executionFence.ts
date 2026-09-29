/** The broker adapter uses this boundary even for browser UI/automatic actions. */
type ReleaseFence = (outcome: 'complete' | 'unknown') => void;
let acquireFence: (() => Promise<ReleaseFence>) | undefined;
let inFlight = 0;
export const getLegacyBrokerMutationsInFlight = () => inFlight;
export const configureExecutionFence = (acquire: (() => Promise<ReleaseFence>) | undefined) => { acquireFence = acquire; };
export const needsNativeExecutionFence = (state: {
    enabled: boolean;
    hasSession: boolean;
    ownershipPending: boolean;
    requiresReview: boolean;
    pairingConfigured: boolean;
}) => state.requiresReview || state.hasSession || state.ownershipPending || (state.enabled && state.pairingConfigured);
export const withLegacyBrokerMutation = async <T>(operation: () => Promise<T>): Promise<T> => {
    inFlight++;
    let release: ReleaseFence | undefined;
    let complete = false;
    try {
        release = await acquireFence?.();
        const result = await operation();
        complete = true;
        return result;
    } finally {
        release?.(complete ? 'complete' : 'unknown');
        inFlight--;
    }
};
