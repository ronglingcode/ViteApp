import * as TrailingStop from './trailingStopShort';
import * as TrendMovingAverage from './trendMovingAverage';

export const tradebookText = `
Short Below Water Breakdown

Intraday Setup:
Open price is above inflection level but open price is below vwap.

Summary:
We wait for 1 candle to close below inflection level and then short the next local breakdown.

Stop Loss:
- Default is high of the day

Conditions to fail:
- Price gets above inflection level such as closed a new candle above inflection level.

Targets:
- Targets depend on the actual trade plan. But there are some default targets like ATR, 1,2,3 RRR etc.

Trade management:
- If vwap gets below inflection level, we can consider using vwap as the stop.
- ${TrailingStop.trailingStop}
- ${TrendMovingAverage.short}

Notes:
- VWAP acts as dynamic support/resistance.
- Volume confirmation increases probability.
`.trim();