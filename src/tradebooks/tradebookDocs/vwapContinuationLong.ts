export const tradebookText = `
Long VWAP Continuation

Intraday Setup:
Open price is above vwap and vwap is above inflection level.

Summary:
We look for breakouts to go long when the breakouts occurs above both vwap and inflection level.

Stop Loss:
- Default is low of the day

Conditions to fail:
- Price loses vwap

Targets:
- Targets depend on the actual trade plan. But there are some default targets like ATR, 1,2,3 RRR etc.

Trade management:
- If it has tested vwap, do not tighten stop, keep vwap as the stop.
- If it has tested inflection level, do not tighten stop, keep inflection level as the stop.


Notes:
- VWAP acts as dynamic support/resistance.
- Volume confirmation increases probability.
`.trim();