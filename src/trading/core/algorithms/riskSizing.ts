/** Pure arithmetic from riskManager.ts; asset delta is applied before this helper. */
export const sharesForRisk = (riskPerShare: number, multiplier: number, riskDollars: number) =>
    Math.max(2, Math.floor(multiplier * riskDollars / riskPerShare));
