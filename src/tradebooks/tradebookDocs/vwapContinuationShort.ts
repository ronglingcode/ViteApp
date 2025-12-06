import { vwapBasedTradeManagement } from './vwapShort';
import * as TrailingStop from './trailingStopShort';
import * as TrendMovingAverage from './trendMovingAverage';
export const tradebookText = `
Short VWAP Continuation

Intraday Setup:
Open price is below vwap and vwap is below inflection level.

Summary:
We look for breakdowns to go short when the breakdown occurs below both vwap and inflection level.


Stop Loss:
- Default is high of the day

Conditions to fail:
- Price reclaims vwap

Targets:
- Targets depend on the actual trade plan. But there are some default targets like ATR, 1,2,3 RRR etc.

Trade management:
- If it has tested vwap, do not tighten stop, keep vwap as the stop.
- If it has tested inflection level, do not tighten stop, keep inflection level as the stop.

${vwapBasedTradeManagement}

${TrailingStop.trailingStop}

${TrendMovingAverage.short}

Notes:
- VWAP acts as dynamic support/resistance.
- Volume confirmation increases probability.
`.trim();