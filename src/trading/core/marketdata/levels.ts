export function calculateCamPivots(high: number, low: number, close: number, round = (value: number) => Math.round(value * 100) / 100) {
    const range = (high - low) * 1.1;
    const R1 = close + range / 12, R2 = close + range / 6, R3 = close + range / 4, R4 = close + range / 2;
    const S1 = close - range / 12, S2 = close - range / 6, S3 = close - range / 4, S4 = close - range / 2;
    const step = R4 - R3;
    const R5 = R4 + step, R6 = R5 + step, S5 = S4 - step, S6 = S5 - step;
    return { R1: round(R1), R2: round(R2), R3: round(R3), R4: round(R4), R5: round(R5), R6: round(R6),
        S1: round(S1), S2: round(S2), S3: round(S3), S4: round(S4), S5: round(S5), S6: round(S6) };
}
