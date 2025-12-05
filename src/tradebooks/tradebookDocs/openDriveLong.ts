import * as TrailingStop from './trailingStopLong';

export const tradebookText = `
Long Open Drive

Intraday Setup:
Open price is above inflection level and inflection level is above vwap.

Summary:
We look for breakouts to go long when the breakouts occurs above both vwap and inflection level.

Stop Loss:
- Default is low of the day

Conditions to fail:
- Price loses inflection level

Targets:
- Targets depend on the actual trade plan. But there are some default targets like ATR, 1,2,3 RRR etc.


Trade management:
- If it has tested inflection level, do not tighten stop, keep inflection level as the stop.
- If vwap goes above inflection level, we can consider using vwap as the stop.

- ${TrailingStop.trailingStop}

Notes:
- VWAP acts as dynamic support/resistance.
- Volume confirmation increases probability.
`.trim();