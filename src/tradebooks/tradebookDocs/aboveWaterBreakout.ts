import * as TrailingStop from './trailingStopLong';
import * as TrendMovingAverage from './trendMovingAverage';

export const tradebookText = `
Long Above Water Breakout

Intraday Setup:
Open price is below inflection level but open price is above vwap.

Summary:
We wait for 1 candle to close above inflection level and then go long for the next local breakout.

Stop Loss:
- Default is low of the day

Conditions to fail:
- Price loses inflection level such as closed a candle below inflection level.

Targets:
- Targets depend on the actual trade plan. But there are some default targets like ATR, 1,2,3 RRR etc.

Trade management:
- If vwap gets above inflection level, we can consider using vwap as the stop.
- ${TrailingStop.trailingStop}
- ${TrendMovingAverage.long}

Notes:
- VWAP acts as dynamic support/resistance.
- Volume confirmation increases probability.
`.trim();