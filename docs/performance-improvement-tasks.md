# Performance Improvement Tasks

Review goal: keep the webapp responsive during the first few minutes after market open.

Working style:
- Do one small item at a time.
- Do not create branches.
- Do not commit from Codex; the user reviews and commits.
- Prefer behavior-preserving changes before throttling trading logic.
- Keep critical trade state updates synchronous; move display/rendering work behind throttles or animation-frame batching.

Last full review: 2026-05-22.

## Current Findings

### Highest risk freeze contributors

1. Duplicate trade feeds still parse after the 2 minute competition window.
   - Files: `src/api/alpaca/streaming.ts`, `src/api/massive/streaming.ts`, `src/controllers/streamingHandler.ts`, `src/main.ts`.
   - Current behavior: both Alpaca and Massive trade websocket messages are still parsed after `competeForTimeAndSalesWindowSeconds`; the non-main source just stops calling `DB.updateFromTimeSale()`.
   - Why it matters: after open, duplicate trade streams can still create `TimeSale` records, scan conditions, update max timestamps, and parse JSON even when ignored.
   - Preferred fix: after the configured competition window, unsubscribe or close the non-main trade stream instead of only ignoring its messages.

2. Per-trade chart rendering is still done on every accepted tick.
   - File: `src/data/db.ts`.
   - Hot path: `DB.updateFromTimeSale()`.
   - Current every-tick display work:
     - `Chart.updateUI(symbol, "currentPrice", ...)`
     - `UI.updateClock(...)`
     - `Chart.updateUI(symbol, "currentVolume", ...)`
     - M1 `volumeSeries.update(...)`
     - M1 `vwapSeries.update(...)`
     - M1 `candleSeries.update(...)`
     - M5 `volumeSeries.update(...)`
     - M5 `candleSeries.update(...)`
     - M5 `vwapSeries.update(...)`
     - M15 updates after the 15 minute gate
   - Why it matters: lightweight-charts updates and DOM text writes are on the browser main thread. At market open this stacks with websocket parsing and trader logic.
   - Preferred fix: keep candle/volume/vwap arrays updated per tick, but batch chart/DOM rendering with `requestAnimationFrame` or a short per-symbol throttle.

3. `updateChartColor()` calls liquidity logic on every accepted tick.
   - Files: `src/data/db.ts`, `src/models/models.ts`.
   - Current path: `DB.updateChartColor()` -> `Models.getLiquidityScale()`.
   - `getLiquidityScale()` calls `getVolumesSinceOpen()`, scans volumes, and calls `getLastVolumeBeforeOpen()` which also scans.
   - Why it matters: this is repeated per accepted trade even though chart color/liquidity state does not need tick-level precision.
   - Preferred fix: compute liquidity scale on new M1 candle or at most once per second per symbol; cache the result for chart color and entry checks.

4. `AutoTrader.onNewTimeAndSalesData()` runs several analysis hooks every accepted tick.
   - Files: `src/algorithms/autoTrader.ts`, `src/tradebooks/tradebooksManager.ts`, `src/controllers/entryRulesChecker.ts`, `src/algorithms/vwapPatterns.ts`.
   - Current every-tick calls:
     - `checkAlgoPendingCondition(symbol)` is currently a no-op.
     - `updatePullbackDepth(symbol, newPrice)`.
     - `alertHigherVolume(symbol)`.
     - `saveRedToGreenState(symbol)`. Removed on 2026-06-02 (see item 14); the red/green reversal state was unused, so the twice-per-tick `conditionallyHasReversalBarSinceOpen()` since-open scan is gone.
     - `TradebooksManager.onNewTimeAndSalesDataForSymbol(symbol, newPrice)`.
     - `getChartAnalysis(symbol)`.
     - `Chart.updateToolTipPriceLine(symbol, status)` when status text exists.
     - `Chart.drawRiskLevels(symbol)`.
   - Why it matters: some of these call helpers that build arrays or scan candles since open. With a position open, `getChartAnalysis()` can call `VwapPatterns.getStatusForVwapContinuationLongWithPremarketHigh()`, which still rebuilds since-open candle and VWAP arrays.
   - Preferred fix: separate per-tick trading state from lower-frequency display/analysis. Run expensive analysis on new candle, once per second, or only when the visible status would change.

5. Account sync and chart redraw timers can overlap with open-time load.
   - Files: `src/algorithms/autoTrader.ts`, `src/api/broker.ts`, `src/ui/chart.ts`, `src/ui/ui.ts`.
   - Current scheduled work:
     - `AutoTrader.scheduleEvents()` calls `Chart.updateAccountUIStatus([], 'every 5 seconds')`.
     - `UI.setupAutoSync()` can also sync every 5 seconds for TradeStation.
     - `Broker.UpdateAccountUIWithDelay()` schedules two account UI refreshes after order events.
   - Why it matters: account sync fetches broker state, rebuilds account cache, then redraws filled lines, target lines, working orders, execution markers, and account UI. If an account event happens near a scheduled sync, the work can stack.
   - Preferred fix: add an in-flight/coalescing guard around account sync/update. Let one sync run, remember a pending request, and run one more after the current one finishes if needed.

6. Quote UI updates are high frequency.
   - Files: `src/data/db.ts`, `src/api/alpaca/streaming.ts`, `src/api/schwab/streaming.ts`, `src/controllers/orderFlowManager.ts`, `src/controllers/simpleRollingWindow.ts`.
   - Current quote path updates DOM for bid, ask, and spread on every selected-source quote.
   - `SimpleRollingWindow.push()` deep-copies numbers through `JSON.parse(JSON.stringify(datapoint))`.
   - Why it matters: quote rate can be high right after open, and DOM writes compete with trade chart rendering.
   - Preferred fix: batch bid/ask/spread DOM writes and remove JSON deep copy for numeric rolling windows.

7. Schwab chart updates are subscribed but ignored.
   - File: `src/api/schwab/streaming.ts`.
   - Current behavior: `subscribeChartUpdates(websocket)` is called after Schwab login, but `CHART_EQUITY` content is ignored.
   - Why it matters: unnecessary websocket messages still parse JSON and iterate content.
   - Preferred fix: remove the subscription unless a real consumer is added.
   - Progress: completed on 2026-05-22. Removed the subscription call, ignored `CHART_EQUITY` handler branch, and `subscribeChartUpdates()`.

8. M30 data still exists even though the chart was removed.
   - Files: `src/data/db.ts`, `src/models/models.ts`, tradebook/timeframe helpers.
   - Current behavior: `buildDataMultipleTimeFrame()` still aggregates M30 candles, volumes, and VWAPs.
   - Why it matters: this is not per tick, but it adds startup/load work and memory.
   - Caution: M30 entry method constants and helper methods still exist. Verify whether any tradebook logic still needs M30 data before deleting model support.

9. Key-area update has a known correctness/perf issue on new candles.
   - File: `src/data/db.ts`.
   - Current TODO: the new-candle key-area update passes `symbolData.keyAreaData` instead of `symbolData.keyAreaData[i].candles`.
   - Why it matters: this can append wrong-shaped objects and duplicate work once per timeframe on new candles.
   - Preferred fix: handle as its own reviewed correctness change. It is not every tick, but it can cause data growth and chart weirdness.

10. Logging and Firestore writes must stay out of hot paths.
    - Files: `src/firestore.ts`, call sites across `src/algorithms`, `src/tradebooks`, `src/data/db.ts`.
    - `Firestore.logInfo()` and `logError()` write to console, Firestore, and the DOM log.
    - Preferred rule: no new per-tick logging. Any diagnostics in tick paths should be behind a debug flag and a time throttle.

## Proposed Implementation Order

### 0. Add lightweight profiling before more behavior changes

Status: not started.

Goal: make the next changes measurable.

Suggested small change:
- Add a dev-only performance counter module or local counters guarded by a config flag.
- Measure counts and total time for:
  - `DB.updateFromTimeSale()`
  - `DB.updateFromLevelOneQuote()`
  - chart render flushes
  - `AutoTrader.onNewTimeAndSalesData()`
  - `Chart.updateAccountUIStatus()`
- Emit one compact summary per second with `console.log` only when profiling is enabled.

Acceptance:
- Profiling is off by default.
- When enabled, output shows per-second counts and average/max durations.
- No Firestore writes from profiling.

### 1. Stop duplicate trade stream work after the competition window

Status: partially completed.

Progress:
- Completed current primary config path on 2026-05-22: when `marketDataSource == "massive"`, Alpaca trades unsubscribe after the competition window while Alpaca quotes remain active.
- Still pending if needed later: when `marketDataSource == "alpaca"`, close or unsubscribe Massive after the competition window.
- 2026-06-02: trade-stream socket receipt, parsing, and competition-window cleanup now run inside the market data worker (see item 13). The worker still unsubscribes Alpaca trades after the window; this work no longer happens on the main thread.

Goal: after the first configured window, only the main trade source should continue delivering trade messages to the app.

Implementation notes:
- Current config:
  - `GlobalSettings.marketDataSource`
  - `GlobalSettings.competeForTimeAndSales`
  - `GlobalSettings.competeForTimeAndSalesWindowSeconds`
- Add websocket references and unsubscribe/close support in:
  - `src/api/alpaca/streaming.ts`
  - `src/api/massive/streaming.ts`
- After auth/subscription, schedule cleanup at `competeForTimeAndSalesWindowSeconds`.
- If `marketDataSource == "massive"`, stop Alpaca trades after the window. Keep Alpaca account websocket and quote subscription only if needed.
- If `marketDataSource == "alpaca"`, stop Massive trades after the window.
- Keep selected quote source behavior unchanged.

Acceptance:
- During first 2 minutes, competition behavior remains.
- After window, non-main trade stream no longer parses trade messages.
- `DB.updateFromTimeSale()` still receives data from the configured main source.

### 2. Remove unused Schwab `CHART_EQUITY` subscription

Status: completed on 2026-05-22.

Goal: avoid parsing ignored Schwab chart messages.

Implementation notes:
- In `src/api/schwab/streaming.ts`, after successful `ADMIN` login, do not call `subscribeChartUpdates(websocket)` unless a config flag explicitly enables it.
- Leave account activity subscription intact.
- Leave Schwab level-one quote subscription gated by `DB.levelOneQuoteSource`.
- Implemented by removing the `subscribeChartUpdates(websocket)` call, the ignored `CHART_EQUITY` message branch, and the `subscribeChartUpdates()` function.

Acceptance:
- [x] Schwab account events still work.
- [x] Schwab quotes still work when selected as `levelOneQuoteSource`.
- [x] No ignored `CHART_EQUITY` stream is subscribed by default.
- [x] `git diff --check` passed.
- [x] `npm run build` passed.

### 3. Batch per-tick chart and DOM rendering

Status: not started.

Goal: keep trade state exact per tick while reducing main-thread rendering.

Implementation notes:
- Add a renderer queue, likely in `src/ui/chart.ts` or a small new UI helper.
- Queue latest values per symbol:
  - current price text
  - current volume text
  - M1 last candle
  - M1 last volume
  - M1 last VWAP
  - M5 last candle/volume/VWAP
  - M15 last candle/volume/VWAP after gate
- Flush with `requestAnimationFrame`.
- If needed, enforce a minimum interval like 100ms for hidden/non-active charts.
- Keep `symbolData` candle/volume/VWAP arrays updated immediately in `DB.updateFromTimeSale()`.
- Start with M1 only if the full batching change feels too large.

Acceptance:
- Latest candle/volume/VWAP still reaches the chart.
- No visible chart freeze during bursty trade input.
- Trading calculations still use live `symbolData`, not delayed render state.
- Build passes.

### 4. Throttle or cache `updateChartColor()` liquidity checks

Status: not started.

Goal: stop scanning volume arrays on every accepted tick.

Implementation notes:
- Add per-symbol cached liquidity state, for example:
  - last check timestamp
  - last market minute or candle time
  - cached liquidity scale
- Update no more than once per second, or only when a new M1 candle starts.
- Keep `throttledCancelAllEntryOrders(symbol)` as-is.
- Consider caching `lastVolumeBeforeOpen` in `SymbolData` during `DB.initialize()` so `Models.getLiquidityScale()` does not scan premarket data repeatedly.

Acceptance:
- Chart color still changes soon after liquidity conditions change.
- Entry cancellation still works when liquidity is bad.
- `Models.getLiquidityScale()` is not called per accepted tick from chart-color logic.

### 5. Split `AutoTrader.onNewTimeAndSalesData()` into tick-critical and display/analysis work

Status: not started.

Goal: make per-tick auto-trader work predictable and cheap.

Suggested split:
- Keep per tick:
  - `updatePullbackDepth(symbol, newPrice)` if position exists.
  - Bookmap wall pullback tracking if still needed.
- Move to new candle or once per second:
  - `alertHigherVolume(symbol)`
  - `getChartAnalysis(symbol)`
  - tooltip price line updates
  - risk-level drawing if re-enabled later
- Remove or stop calling `checkAlgoPendingCondition(symbol)` if it remains a no-op.
- `saveRedToGreenState(symbol)` no longer applies; the red/green reversal state was removed on 2026-06-02 (item 14).

Acceptance:
- Tooltip status still updates, but at a bounded rate.
- Tradebook tick callbacks only run for tradebooks that actually implement useful tick behavior.

### 6. Optimize tooltip price-line updates

Status: not started.

Goal: stop remove/recreate price line churn when status text or price has not changed.

Implementation notes:
- Current path:
  - `AutoTrader.getChartAnalysis()`
  - `Chart.updateToolTipPriceLine(symbol, status)`
- Add cached last tooltip text and price per symbol/timeframe.
- Only remove/recreate the line if text changes or price moves enough to matter.
- Consider replacing this chart price line with a normal DOM status label if exact price anchoring is not important.

Acceptance:
- Tooltip/status display remains available when in position.
- `removePriceLine()` and `createPriceLine()` are not called repeatedly for identical status.

### 7. Optimize `getChartAnalysis()` and VWAP status helpers

Status: partially completed.

Progress:
- Removed `structuredClone()` from `VwapPatterns.getStatusForVwapContinuationLongWithPremarketHigh()` because it only reads the candle/VWAP arrays.
- Still pending: avoid rebuilding since-open arrays and reduce how often chart analysis runs in the tick path.

Goal: remove expensive array cloning/scanning from position tick path.

Implementation notes:
- `VwapPatterns.getStatusForVwapContinuationLongWithPremarketHigh()` no longer uses `structuredClone()` when reading candle and VWAP arrays.
- Avoid building since-open arrays just to inspect last/current candles.
- Cache:
  - open price
  - last VWAP before open
  - first since-open index for candle/VWAP arrays
- Consider running this only on new candle or once per second.

Acceptance:
- Same status strings for known scenarios.
- [x] No `structuredClone()` in tick-triggered chart analysis.

### 8. Batch quote DOM updates and simplify numeric rolling windows

Status: not started.

Goal: reduce high-frequency quote UI cost.

Implementation notes:
- In `DB.updateFromLevelOneQuote()`, keep `symbolData.bidPrice/askPrice/bidSize/askSize` immediate.
- Queue DOM writes for `bid`, `ask`, and `spread` through the same renderer queue used for trades, or throttle to 100-250ms per symbol.
- In `SimpleRollingWindow.push()` and `RollingWindow.push()`, avoid `JSON.parse(JSON.stringify(datapoint))` for numbers.
- Keep spread monitor behavior unchanged.

Acceptance:
- Quote values still update visually.
- Spread monitor still receives selected-source quote data.
- Numeric rolling window push no longer JSON serializes numbers.

### 9. Coalesce account sync and account UI redraw

Status: completed on 2026-05-23.

Progress:
- Added an in-flight guard around `Chart.updateAccountUIStatus()`.
- Simplified `Chart.updateAccountUIStatus()` to take only a source label and always refresh all watchlist symbols.
- While a refresh is running, new requests are merged into one pending refresh by source label.
- After the active refresh finishes, the pending refresh runs once, then the guard clears.

Goal: prevent overlapping broker sync and chart redraw work.

Implementation notes:
- Add an in-flight guard around `Chart.updateAccountUIStatus()` or `Broker.syncAccount()`.
- If a sync is in progress, mark a pending refresh instead of starting another.
- When current sync finishes, run one pending refresh if requested.
- Revisit timers:
  - `AutoTrader.scheduleEvents()` every 5 seconds.
  - `UI.setupAutoSync()` every 5 seconds for TradeStation.
  - `Broker.UpdateAccountUIWithDelay()` two delayed refreshes.
- Draw working-order price lines only when account state changed, if feasible.

Acceptance:
- [x] Account UI still refreshes after order events.
- [x] Periodic refresh still happens.
- [x] Multiple requests collapse into one active sync plus at most one pending sync.

### 10. Review and fix key-area new-candle update

Status: not started.

Goal: correct wrong-shaped data growth and avoid redundant chart updates on new candles.

Implementation notes:
- Current TODO in `src/data/db.ts` notes this line passes the parent array:
  - `addDataAndUpdateChart(newTime, symbolData.keyAreaData, kac, allCharts[j].keyAreaSeriesList[i]);`
- Expected target is likely:
  - `symbolData.keyAreaData[i].candles`
- Also verify whether key-area updates should run for all timeframe charts or only the corresponding timeframe series.
- Handle as a correctness change, not bundled with throttling.

Acceptance:
- Key-area series still render.
- `symbolData.keyAreaData` remains an array of `{ candles }` objects only.
- No wrong-shaped items are appended on new candle.

### 11. Finish M30 cleanup if truly unused

Status: not started.

Goal: remove remaining M30 startup/memory cost if no strategy uses it.

Implementation notes:
- Search references to:
  - `m30Candles`
  - `m30Volumes`
  - `m30Vwaps`
  - `getCandlesFromM30SinceOpen`
  - `TimeFrameEntryMethod.M30`
  - `CommonEntryMethods.FirstNewLowM30`
- If M30 is only dead UI/data, remove from `SymbolData`, aggregation, and helpers.
- If a tradebook still needs M30 logic, leave the model data and only document why the chart is gone but data remains.

Acceptance:
- Build passes.
- No remaining M30 chart rendering.
- Either M30 data is deleted, or the doc explains the strategy dependency.

### 12. Optional: lazy-create M15 chart after the 15 minute gate

Status: not started.

Goal: avoid M15 chart creation and initial `setData()` work during market open.

Implementation notes:
- Current behavior creates M1, M5, and M15 chart objects during `Chart.createChartWidget()`.
- M15 rendering is gated, but the chart still exists from startup.
- Bigger change: create M15 chart only when:
  - `m15ChartEnabledAfterSeconds` has passed, or
  - the user clicks M15 after the gate.
- This is higher risk than render batching. Do after the easier hot-path work.

Acceptance:
- M1/M5 initial charts work.
- M15 appears after gate.
- No null chart access before M15 creation.

### 13. Offload time & sales socket + parsing to a Web Worker

Status: completed on 2026-06-02.

Goal: move the highest-frequency open-time work — Alpaca/Massive trade WebSocket receipt, `JSON.parse`, per-trade parsing, condition filtering, and Alpaca level-one quote parsing — off the browser main thread into a Web Worker. Candle aggregation, chart/DOM rendering, quote application, and tradebook evaluation stay on the main thread because they touch `window.HybridApp` and the charts.

The worker owns the **entire Alpaca market-data socket** (trades + level-one quotes), the **Massive trades socket**, and the **Schwab streamer socket** (account activity + level-one quotes); when `useMarketDataWorker` is on, none of these sockets are created on the main thread. Parsed quotes are applied on the main thread via `AlpacaStreaming.applyLevelOneQuote()` / `SchwabStreaming.applyLevelOneQuote()`, and Schwab account-activity content is relayed raw to `SchwabStreaming.handleAccountActivity()` (low frequency, kept on main), so spread-monitor / order-flow / account-UI consumers see identical data.

Schwab is wired through the worker now even though it is not the active level-one quote source today (`levelOneQuoteSource == alpaca`): its account-activity stream is always active, and level-one is subscribed only when `levelOneQuoteSource == schwab`, so flipping that flag routes Schwab quotes through the worker with no further changes.

Design:
- The worker owns the trade sockets, authenticates/subscribes, parses each frame, and posts parsed records back. The main thread only runs the existing `DB` apply path.
- Batching is per WebSocket frame: one inbound frame (already an array of N trades) produces one outbound `postMessage`. No artificial flush timer, so there is no added latency for trade-driven chart updates.
- Behavior is preserved: records are forwarded with their `shouldFilter` flag and `source`, and `DB.tryUpdateMaxTimeSaleTimestamp()` + filtering still run on the main thread, so competition/dedup/diagnostics are identical to the pre-worker path.
- Feature-flagged via `GlobalSettings.useMarketDataWorker` (default `true`); set to `false` to fall back to the original main-thread sockets.
- Communication uses `postMessage` / structured clone only (Date is cloneable). `SharedArrayBuffer` is intentionally avoided: it requires cross-origin isolation (`COOP: same-origin` + `COEP: require-corp`), which would block the remote scripts from `tradingdata-15425.web.app` and the localhost proxy, and `TimeSale` is a variable-length object with strings rather than a fixed numeric buffer.

New files:
- `src/streaming/timeSaleParse.ts` — worker-safe ports of `createAlpacaTimeSale` / `createMassiveTimeSale`; reuses `Helper`; keeps the trade-condition constants local so it does not import `StreamingHandler` (which pulls in DB/charts/broker).
- `src/streaming/levelOneQuoteParse.ts` — worker-safe ports of `createAlpacaLevelOneQuote` / `createSchwabLevelOneQuote`.
- `src/workers/marketDataMessages.ts` — shared message contract: `start` / `stop` in; `timeSale`, `quote`, `accountActivity`, `status`, `error` out.
- `src/workers/marketDataWorker.ts` — worker entry; owns the Alpaca market-data socket (trades + quotes), Massive trades socket, and Schwab streamer socket, auth/subscribe, per-frame parse + batched post, and Alpaca competition-window unsubscribe.
- `src/controllers/marketDataWorkerBridge.ts` — main-thread side; builds the start payload from `Secret` / `Models.getWatchlist()` / `GlobalSettings` / `DB.levelOneQuoteSource` (including the pre-built Schwab login/subscribe requests), applies trades via `StreamingHandler.applyWorkerTimeSale()`, quotes via the per-source `applyLevelOneQuote()`, and account activity via `SchwabStreaming.handleAccountActivity()`; stops the worker on `beforeunload`.

Modified files:
- `src/config/globalSettings.ts` — added `useMarketDataWorker` flag.
- `src/controllers/streamingHandler.ts` — added `applyWorkerTimeSale(record, shouldFilter, source)`, which mirrors the apply logic of the Alpaca and Massive `handleTimeAndSalesData()` functions in one place.
- `src/api/alpaca/streaming.ts` — extracted `applyLevelOneQuote(quote)` from `handleQuoteUpdates()` so the worker and the main socket share the same apply path; the main socket also no longer subscribes to trades when the worker is on.
- `src/api/schwab/streaming.ts` — extracted `applyLevelOneQuote(quote)` and `handleAccountActivity(contents)`, and added `getStreamerSocketUrl()` / `createActivitySubscribeRequest()` / `createLevelOneSubscribeRequest()` builders so the bridge can assemble the Schwab worker config and both paths share the same apply logic.
- `src/main.ts` — when the flag is on, starts the worker and skips the now-redundant main-thread Alpaca, Massive, and Schwab sockets; otherwise uses the original sockets.

Other streaming sources evaluated and intentionally left on the main thread:
- Bookmap socket: `orderbook` frames are discarded on arrival; remaining messages are low-frequency user actions that must run on main.

Acceptance:
- [x] `npx tsc --noEmit` passes.
- [x] `npm run build` passes; worker emits as its own chunk.
- [ ] Live verification during market hours: confirm trades still flow into M1/M5 charts.

### 14. Remove unused red/green reversal state

Status: completed on 2026-06-02.

Goal: drop the per-tick red/green reversal scan, which was dead weight at market open.

Finding: `AutoTrader.saveRedToGreenState()` ran on every accepted tick and called `EntryRulesChecker.conditionallyHasReversalBarSinceOpen()` twice (long + short), each scanning candles since open. The resulting `widget.redToGreenState` was no longer consumed anywhere — `AutoTrader.hasReversalMove()` and `Models.getRedToGreenState()` had zero callers.

Removed:
- `src/algorithms/autoTrader.ts` — the `saveRedToGreenState(symbol)` call in `onNewTimeAndSalesData()`, the `saveRedToGreenState()` and `hasReversalMove()` functions, the now-unused `EntryRulesChecker` import, and the empty `autoTriggerRedToGreen60()` stub plus its call in `onMarketJustOpened()`.
- `src/models/models.ts` — the `redToGreenState` field on `ChartWidget`, the `RedToGreenState` interface, and the unused `getRedToGreenState()` getter.
- `src/ui/chart.ts` — the `redToGreenState` initializer in `createChartWidget()`.

Left in place: `EntryRulesChecker.conditionallyHasReversalBarSinceOpen()` (may be used by other entry logic; only its red/green callers were removed).

Acceptance:
- [x] `npm run build` passes.
- [x] No remaining references to `redToGreenState` / `saveRedToGreenState` / `hasReversalMove` / `getRedToGreenState`.

## Verification Checklist For Each Item

- Run `git diff --check`.
- Run `npm run build` for code changes.
- For stream changes, confirm browser console shows only the intended active trade source after the competition window.
- For render throttling, manually watch:
  - current price text
  - current volume text
  - M1 candles
  - M5 candles
  - M15 after gate
  - bid/ask/spread if the quote path changed
- For account sync changes, place or simulate an order event and confirm working orders/positions redraw.
- Keep each diff small enough to review and commit independently.
