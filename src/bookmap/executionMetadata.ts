/** Runtime-only token and broker observation metadata. */
let token: { accessToken: string; expiresAt: number; generation: number } | undefined;
let observation: { startedAt: number } | undefined;

export const recordExecutionToken = (accessToken: string, expiresInSeconds: number) => {
    if (!accessToken || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
        throw new Error('Invalid Schwab token response');
    }
    token = { accessToken, expiresAt: Date.now() + expiresInSeconds * 1000,
        generation: Math.max(Date.now(), (token?.generation ?? 0) + 1) };
    window.dispatchEvent(new Event('tradingscripts:execution-token-updated'));
};
export const getExecutionToken = () => token;
export const recordBrokerObservation = (startedAt: number) => {
    // Concurrent account reads completing out of order must not make older data look current.
    if (observation && startedAt < observation.startedAt) return;
    observation = { startedAt };
    window.dispatchEvent(new Event('tradingscripts:execution-account-observed'));
};
export const getBrokerObservation = () => observation;
export const canApplyBrokerObservation = (startedAt: number) =>
    !observation || startedAt >= observation.startedAt;
