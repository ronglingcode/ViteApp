import * as TrailingStop from './trailingStopLong';
import * as TrendMovingAverage from './trendMovingAverage';

export const tradebookText = `
Long Above Water Breakout

Intraday Setup:
Open price is below inflection level but open price is above vwap.

Summary:
We wait for price to get above the inflection level and then go long for the next local breakout.

Entry method 1: Wait for close above.
If there's 1 candle closed above inflection level, we go long for the next local breakout.
Default stop is low of the day.

Entry method 2: Wait for rejection failing
If there's 1 candle closed below the level but its high is above the level, 
that means it tried to breakout the level but faced rejection, we wait for the price to get above the level again and then long.
Because that shows the rejection is failing.
Default stop is the low of rejection.

Entry method 3: No wait
For very liquid stock like SPY, QQQ, TSLA, NVDA, we don't need to wait for 1 candle close.
We can long as soon as the curent price is above the inflection level.
Default stop is just a bit below the inflection level.

Conditions to fail:
- Price loses inflection level such as closed a candle below inflection level or breakdown below the level with volume.
- As long as the condition didn't fail, we will keep the trade until it hit the target.

Targets:
- Targets depend on the actual trade plan. But there are some default targets like ATR, 1,2,3 RRR, cam pivots and etc.

Trade management:
- If vwap gets above inflection level, we can consider using vwap as the stop.
- ${TrailingStop.trailingStop}
- ${TrendMovingAverage.long}

Re-entry after stopped out:
We can re-enter the trade if price reclaims the inflection level. But we need to take note of the depth of the drop before it rebounds.
The shallower the better because we will use the low of the drop as the stop. If the drop is too deep, we may not want to re-enter the trade.
Drop to a few levels below is considered not good such as go below vwap.
`.trim();