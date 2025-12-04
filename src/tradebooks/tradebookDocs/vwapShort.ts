export const vwapBasedTradeManagement = `
When managing a VWAP based short position, 
particularly after partial profits have been taken, 
the stop-out criteria can be adjusted to allow for more flexibility. 

1. If the position has been reduced to 30% of the original size or less, do not immediately stop out on the first instance of price moving above VWAP.
2. Instead, use a more lenient rule: only stop out if a full one-minute candle closes above VWAP.
3. This approach helps avoid premature exits and allows the remaining partial position more room to fluctuate, ensuring the trade has a fair chance to continue in your favor.

[Consolidation between vwap and premarket low]
If the price is moving between vwap and premarket low, try not do anything. 
The price action can be choppy when it's below vwap but above premarket low.
Only take partial when it's near premarket low or add back partials when it's near vwap.
It will be better to add when it breakdown premarket low. 
The long is the consolidation between vwap and premarket low, the better short setup is the breakdown of premarket low.

[Retracement to vwap]
When price is moving back up, don't get scared and pay attention to whether the price can get back above vwwap or close a candle above vwap.
As long as it doesn't do that, any move back up to vwap is a good opportunity to add back partials.
`.trim();