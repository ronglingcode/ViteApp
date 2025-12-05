import * as TrailingStop from './trailingStopShort';

export const tradebookText = `
Short Open Drive

Intraday Setup:
Open price is below inflection level and inflection level is below vwap.

Summary:
We look for breakdowns to go short when the breakdowns occurs below both vwap and inflection level.

Stop Loss:
- Default is high of the day

Conditions to fail:
- Price gets above inflection level

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