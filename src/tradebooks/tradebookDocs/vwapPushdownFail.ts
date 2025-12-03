export const tradebookText = `
Long VWAP Pushdown Fail

Intraday Setup:
Open price is below vwap but open price is above inflection level.

Summary:
- Entry type 1: We expect the first pop to vwap will get rejected. If the pushdown forms a higher low, we long it when it gets above vwap.
- Entry type 2: If he first pop to vwap directly gets above wap, don't chase, we wait for pullback to vwap. will get rejected. We long it when the pullback holds above vwap.


Stop Loss:
- Default is low of the day

Conditions to fail:
- Price loses vwap

Targets:
- Targets depend on the actual trade plan. But there are some default targets like ATR, 1,2,3 RRR etc.

Trade management:
- If it has not reached our target but has made 3-leg move up, it's ok to exit during the 3rd leg up.

Notes:
- VWAP acts as dynamic support/resistance.
- Volume confirmation increases probability.
`.trim();