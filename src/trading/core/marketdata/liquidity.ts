/** This matches the active Models.getLiquidityScale branches, including the sticky maximum. */
export function calculateLiquidityScale(price: number, volumes: number[], lastPremarketVolume: number,
    marketCapInMillions: number, lockedAtMax = false): number {
    if (lockedAtMax) return 1;
    if (!volumes.length) return 0;
    const threshold = marketCapInMillions * 1000;
    const volume = Math.max(...volumes);
    const dollars = price * volume;
    if (volume < lastPremarketVolume || volume < 250000) return 0;
    if (volumes.length === 1) {
        if (dollars > Math.min(20000000, threshold) || volume > 10 * lastPremarketVolume || volume > 1000000) return 1;
        return dollars > 10000000 || dollars > threshold ? 0.35 : 0;
    }
    if (volume > 10 * lastPremarketVolume || volume > 1000000 || dollars > Math.min(20000000, threshold)) return 1;
    if (dollars > 10000000) return dollars / 20000000;
    return dollars > threshold ? 0.35 : 0;
}
