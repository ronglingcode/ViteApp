import { vwapBasedTradeManagement } from './vwapShort';

export const tradebookText = `
Short VWAP Bounce Fail

Intraday Setup:
Open price is above vwap but open price is below inflection level.

Summary:
We expect any dips to vwap will get bounced back. If the bounce creats a lower high, we short it when it comes back down to lose vwap.


Stop Loss:
- Default is high of the day

Conditions to fail:
- Price reclaims vwap

Targets:
- Targets depend on the actual trade plan. But there are some default targets like ATR, 1,2,3 RRR etc.

Trade management:
- If it has not reached our target but has made 3-leg move down, it's ok to exit during the 3rd leg down.

${vwapBasedTradeManagement}

Notes:
- VWAP acts as dynamic support/resistance.
- Volume confirmation increases probability.
`.trim();