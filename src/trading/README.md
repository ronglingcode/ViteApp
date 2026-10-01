# Trading library

Production trading decisions and vendor clients are extracted here incrementally.
The corresponding Java namespace is `com.bookmap.plugin.rong.miniviteapp` in
bookmap-plugin, with matching `core`, `libraries`, `models`, `ports`, and `runtime`
folders. Old browser module paths temporarily re-export extracted pure functions.

`core` contains computations and decisions. `libraries` knows vendor JSON and API
paths. `ports` describes I/O. Session-time calculations are pure `core/marketdata`
functions. `runtime` will own orchestration.
`adapters` is the browser boundary; it may use fetch, DOM, and UI models. Core and
vendor modules must not import browser adapters or `window.HybridApp`.
`tsconfig.trading.json` checks extracted production modules without DOM libraries.

Massive uses domain candles with epoch milliseconds; chart timestamp conversion
stays in `adapters/browserMarket.ts`. All history follows `next_url`, sorts and deduplicates
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

Firestore REST clients use explicit codecs for scalar/array/map/timestamp values,
the existing `state-{profile}/tradingState` document, and the latest configuration
snapshot query. `LogRepository` preserves log/order/breakout payloads and TTLs.
The browser still uses Firebase SDK for its optional log-maintenance functions.
Log dates now use the current Eastern session date instead of a startup-captured
host date. Log documents use generated IDs, avoiding same-millisecond collisions.

Schwab OAuth coalesces concurrent refreshes, uses returned expiry, persists rotated
refresh tokens, and handles manual callback-code exchange. Browser adapters retain
the `tradingscripts.schwab` schema and preserve unknown credential fields. The
browser checks expiry every 30 seconds and exposes token-refresh failures. Existing
broker mutation error handling and action concurrency remain unchanged. Startup
now actually awaits the user-preference request before opening the stream.

`npm run test:services` checks 22 production Firestore/OAuth/log scenarios and token
refresh concurrency. Java also tests local-file rotation/restart and concurrency.
Firestore writes and token exchanges are exercised only with fake transports.

Migration design and resumable progress are in bookmap-plugin/docs:
`standalone-native-trading-plan.md` and `standalone-native-trading-progress.md`.
`core/marketdata` now includes headless `MarketState`, Camarilla, sticky liquidity,
startup eligibility and the historical consolidation check. Browser callers use
the extracted pure calculations and trade mapper. `runtime/MarketLoader` seeds
complete history buckets, backfills individual prints and deduplicates buffered
live prints. The browser DB now renders this headless state through its adapter.
`npm run test:market` compares 39 headless scenarios and checks worker batching,
history/live overlap and the actual browser DB adapter, including startup races.

The worker preserves each print in its 100ms batch, correcting intermediate OHLC
and traded-dollar/VWAP loss from the former last-price/summed-size merge. Render
throttling remains. The Massive library supports paginated individual-trade
backfill, preserving nanosecond timestamps before converting to domain milliseconds.
History/live loading will seed complete buckets and deduplicate overlapping stream
prints by sequence. The Massive suite now covers 23 scenarios.

The standalone runtime is not yet wired; use the progress document for current
completion status.
