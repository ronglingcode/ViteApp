export const trailingStop = `
after 10 mintes since open, we should start looking at 5-minute candles along with 5-minute candles.
1 minute candles can be noisy to make a new high but it's just doing a 5-minute retracement to form the 2nd 5-minute candle.
we can consider using the trailing of 5-minute candles by moving stop loss to 
the high of the 2nd 5-minute candle.

after 15 minutes since open, we should start looking at 15-minute candles along with 5-minute candles.
5-minute candles can be noisy to make a new high but it's just doing a 15-minute retracement to form the 2nd 15-minute candle.

after 30 minutes since open, 
we can consider using the trailing stop of 15-minute candles by moving stop loss to 
the high of the 2nd 15-minute candle.
`.trim();