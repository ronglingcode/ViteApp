# Replay Mode Design

## Goal

Add a local replay mode for one stock on one trading day so the full ViteApp market-data and rendering path can be run repeatedly, especially around market open, to diagnose performance problems.

Replay mode uses the same page shell, charts, `DB` aggregation, chart rendering, and non-Bookmap tradebook logic as live mode. Its market-data source is ProxyServer instead of Massive/Schwab. It must never connect to a live broker, place/cancel orders, write replay logs to Firestore, or connect to Bookmap.

## Decisions

1. `/replay` is a route of the existing full app, not a copied HTML page.
   - Firebase already rewrites all paths to `index.html`.
   - ViteApp detects `location.pathname === "/replay"` before startup.
   - The replay selector and controls are inserted above the existing UI.
   - Reusing `index.html` prevents live and replay layouts from drifting apart.

2. Record the messages that the market-data worker delivers to the main thread.
   - The live path is Massive WebSocket -> `marketDataWorker.ts` -> 100 ms `TradeFlushBuffer` -> `timeSaleFlush` -> `StreamingHandler.applyWorkerTimeSaleFlush()` -> `DB`.
   - The worker keeps every parsed print in order and flushes them to the main thread every 100 ms. `DB` then applies every accepted print to the market clock, OHLCV, VWAP, and high/low state in received order.
   - A capture sink inside the worker copies each outgoing `timeSaleFlush` without delaying delivery to the main thread. It groups those envelopes for one persistent WebSocket send per second; it does not make ten HTTP calls per second.
   - Each saved envelope retains its original sequence and `arrivalOffsetMs`, so the one-second network batching does not reduce replay timing resolution. Serialization and networking stay off the browser main thread.
   - Replay delivers the same `WorkerToMainMessage` shapes to the existing bridge. The downstream code under performance test is unchanged.
   - Do not call the existing `/save/timeandsales` endpoint once per trade. Per-trade HTTP requests would add load, alter live performance, and create excessive file operations.

3. Use a precise, non-overlapping history/replay cutover.
   - Exchange timezone is always `America/New_York`.
   - Market open is 09:30 ET.
   - If ViteApp is ready before 09:25 ET, the cutover is 09:25:00. Historical M1 bootstrap data contains candles whose start is strictly before 09:25 and replayed time-and-sales begins at `tradeTime >= 09:25:00`.
   - If ViteApp starts after 09:25, it first loads all currently available M1 data. That state, including the current partial minute, becomes the bootstrap; the recording cutover is the late startup time and time-and-sales capture starts immediately afterward.
   - A late recording therefore replays from its actual startup boundary, not from 09:25, and does not claim to contain the missing earlier time-and-sales stream.
   - The cutover is stored as an epoch timestamp in the manifest, so browser locale and daylight-saving rules cannot move it.
   - The actual 09:30 market-open timestamp is stored separately because it cannot be derived as `cutover + 5 minutes` for a late recording.

4. A recording is for one symbol and one market date.
   - This matches the app's current single-stock watchlist rule.
   - Selecting another symbol/day reloads `/replay?recording=<id>` and creates a clean application state.
   - Restart also reloads the page. Resetting all of the existing global maps, timers, chart objects, and tradebook state in place is unnecessarily risky.

5. Replay has explicit capabilities, not scattered checks against a URL.
   - Runtime mode: `live | replay`.
   - Capabilities include live market data, live broker, external writes, Bookmap, and replay controls.
   - Replay capabilities set live market data, live broker, external writes, and Bookmap to false.
   - All order entry/cancel/replace methods also enforce the broker capability at the final broker boundary. Hiding buttons alone is not a sufficient safety control.

6. Keep two notions of time.
   - Market time is the current replay event time and is used by market rules, tradebooks, chart annotations, and the displayed clock.
   - Wall/monotonic time is the actual browser time and is used for render throttles, performance duration, network backpressure, and replay scheduling.
   - `performance.now()` remains a real monotonic clock. It must not be replaced by replay time.

## Scope

### Required in the first usable version

- Record the selected stock's batched time-and-sales messages from the recording cutover through the end of the session.
- Save a bootstrap bundle containing M1 state before the cutover, daily bars, premarket-volume statistics, and shares outstanding.
- List available recordings by date and symbol.
- Load one recording on `/replay` and play it at 1x through the existing `StreamingHandler` and `DB` path.
- Provide play, pause, speed, and restart controls.
- Disable live Massive and Schwab sockets, broker token refresh/account sync/order calls, Firestore writes, scheduled broker refresh work, and every Bookmap feature.
- Mark incomplete or gapped recordings instead of presenting them as complete.

### Strongly recommended for performance fidelity

Capture the selected Level 1 quote stream as `quote` events too. Quote DOM updates and spread/order-flow calculations are known high-frequency work. A time-and-sales-only recording is valid, but it cannot reproduce quote-related load and should show `quotes: unavailable` in the replay toolbar.

### Not in the first version

- Bookmap/order-book capture or replay.
- Live order execution from replay.
- Multiple simultaneous symbols.
- Arbitrary backward seeking within a running page.
- Perfect reproduction of vendor WebSocket JSON parsing inside the worker.

The chosen capture boundary reproduces main-thread load accurately. If later profiling shows the market-data worker itself is the bottleneck, an optional raw Massive-frame recording can be added without changing the replay file/API contract at the main-thread boundary.

## Architecture

```text
Live

Massive/Schwab sockets
        |
        v
marketDataWorker (100 ms trade flushes)
        |                         \
        | WorkerToMainMessage      \ batched capture, off main thread
        v                           v
marketDataWorkerBridge         ProxyServer capture WebSocket
        |                           |
        v                           v
StreamingHandler -> DB -> UI    local recording files


Replay

ProxyServer bootstrap REST -----> DB.initialize -> existing charts
ProxyServer playback WebSocket --> replay worker
                                      |
                                      | same WorkerToMainMessage
                                      v
                              marketDataWorkerBridge
                                      |
                                      v
                              StreamingHandler -> DB -> UI
```

## Recording Format

Use inspectable, append-only local files with a small JSON manifest. Do not keep a full trading day in ProxyServer memory.

```text
ProxyServer/data/replay/
  2026-07-17/
    TSLA/
      <recording-id>/
        manifest.json
        bootstrap.json
        events-00000.jsonl
        events-00001.jsonl
```

### `manifest.json`

Suggested fields:

```json
{
  "schemaVersion": 1,
  "recordingId": "2026-07-17_TSLA_001",
  "marketDate": "2026-07-17",
  "symbol": "TSLA",
  "exchangeTimezone": "America/New_York",
  "cutoverEpochMs": 1784294700000,
  "marketOpenEpochMs": 1784295000000,
  "source": "massive",
  "appVersion": "captured ViteApp version",
  "startedAtEpochMs": 0,
  "firstMarketEventEpochMs": 0,
  "lastMarketEventEpochMs": 0,
  "eventCount": 0,
  "tradeRecordCount": 0,
  "quoteEventCount": 0,
  "droppedCaptureBatchCount": 0,
  "status": "recording",
  "gaps": []
}
```

`status` is one of `recording`, `complete`, `incomplete`, or `corrupt`. A recording is complete only when it has a valid bootstrap, starts no later than the cutover, has no sequence gaps, and was finalized normally (or passes recovery validation).

### `bootstrap.json`

The bootstrap is the local replacement for market-data startup calls:

```ts
interface ReplayBootstrap {
    symbol: string;
    marketDate: string;
    cutoverEpochMs: number;
    today1MinuteBars: Candle[];       // datetime < cutoverEpochMs
    dailyBars: Candle[];
    premarketDollarCollection: PremarketDollarCollection;
    sharesOutstanding: number;
    runtimeSnapshot: {
        activeProfileName: string;
        tradingSettings: unknown;
        tradingPlanForSymbol: unknown;
        marketCapInMillions: number;
    };
}
```

The runtime snapshot contains no secrets, access tokens, account data, or API keys. Capturing the symbol's plan makes a replay reproducible even if the current Firestore plan changes later.

For an on-time recording, ViteApp uploads an initial bootstrap after historical data loads and replaces it atomically with a final snapshot at the 09:25 cutover. For a late recording, live streaming waits until history is initialized, that M1 state is uploaded once, and capture starts from the late cutover. The server validates that no candle beginning at or after the recording cutover is present.

### Event line

Each JSONL line is an event envelope:

```ts
interface StoredReplayEvent {
    sequence: number;
    arrivalOffsetMs: number;       // performance.now() relative to capture start
    marketTimeEpochMs: number;     // last exchange time represented by the event
    message: WorkerToMainMessage;  // timeSaleFlush or quote in v1
}
```

The serializer converts `Date` fields such as `TimeSale.receivedTime` to epoch milliseconds; the replay worker restores them to `Date` before posting the message to the main thread.

`arrivalOffsetMs` is captured when the worker delivers the 100 ms flush to the app. Capture-side buffering may combine event envelopes for network efficiency, but it must not change this timestamp, the stored flush boundary, or live delivery timing.

Files rotate at a fixed size (for example 64 MiB). ProxyServer writes through one open `WriteStream` per active recording and honors stream backpressure. Closed chunks may be gzip-compressed. The current open chunk remains plain append-only JSONL so a crash can be recovered by discarding only a malformed trailing line.

## ProxyServer API

All paths use server-created recording IDs. Dates and symbols are metadata, never unvalidated filesystem paths. Symbols should be restricted to a small allowlist pattern such as `[A-Z0-9._-]{1,20}`.

### Recording lifecycle

```text
POST /replay/recordings
PUT  /replay/recordings/:id/bootstrap
WS   /replay/recordings/:id/capture
POST /replay/recordings/:id/finalize
```

- `POST` creates the directory and manifest, then returns the recording ID and capture WebSocket URL.
- `PUT bootstrap` writes to a temporary file, validates it, then renames it atomically.
- The capture WebSocket accepts batches of event envelopes. Batching reduces browser/network overhead while every envelope retains its own sequence and timing.
- `finalize` flushes and closes streams, validates counts/coverage, writes final manifest state, and optionally compresses closed chunks.
- If ViteApp closes unexpectedly, ProxyServer closes an idle session and marks it incomplete. Recovery can still expose it with a warning.

### Discovery and playback

```text
GET /replay/recordings?date=YYYY-MM-DD&symbol=TSLA
GET /replay/recordings/:id
GET /replay/recordings/:id/bootstrap
WS  /replay/recordings/:id/play?speed=1
```

The list response is lightweight manifest data and supports either filter independently. The playback WebSocket reads event chunks incrementally and schedules them from `arrivalOffsetMs`:

```text
due wall time = playback wall start
              + (event arrival offset - first played offset) / speed
```

It never sorts events, skips late events, or combines stored messages. Preserving recorded order and batch boundaries is more important than matching exchange timestamps after out-of-order delivery.

Playback control commands are `play`, `pause`, and `speed`. Raw data messages and control/status messages are distinguishable without changing the saved `WorkerToMainMessage` payload. If the WebSocket send buffer grows, ProxyServer pauses delivery instead of accumulating unbounded memory.

Suggested speeds are 0.5x, 1x, 2x, 5x, and 10x. The default is 1x. Faster speeds are stress tests; only 1x attempts arrival-timing fidelity.

## ViteApp Startup

Refactor the current `TOS.initialize()` callback into shared UI setup plus two mode-specific bootstraps.

### Live bootstrap

Live behavior remains the same, with one addition: if capture is enabled and ProxyServer is available, create a recording and pass its capture configuration to the existing market-data worker.

Capture failure is non-fatal to live trading. The worker uses a bounded queue, reports a throttled warning, increments dropped-batch metadata when possible, and never blocks delivery to the main thread.

### Replay bootstrap

1. Load the recording manifest and bootstrap from ProxyServer.
2. Apply the recorded trading date before chart/tradebook modules calculate market times.
3. Restore the sanitized runtime snapshot and force a one-symbol watchlist.
4. Create an empty replay account/trading state without refreshing broker tokens or fetching account/user-preference data.
5. Run the existing `Chart.setup()` and `DB.initialize()` with bootstrap candles/daily bars.
6. Do not start Massive, Schwab, broker account-activity, or Bookmap sockets.
7. Start the replay worker only after every chart is initialized, so early replay events cannot be dropped by `DB`.
8. Advance the market clock before applying each stored event.

## Clock Changes

The app already calls `TimeHelper.setCurrentMarketTime()` from time-and-sales processing, but many rule and tradebook paths still call `new Date()` directly. Introduce a small clock interface:

```ts
interface RuntimeClock {
    marketNow(): Date;
    wallNowMs(): number;
    monotonicNowMs(): number;
}
```

- Live `marketNow()` returns the real current time.
- Replay `marketNow()` returns the latest replay event time.
- Wall and monotonic time remain real in both modes.

Replace direct `new Date()` only where it means market time (entry timing, market-open rules, tradebooks, chart annotations, and scheduled market events). Keep actual time in UI render throttles, performance measurements, capture buffering, and account-request coalescing.

Do not monkey-patch the global `Date`; that would corrupt throttle behavior and make performance measurements misleading.

For the first performance-focused increment, event-driven market time is sufficient. Market-open scheduled actions should either be driven when replay crosses their timestamp or be explicitly disabled until moved to the runtime clock. They must not schedule against today's real clock.

## Replay Safety and Bookmap Exclusion

Replay startup must enforce all of the following:

- Broker API adapter is a disabled/replay adapter.
- Final order submit, cancel, and replace boundaries reject with a local replay message even if a UI or auto-trader path reaches them.
- No token refresh, user-preference fetch, account sync, account activity socket, or five-second account refresh.
- Firestore reads may be avoided by using the runtime snapshot; Firestore writes/logging are replaced by local console/replay-panel logging.
- `enableBookmapSocket` is effectively false.
- Do not call `BookmapSocket.sendKeyLevelConfigForSymbol()` after history load.
- Do not instantiate `BookmapWallBreak` or `BookmapWallReversal` tradebooks.
- Do not render Bookmap tradebook buttons or the Bookmap panel.
- Ignore Bookmap custom events/actions, and use non-Bookmap target fallback behavior.

The replay toolbar should display a persistent `REPLAY - ORDERS DISABLED - BOOKMAP OFF` label.

## Performance Diagnostics

Replay is most useful when runs are comparable. Add a profiling flag and collect, at minimum:

- stored events received per second;
- trades present in each `timeSaleFlush` and trades accepted after filtering;
- worker-message apply count, average duration, and maximum duration;
- chart render flush count and duration;
- quote apply count and duration when quotes exist;
- main-thread long-task count/total duration with `PerformanceObserver` where supported;
- event-delivery lag (actual apply time minus scheduled apply time);
- JavaScript heap size where Chrome exposes it;
- recording ID, replay speed, app version, and replay start/end market times.

Logging is summarized once per second and never written to Firestore. An optional `POST /replay/runs` can save a small JSON performance summary beside the recording. DevTools Performance traces remain the primary tool for detailed flame charts.

Recommended performance workflow:

1. Choose the same recording and start at 1x.
2. Profile the 09:29:30-09:35:00 window.
3. Record long tasks, event lag, maximum DB time, render rate, and heap growth.
4. Make one performance change.
5. Repeat the same recording/window and compare.
6. Use 2x/5x only after the 1x behavior is stable, as a stress margin rather than a fidelity claim.

## Failure Handling

- ProxyServer unavailable during live capture: live data continues; replay capture shows disconnected.
- Capture queue full or WebSocket backpressure: drop capture batches rather than live market updates, increment a gap counter, and mark the recording incomplete.
- ViteApp starts after 09:25: initialize current M1 history first and create a valid late-start recording. It is complete if it runs normally through session finalization, but it is not an opening-performance fixture.
- Browser or ProxyServer crash: recover all complete JSONL lines, discard a partial last line, and mark incomplete.
- Duplicate or out-of-order trades: preserve the already-recorded worker message exactly; do not “fix” it during replay.
- App version differs from the capture version: warn but allow replay. This is expected when measuring a fix against an older fixture.
- Missing quote data: replay time-and-sales normally, show quote data as unavailable, and do not invent a spread.
- Corrupt bootstrap or a candle/event overlap at the cutover: reject normal playback and show the validation error.

## Validation and Acceptance Criteria

### Data correctness

- Bootstrap's last M1 candle starts before that recording's cutover and the first replayed trade is at or after the cutover.
- Replaying a fixture produces the same final M1 OHLCV and VWAP state as applying its stored event messages directly.
- Multiple prices and sizes received in one vendor frame produce the same OHLCV/VWAP state as applying every print sequentially; no worker-side merge may discard an intermediate high, low, open, or notional value.
- Stored event sequence/count and manifest count match.
- Pause does not advance market time or apply events; resume does not duplicate events.
- At 1x, event scheduling remains within a defined tolerance and reports lag instead of dropping events.

### Isolation and safety

- Network inspection shows no Massive, Schwab, broker, or Bookmap connections on `/replay`.
- No order submit/cancel/replace call can leave the browser.
- No Firestore write occurs during replay.
- No Bookmap tradebook, panel, socket, or action is active.

### Performance fidelity

- Capture networking and serialization occur in the worker, not the main thread.
- Main-thread replay enters through the same `handleWorkerMessage()` -> `StreamingHandler` -> `DB` path as live data.
- Live and replay both enter the main thread as the same stored 100 ms `timeSaleFlush` messages.
- Stored batch boundaries and arrival offsets are preserved at 1x.
- ProxyServer streams from disk and applies backpressure without reading the full day into memory.

### ProxyServer safety

- Path traversal attempts and invalid symbols/dates are rejected.
- Only server-generated recording directories are writable.
- A slow or disconnected client closes its file stream and playback session cleanly.
- No secrets or account data are stored in a recording.

## Implemented Operation

The implementation is enabled by `enableReplayCapture` in `src/config/globalSettings.ts`.

1. Start ProxyServer with `npm start`. Recordings are stored under `ProxyServer/data/replay/` by default; set `REPLAY_DATA_ROOT` to override the location.
2. Start ViteApp normally. When the watchlist contains one symbol and the market-data worker is enabled, ViteApp creates one recording and opens one persistent capture WebSocket.
3. For an on-time launch, capture begins at 09:25. For a late launch, ViteApp loads current M1 history first and then begins capture at a new late cutover. The worker sends accumulated capture envelopes to ProxyServer once per second; live delivery to ViteApp remains on its existing 100 ms cadence.
4. ViteApp uploads the appropriate boundary bootstrap and automatically finalizes the recording just after the regular 16:00 ET close.
5. Open `/replay`, select a date/symbol recording, and use Play, Pause, speed, or Restart. The toolbar reports apply time, render time/rate, accepted trades, quotes, replay lag, long tasks, and heap size when supported.

A recording is marked `complete` only if capture began at its declared cutover, a valid bootstrap exists, at least one event was saved, no sequence gap/drop was reported, and finalization completed. Closing the app early produces an `incomplete` recording that remains selectable for debugging.

ProxyServer validation is run with `npm test`. ViteApp validation is run with `npx tsc --noEmit` and `npm run build`.

## Implementation Plan

### Phase 1: runtime boundary and safety

- Add runtime mode/capabilities and the live/replay clock.
- Split shared UI setup from live TOS/broker startup.
- Add the replay-disabled broker boundary and Firestore-write guard.
- Gate all Bookmap creation, tradebooks, panels, and messages by capability.

This phase should not change live behavior.

### Phase 2: ProxyServer recording store

- Add recording models, validated paths, manifest/bootstrap storage, rotating JSONL writer, and recovery.
- Change `index.js` to create an HTTP server and attach a WebSocket server (for example the `ws` package).
- Add lifecycle, discovery, bootstrap, capture, and playback APIs.
- Add Node tests for validation, recovery, sequence gaps, and playback scheduling.

### Phase 3: live capture

- Add a bounded capture sink to each `marketDataWorker.ts` `timeSaleFlush`/`quote` output.
- Batch event envelopes to ProxyServer without delaying `postMessage` to the main thread.
- Upload initial/final bootstrap data and finalize at session end.
- Show capture status and dropped-batch count in the existing network/status area.

### Phase 4: replay page and source

- Add the `/replay` selector/toolbar and deep-link recording parameter.
- Load the bootstrap, set the historical date/symbol/config, and initialize charts.
- Add replay-worker delivery through the current bridge.
- Implement play, pause, speed, end-of-stream, and restart.
- Add a small checked-in fixture and compare final candle state.

### Phase 5: performance harness and quote fidelity

- Capture/replay selected Level 1 quote events.
- Add summarized profiling and optional local run reports.
- Audit remaining market-semantic `new Date()` calls used by the replayed hot path.
- Add a documented repeatable market-open performance test.

## Files Most Likely to Change

### ViteApp

- `src/main.ts` and `src/tosClient.ts`: shared/live/replay startup split.
- `src/controllers/marketDataWorkerBridge.ts`: accept live or replay worker source while preserving application of messages.
- `src/workers/marketDataWorker.ts` and `src/workers/marketDataMessages.ts`: capture sink and replay message contract.
- `src/api/marketData.ts`: load bootstrap through a market-data provider abstraction.
- `src/data/db.ts`: profiling hooks only; replay should reuse its existing batch apply path.
- `src/utils/timeHelper.ts`, `src/utils/helper.ts`, and time-sensitive consumers: runtime market clock.
- `src/api/broker.ts` and `src/firestore.ts`: final replay safety guards.
- `src/tradebooks/tradebooksManager.ts`, `src/bookmap/*`, and chart setup: full Bookmap exclusion.
- New `src/replay/*`: runtime mode, API client, replay controls, clock, and optional metrics.

### ProxyServer

- `index.js`: shared HTTP/WebSocket server.
- New `routes/replay.js`: REST API.
- New `replay/storage.js`: safe paths, manifest/bootstrap, rotation, recovery.
- New `replay/websockets.js`: capture WebSocket plus incremental playback scheduler, controls, and backpressure.

The existing `routes/save.js` endpoints can remain for their current callers, but replay capture should not be built on top of the per-event append endpoints.
