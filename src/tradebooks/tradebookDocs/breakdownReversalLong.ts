import * as TrailingStop from './trailingStopLong';
import * as VwapLong from './vwapLong';

export const tradebookText = `
Breakdown Reversal (Long on Failed Breakdown)

Intraday Setup:
We identify a clear inflection level (pre-market pivot or calculated momentum level). A breakdown occurs when price closes below that inflection level with conviction (volume or multiple minute closes). The tradebook looks to go long when that breakdown fails — i.e., price is rejected and moves back above the inflection level shortly after the breakdown.

Summary / Entry logic:
- Wait for a breakdown to occur (price closes below inflection level).
- After the breakdown, watch for failure signals: a one-minute close back above the inflection level, a higher low on a subsequent push down, or a breakdown candle that forms a long lower wick and is followed by strength.
- Entry trigger examples:
  - Long on a one-minute close back above the inflection level after the breakdown.
  - Long when price breaks the high of the breakdown candle (failure of breakdown momentum).
  - Long on a quick rejection at a tested breakdown level (reversal wick + higher close).

Stop Loss:
- Place stop below the recent swing low or below the low of the breakdown candle minus a small buffer (e.g., 0.1% - 0.3% depending on symbol volatility).
- Use chart structure for stop placement rather than arbitrary round numbers.

Conditions to fail:
- Price re-drops and holds below the inflection level for multiple bars after the attempted failure.
- Price moves strongly below VWAP and shows sustained selling pressure (use VWAP logic in management section).

Targets:
- Partial targets are tactical: first target at VWAP or the open price, second target near 1x ATR, final target based on extended momentum or plan-specific final targets.
- Manage partials proactively on intraday reversal trades; scale out as price approaches structural resistance.

Trade management:
- If the long is working, consider using the long trailing stop guidance below.
- ${TrailingStop.trailingStop}
- ${VwapLong.vwapBasedTradeManagement}

Notes:
- Volume confirmation (higher volume on the breakdown and lower volume on the push back) increases reliability of the failure signal.
- Avoid fading strong breakdowns that are accompanied by broad market weakness or sector rotation; context matters.
- Keep position size small relative to conviction — failed-breakdown longs are higher-risk setups.
`.trim();
