# Trading library

Production trading decisions and vendor clients are extracted here incrementally.
The corresponding Java namespace is `com.bookmap.plugin.rong.miniviteapp` in
bookmap-plugin, with matching `core`, `libraries`, `models`, `ports`, and `runtime`
folders. Old browser module paths temporarily re-export extracted pure functions.

`core` contains computations and decisions. `libraries` knows vendor JSON and API
paths. `ports` describes I/O. `runtime` owns session time and will own orchestration.
`adapters` is the browser boundary; it may use fetch, DOM, and UI models. Core and
vendor modules must not import browser adapters or `window.HybridApp`.
`tsconfig.trading.json` checks extracted production modules without DOM libraries.

Massive uses domain candles with epoch milliseconds; chart timestamp conversion
stays in `api/massive/api.ts`. All history follows `next_url`, sorts and deduplicates
buckets, accepts successful empty intervals, and reports HTTP/entitlement errors.
Today uses the explicit New York session date and a 50,000 base-bar limit. The
30-minute lookback uses date-only arithmetic; no undocumented `extendedHours`
parameter is required. Daily range preserves the old lookback convention. Shares
use weighted outstanding first, then class shares, then zero. The browser wrapper
retains the existing zero fallback on failed reference reads.

Premarket dollars use valid per-bar VWAP or HLC/3, rounded dollars per bar, latest
available premarket day, previous-day median for relative volume, and historical
New York DST. This corrects host-timezone/current-offset assumptions in the old
helpers; position-sizing rules are unchanged. Streaming login now uses configured
Massive credentials rather than a literal embedded key.

`npm run test:massive` verifies 22 scenarios captured through the production TS
library. Java runs the versioned fixture copy with fake HTTP. Generate changed
fixtures with `node --experimental-strip-types scripts/generateMassiveFixtures.mjs`.
No live vendor requests or broker mutations are used by these tests.

Migration design and resumable progress are in bookmap-plugin/docs:
`standalone-native-trading-plan.md` and `standalone-native-trading-progress.md`.
The standalone runtime is not yet wired; use the progress document for current
completion status.
