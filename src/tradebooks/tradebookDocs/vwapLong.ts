export const vwapBasedTradeManagement = `
When managing a VWAP based long position, 
particularly after partial profits have been taken, 
the stop-out criteria can be adjusted to allow for more flexibility. 

1. If the position has been reduced to 30% of the original size or less, do not immediately stop out on the first instance of price moving below VWAP.
2. Instead, use a more lenient rule: only stop out if a full one-minute candle closes below VWAP.
3. This approach helps avoid premature exits and allows the remaining partial position more room to fluctuate, ensuring the trade has a fair chance to continue in your favor.

[Consolidation between vwap and premarket high]
If the price is moving between vwap and premarket high, try not do anything. 
The price action can be choppy when it's above vwap but below premarket high.
Only take partial when it's near premarket high or add back partials when it's near vwap.
It will be better to add when it breakout premarket high. 
The long is the consolidation between vwap and premarket high, the better long setup is the breakout of premarket high.

[Retracement to vwap]
When price is moving back down, don't get scared and pay attention to whether the price can get back below vwwap or close a candle below vwap.
As long as it doesn't do that, any move back down to vwap is a good opportunity to add back partials.

`.trim();