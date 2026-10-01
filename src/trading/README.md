# Mirrored trading library

This namespace contains the Bookmap-independent trading modules. Match changes
here with Java `com.bookmap.plugin.rong.miniviteapp` in the sibling
`bookmap-plugin` repository. Keep vendor schemas in libraries, trading decisions
in core, orchestration in runtime and browser globals/DOM/transports in adapters.

| Folder | Responsibility |
| --- | --- |
| `libraries/massive` | Paginated history/reference/trade reads and shared trade mapping |
| `libraries/firestore` | Direct REST config/state access, Value codec and audit repositories |
| `libraries/broker/schwab` | OAuth/refresh, account/preferences/daily orders, account projection, order payloads, vendor stream protocols |
| `core/marketdata` | Eastern session clock, candles/VWAP, Camarilla, liquidity and startup eligibility |
| `core/account`, `core/state` | Fill ledger/P&L/add stack and captured/persisted trading state |
| `core/configuration` | Selected-plan validation and active wall-reversal definitions |
| `core/controllers` | Risk/rule/entry/target/exit decisions, Q/P/trailing/discipline jobs, execution inputs and local views |
| `runtime` | History/live handoff, reconnecting streams and standalone startup/timers/state ownership |
| `ports` | Injectable HTTP/socket/credential contracts |
| `adapters` | Browser fetch/localStorage, account/UI conversions and observation metadata |

The browser remains bootstrapped through main.ts and its chart/global adapters.
Production market DB, Schwab reads, OAuth, ledger, state, configuration validation,
order factories and shared risk/workflow helpers use these modules. TradingRuntime
is a headless mirror tested independently; it does not replace every browser UI
callback. Java NativeRuntime is wired into Bookmap's first/last addon attachment.
The Java engine compiles without Bookmap APIs and uses direct HTTPS/WSS, so it
needs neither this browser app nor ProxyServer.

The browser execution bridge and executionEntryContext/market-data publishers are
removed. Browser broker credentials/observation ordering remain private to
`adapters/browserBrokerMetadata.ts`; nothing forwards them to the plugin.
Both apps execute their own operations. Run one at a time because each owns the
vendor streams. Bookmap configuration/data/state now originate from the same
Massive, Firestore and Schwab sources instead of being forwarded by ViteApp.

Behavior preserved includes risk sizing, ten-partial/$1,000 R policy, optional
core-target protection, daily loss/startup eligibility, protected entry payloads,
reload/swap delays and exits without preflight GETs. Explicit corrections include
retaining every worker print, exact history/backfill overlap, Eastern historical
DST, paginated history, partial/canceled/replaced fills, position-reversing fill
splits, capped order-read detection, remaining-position target coverage and
protective-risk coverage. Buying-power allocation halves targets once and warns
while submitting if still insufficient, aligning browser/native behavior.

Firestore preserves `state-{profile}/tradingState`, latest
`configDataSnapshot`, audit formats and seven-/three-day TTLs. REST access uses
existing security rules; API keys do not grant administrator access. OAuth uses
returned expiry, coalesces refreshes and persists rotated tokens. No fixed token
lifetime is assumed. Browser credentials remain in their existing localStorage;
Java's user-owned JSON and the browser credential store do not synchronize.

## Validation

Run `npm run build` and the following package scripts after relevant changes:

- `test:runtime`: fake-service standalone startup, renewal, accepted entry/state,
  manual controls, account read coalescing/429, config removal and teardown.
- `test:state`: 99 production-generated ledger/state/config/workflow/view cases,
  including closed-minute VWAP history/projection and risk/target coverage.
- `test:market`: 39 shared headless cases plus actual browser DB/worker and
  history/live/replaced-load regression tests.
- `test:massive`: 23 REST/mapper cases.
- `test:services`: 22 Firestore/OAuth/audit cases plus concurrent token refresh.
- `test:broker-read`: 23 broker read/projection cases.
- `test:streams`: 18 protocol cases plus fake-socket reconnect lifecycle.
- `test:direct-execution`, `test:extended-execution`,
  `test:core-target-exits`: production entry/exit/risk/request parity and captured
  add/core state. The old 'extended' test name refers to workflow coverage, not a flag.

Fixture generators under scripts write matching JSON into both repositories.
Regenerate the relevant fixtures without `--check`, review their changes and run
Java's `gradlew.bat build`, including native-only compile and obfuscated-JAR tests.
No automated check sends live orders or writes real Firestore state.

Setup, exact operation coverage, deliberate exclusions and the durable resume log:
[standalone operations](../../../bookmap-plugin/docs/direct-broker-execution.md),
[design](../../../bookmap-plugin/docs/standalone-native-trading-plan.md),
[progress](../../../bookmap-plugin/docs/standalone-native-trading-progress.md).
