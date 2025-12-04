export const vwapBasedTradeManagement = `
When managing a VWAP based short position, 
particularly after partial profits have been taken, 
the stop-out criteria can be adjusted to allow for more flexibility. 

1. If the position has been reduced to 30% of the original size or less, do not immediately stop out on the first instance of price moving above VWAP.
2. Instead, use a more lenient rule: only stop out if a full one-minute candle closes above VWAP.
3. This approach helps avoid premature exits and allows the remaining partial position more room to fluctuate, ensuring the trade has a fair chance to continue in your favor.
`.trim();