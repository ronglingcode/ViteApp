import * as TrailingStop from './trailingStopShort';
import * as VwapShort from './vwapShort';

export const tradebookText = `
Breakout Reversal (Short on Failed Breakout)

Intraday Setup:
We identify a clear inflection level (pre-market pivot or calculated momentum level). A breakout occurs when price closes above that inflection level with conviction (volume or multiple minute closes). The tradebook looks to short when that breakout fails — i.e., price is rejected and moves back below the inflection level shortly after the breakout.

Summary / Entry logic:
- Wait for a breakout to occur (price closes above inflection level).
- After the breakout, watch for failure signals: a one-minute close back below the inflection level, a lower high on a subsequent push up, or a breakout candle that forms a long wick and is followed by weakness.
- Entry trigger examples:
	- Short on a one-minute close back under the inflection level after the breakout.
	- Short when price breaks the low of the breakout candle (failure of breakout momentum).
	- Short on a quick rejection at a tested breakout level (reversal wick + lower close).

Stop Loss:
- Place stop above the recent swing high or above the high of the breakout candle plus a small buffer (e.g., 0.1% - 0.3% depending on symbol volatility).
- Do not place stops at arbitrary round numbers; use chart structure (breakout high or local resistance).

Conditions to fail:
- Price reclaims and holds above the inflection level for multiple bars after the attempted failure.
- Price moves strongly above VWAP and shows sustained demand (use VWAP logic in management section).

Targets:
- Partial targets are tactical: first target at VWAP or the open price, second target near 1x ATR, final target based on extended momentum or plan-specific final targets.
- Manage partials aggressively on intraday reversal trades; scale out as price approaches structural support.

Trade management:
- If the short is working, consider using the short trailing stop guidance below.
- ${TrailingStop.trailingStop}
- ${VwapShort.vwapBasedTradeManagement}

Notes:
- Volume confirmation (higher volume on the breakout and lower volume on the push back) increases reliability of the failure signal.
- Avoid fading strong breakouts that are accompanied by broad market strength or sector rotation; context matters.
- Keep position size small relative to conviction — failed-breakout shorts are higher-risk setups.
`.trim();