# Bookmap Feature

Custom bookmap-style visualization showing order flow as volume dots and Level 2 heatmap.

## Architecture

Uses a **pure canvas chart** (no TradingView LWC) for continuous time axis rendering. The canvas handles its own zoom, pan, crosshair, and axis drawing. This was chosen because LWC is bar-based (1-minute candle snappping) which doesn't support the sub-second continuous time positioning bookmap requires.

### Files

- `bookmapCanvas.ts` — Core rendering class. Pure HTML5 Canvas with:
  - Continuous time axis (X) and price axis (Y)
  - Mouse wheel zoom (scroll on chart = time zoom, scroll on price axis or shift+scroll = price zoom)
  - Click-drag pan (on chart = pan time, on price axis = pan price)
  - Free crosshair with time/price labels
  - Auto-fit price range (double-click price axis to reset)
  - Auto-scroll to keep latest trades visible
  - Volume dot rendering with sqrt-scaled radius
  - Heatmap rendering for Level 2 order book (when enabled)

- `bookmapManager.ts` — Per-symbol instance management. Entry points:
  - `initialize(symbol, chartWidth)` — creates bookmap panel
  - `onTrade(symbol, price, size, timestamp)` — feeds trade data
  - `onOrderBookUpdate(symbol, orderBook)` — feeds Level 2 data
  - `destroy(symbol)` / `destroyAll()` / `resetAll()`

- `bookmapModels.ts` — Data interfaces and default config
  - `TradeCluster` — aggregated trade data for one dot
  - `OrderBookSnapshot` — Level 2 bid/ask levels
  - `BookmapConfig` — tunable parameters (bucket sizes, dot sizes, opacity, etc.)

- `tradeClusterer.ts` — Trade clustering algorithm
  - Buckets trades by time (configurable, default 0.5s) and price ($0.01)
  - Tracks uptick/downtick via last trade price comparison
  - Filters clusters below `minClusterSize` threshold
  - O(1) HashMap lookup per trade

- `schwabBookData.ts` — Schwab Level 2 data subscription
  - Subscribes to `NASDAQ_BOOK` and `LISTED_BOOK` streaming services
  - Parses raw book data into `OrderBookSnapshot` and feeds to bookmap manager

- `orderBookHistory.ts` — Time-series storage for heatmap rendering
  - Stores `BookSlice` entries (timestamp + Map<price, size>)
  - Binary search for efficient range queries (`getSlicesInRange`)
  - Configurable max history size with automatic pruning

- `../api/databento/bookData.ts` — Databento historical data (MBP-10 or MBO)
  - Fetches order book data via HTTP API through localhost proxy (CORS)
  - Parses NDJSON response, converts fixed-point prices (÷1e9 → dollars)
  - MBP-10 mode: each record is a pre-aggregated 10-level snapshot
  - MBO mode: individual order events → `OrderBookReconstructor` builds full-depth book
  - Samples at ~200ms intervals to avoid flooding bookmap
  - Feeds `OrderBookSnapshot` to bookmap manager (same interface as Schwab)

- `../api/databento/orderBookReconstructor.ts` — MBO order book reconstruction
  - Maintains running state of all individual orders (`Map<orderId, TrackedOrder>`)
  - Aggregates by price level (`Map<price, totalSize>`) for bids and asks
  - Processes events: Add, Cancel (full/partial), Modify, Clear
  - Trade/Fill/None events are no-ops (don't affect book state)
  - `toSnapshot()` emits current book state as `OrderBookSnapshot`

## Data Flow

### Volume Dots (trades)
```
Massive/Alpaca WebSocket → streamingHandler.ts → BookmapManager.onTrade()
                                                       ↓
                                               TradeClusterer.addTrade()
                                                       ↓
                                               BookmapCanvas.drawVolumeDots()
```

### Heatmap (order book — Schwab live)
```
Schwab WebSocket → schwab/streaming.ts → SchwabBookData.handleBookData()
                                                ↓
                                        parseBookDataToSnapshot()
                                                ↓
                                        BookmapManager.onOrderBookUpdate()
                                                ↓
                                        OrderBookHistory.addSnapshot()
                                                ↓
                                        BookmapCanvas.drawHeatmap() → 2D colored rectangles
```

### Heatmap (order book — Databento historical, MBP-10 mode)
```
BookmapManager.initialize() → DatabentoBookData.startHistoricalFeed()
                                        ↓
                              fetch via proxy → hist.databento.com (MBP-10, NDJSON)
                                        ↓
                              parseMbp10ToSnapshot() [fixed-point ÷ 1e9 → dollars]
                                        ↓
                              sample every ~200ms by timestamp
                                        ↓
                              BookmapManager.onOrderBookUpdate() → same pipeline as Schwab
```

### Heatmap (order book — Databento historical, MBO full-depth mode)
```
BookmapManager.initialize() → DatabentoBookData.startHistoricalFeed()
                                        ↓
                              fetch via proxy → hist.databento.com (MBO, NDJSON)
                                        ↓
                              OrderBookReconstructor.processEvent() per record
                              (Add/Cancel/Modify/Clear → updates running book state)
                                        ↓
                              sample every ~200ms → reconstructor.toSnapshot()
                                        ↓
                              BookmapManager.onOrderBookUpdate() → same pipeline
```

## Configuration

In `src/config/globalSettings.ts`:
- `enableBookmap: boolean` — master toggle; all sub-features gate on this
- `enableBookmapHeatmap: boolean` — enable Level 2 heatmap rendering
- `enableBookDataLogging: boolean` — log raw Schwab book data
- `bookmapWidth: number` — bookmap panel width (currently unused, width matches candle chart)
- `enableDatabentoBookData: boolean` — fetch historical data from Databento
- `databentoDataset: string` — Databento dataset (default: `"XNAS.ITCH"` for Nasdaq TotalView)
- `databentoSchema: string` — `"mbo"` for full depth (all price levels), `"mbp-10"` for top 10 levels

In `src/bookmap/bookmapModels.ts` (`DEFAULT_BOOKMAP_CONFIG`):
- `timeBucketSeconds: 0.5` — clustering time resolution
- `priceBucketSize: 0.01` — clustering price resolution
- `minClusterSize: 500` — minimum shares to show a dot
- `maxDotRadius: 12` / `minDotRadius: 2` — dot size range
- `maxSharesForScaling: 50000` — volume at which dot reaches max radius
- `dotOpacity: 0.7` — dot transparency
- `heatmapEnabled: false` — heatmap rendering toggle (overridden by `globalSettings.enableBookmapHeatmap`)
- `heatmapUpperPercentile: 97` — percentile at which color reaches max intensity (bright red)
- `heatmapLowerPercentile: 3` — percentile below which orders are not rendered
- `heatmapRecalcIntervalMs: 2000` — how often dynamic thresholds are recalculated
- `heatmapMaxHistory: 10000` — max snapshots to keep in `OrderBookHistory`

## Layout

The bookmap panel sits **below** each candlestick chart container in `index.html`:
```
chartContainer
├── topbar
├── quantityBar
├── twoColumnsWithChart (flex row)
│   ├── .left (M1/M5/M15/M30 charts)
│   ├── .sideBar
│   └── feed panels
└── bookmapPanel (canvas chart, below)
```

Chart heights are reduced when bookmap is enabled (see `chartSettings.ts` `*WithBookmap` sizes).

## Implementation Phases

### Phase 1: Volume Dots (DONE)
- Custom canvas chart with continuous time axis
- Trade clustering from Massive/Alpaca real-time feeds
- Green (uptick) / red (downtick) dots with sqrt-scaled radius
- Mouse zoom, pan, crosshair

### Phase 2: Schwab Book Data Parsing (DONE)
- Subscribe to NASDAQ_BOOK / LISTED_BOOK via Schwab streaming
- Parsed undocumented format: `"2"` = bids, `"3"` = asks, each level `"0"` = price, `"1"` = totalVolume
- Feeds parsed `OrderBookSnapshot` to bookmap manager

### Phase 3: 2D Heatmap (DONE)
- `OrderBookHistory` stores time-series of order book snapshots with binary search for efficient range queries
- Each time slice paints colored rectangles at each price level, forming horizontal "walls" that grow as orders persist
- Walls stop growing when orders disappear/are filled; walls thin/lighten when size drops below threshold
- Color scale: dark blue/black (small) → blue → cyan → green → yellow → orange → bright red (large)
- Performance optimization: skips sub-pixel slices when zoomed out
- Auto-fit price range driven by volume dots only (heatmap levels excluded to prevent zoom-out to distant orders)
- Dynamic percentile-based color scaling adapts to each stock's typical order sizes (like Bookmap's adaptive contrast)
- Set `enableBookmapHeatmap = true` to activate (enabled by default)

### Phase 4: Databento MBP-10 Integration (DONE)
- Fetches historical MBP-10 (10-level depth) data from Databento via localhost proxy
- API: `POST https://hist.databento.com/v0/timeseries.get_range` with Basic auth
- Proxy at `localhost:3000/databento/v0/timeseries.get_range` forwards requests (avoids CORS)
- Parses NDJSON response: each record has 10 bid/ask levels with fixed-point prices (÷1e9)
- Samples records at ~200ms intervals, feeds `OrderBookSnapshot` to bookmap manager
- Free API key = T+1 delayed data (historical only); same code works for live upgrade later

### Phase 5: Databento MBO Full Depth (DONE)
- MBO (Market by Order) provides individual order events at ALL price levels
- `OrderBookReconstructor` maintains running book state from MBO events:
  - `Add` → insert order, increment price level size
  - `Cancel` → remove/reduce order (supports partial cancels)
  - `Modify` → update order price/size (removes old, adds new)
  - `Clear` → reset entire book (used at session start/snapshots)
  - `Trade`/`Fill`/`None` → no-ops (don't affect book state)
- Emits full-depth `OrderBookSnapshot` at sampled intervals (same pipeline as MBP-10)
- Set `databentoSchema = "mbo"` to use full depth, `"mbp-10"` for top 10 only
- MBO generates significantly more data than MBP-10 (every individual order event)

### Data Depth
- **Schwab live**: ~15 levels per side via `NASDAQ_BOOK` / `LISTED_BOOK` (full snapshots, not deltas)
- **Databento MBP-10**: 10 levels per side from Nasdaq TotalView (historical, delayed with free key)
- **Databento MBO**: Full depth — all orders at all price levels, reconstructed from individual order events
- For true full depth across all exchanges, use DBEQ.MAX dataset or direct exchange feeds
