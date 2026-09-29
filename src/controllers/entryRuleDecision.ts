/** Price/volume part of checkBasicGlobalEntryRules; shared with native parity fixtures. */
export interface EntryRuleInputs {
    isLong: boolean; entryPrice: number; initialSize: number; openPrice: number;
    secondsSinceMarketOpen: number; vwap: number; atr: number;
    watchAreas: number[]; noTradeZones: { low: number; high: number }[]; volumes: number[];
}
export const evaluateEntryPriceAndVolumeRules = (input: EntryRuleInputs) => {
    const { isLong, entryPrice, initialSize, openPrice, secondsSinceMarketOpen, vwap, atr, watchAreas, noTradeZones, volumes } = input;
    const messages: string[] = [];
    let multiplier = initialSize;
    const nearAgainst = (price: number, level: number) => isLong
        ? price < level && price >= level - atr * 0.15
        : price > level && price <= level + atr * 0.15;
    if (watchAreas.length > 0) {
        const level = watchAreas[0];
        if (nearAgainst(entryPrice, level)) return { multiplier: 0, messages: [`entry price ${entryPrice} is near against watch level ${level}, block entry`] };
        if (secondsSinceMarketOpen < 60 && openPrice && nearAgainst(openPrice, level)) {
            return { multiplier: 0, messages: [`open price ${openPrice} is near against watch level ${level}, block entry`] };
        }
        if (nearAgainst(entryPrice, vwap)) {
            multiplier = initialSize * 0.5;
            messages.push(`entry price ${entryPrice} is near against vwap, reduce to half size`);
        }
        if (secondsSinceMarketOpen < 60 && openPrice && nearAgainst(openPrice, vwap)) {
            multiplier = initialSize * 0.5;
            messages.push(`open price ${openPrice} is near against vwap, reduce to half size`);
        }
    }
    for (const zone of noTradeZones) if (zone.low < entryPrice && zone.high > entryPrice) {
        return { multiplier: 0, messages: [`entry price ${entryPrice} is inside no trade zone ${zone.low} - ${zone.high}, block entry`] };
    }
    if (volumes.length >= 3) {
        let maxIndex = 0;
        const lastClosedIndex = volumes.length - 2;
        for (let i = 1; i <= lastClosedIndex; i++) if (volumes[i] > volumes[maxIndex]) maxIndex = i;
        const start = maxIndex + 1 <= lastClosedIndex ? maxIndex + 1 : maxIndex;
        const max = Math.max(...volumes.slice(start));
        if (max < 150_000) {
            multiplier = initialSize * 0.5;
            messages.push(`did not meet minimum volume ${max} < 150K, using 50% size`);
        }
    }
    return { multiplier, messages };
};
