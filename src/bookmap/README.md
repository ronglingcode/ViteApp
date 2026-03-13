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
  - Bid/ask stepped lines — green (best large bid) and red (best large ask) over time

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

- `orderBookHistory.ts` — Time-series storage for heatmap and bid/ask lines
  - Stores `BookSlice` entries (timestamp + Map<price, size>) for heatmap
  - Stores `BidAskPoint` entries (timestamp + bestBid/bestAsk) for bid/ask lines
  - Rolling 90th percentile threshold across recent snapshots filters out small orders
  - Binary search for efficient range queries (`getSlicesInRange`, `getBidAskPointsInRange`)
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

### Bid/Ask Lines (order book — same sources as heatmap)
```
OrderBookSnapshot (from Schwab live or Databento historical)
        ↓
BookmapManager.onOrderBookUpdate()
        ↓
OrderBookHistory.addBidAskPoint()
  - feeds sizes into rolling buffer (last 5000 samples)
  - recalculates 90th percentile threshold every 2s
  - finds highest bid and lowest ask with size >= threshold
        ↓
BookmapCanvas.drawBidAskLines() → green (bid) and red (ask) stepped lines
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

## How Thresholds Work

### Bid/Ask Line Threshold

The bid/ask lines show only "large" bids and asks so the line stays stable. The threshold is **relative** — it adapts to each stock's typical order book depth automatically.

**Algorithm** (`orderBookHistory.ts`):
1. Every incoming `OrderBookSnapshot` feeds all bid/ask sizes into a **rolling buffer** (last 5000 samples across many snapshots).
2. Every **2 seconds**, the buffer is sorted and the **90th percentile** value becomes the threshold. This means only the top 10% largest orders qualify.
3. For each snapshot, the **highest-priced bid** and **lowest-priced ask** with `size >= threshold` are recorded as `BidAskPoint`.
4. Points with no qualifying bid or ask get `null`, causing a gap in the line.

The rolling buffer + periodic recalc means the threshold stays consistent across many updates rather than jumping per-snapshot. A stock with large typical order sizes (e.g. AAPL) will naturally get a higher threshold than a thinly-traded stock.

**Constants** (hardcoded in `OrderBookHistory`):
- `THRESHOLD_RECALC_MS = 2000` — recalculate every 2 seconds
- `SIZE_BUFFER_MAX = 5000` — rolling window of recent order sizes
- Percentile: 90th (top 10% of orders)

### Volume Dot Clustering Threshold

Volume dots aggregate individual trades into clusters by **time and price proximity**, then filter out small clusters.

**Clustering** (`tradeClusterer.ts`):
1. Each trade is bucketed by **time** (`timeBucketSeconds`, default **0.5s**) — trades within the same 500ms window land in the same bucket.
2. Within each time bucket, trades are further bucketed by **price** (`priceBucketSize`, default **$0.01**) — trades at the same penny level are grouped together.
3. The bucket key is `timeBucket|priceLevel`. All trades matching the same key accumulate into one `TradeCluster` (total size, trade count, net uptick/downtick direction).

**Visibility filter**: Only clusters with `totalSize >= minClusterSize` (default **500 shares**) are rendered as dots. Smaller clusters are stored but hidden.

**Dot sizing**: Visible dots use sqrt-scaled radius between `minDotRadius` (2px) and `maxDotRadius` (12px). A cluster at `maxSharesForScaling` (50,000 shares) gets the maximum radius.

### Heatmap Limit Order Threshold

The heatmap shows limit orders from the Level 2 order book as colored rectangles. The color intensity adapts dynamically to each stock's order book depth.

**Algorithm** (`bookmapCanvas.ts` → `recalcHeatmapThresholds()`):
1. Every **2 seconds** (`heatmapRecalcIntervalMs`), samples up to ~50 visible time slices from `OrderBookHistory`.
2. Collects all order sizes from those slices, sorts them, and computes two percentile cutoffs:
   - **Lower cutoff** at `heatmapLowerPercentile` (default **3rd percentile**) — orders below this size are **not rendered** at all (filters out noise).
   - **Upper cutoff** at `heatmapUpperPercentile` (default **97th percentile**) — orders at or above this size get the **maximum color intensity** (bright red).
3. Orders between the two cutoffs are mapped to a 7-stage color gradient: dark blue → blue → cyan → green → yellow → orange → bright red.

This means the heatmap automatically adjusts its color contrast to each stock. A stock with huge order sizes won't appear all-red, and a thinly-traded stock won't appear all-dark.

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

### Phase 6: Bid/Ask Stepped Lines (DONE)
- Green (bid) and red (ask) stepped lines showing the best large bid/ask price over time
- Uses a rolling 90th percentile threshold computed across recent order book snapshots (last 5000 size samples)
- Threshold recalculated every 2 seconds for stability — avoids per-snapshot fluctuation
- Only orders with size >= threshold qualify, so the line tracks significant price levels and ignores noise
- Stepped rendering style (horizontal-then-vertical) matches official Bookmap tools
- Drawn after volume dots and before crosshair in the render pipeline
- Always enabled when bookmap is enabled — no separate config flag needed

### Data Depth
- **Schwab live**: ~15 levels per side via `NASDAQ_BOOK` / `LISTED_BOOK` (full snapshots, not deltas)
- **Databento MBP-10**: 10 levels per side from Nasdaq TotalView (historical, delayed with free key)
- **Databento MBO**: Full depth — all orders at all price levels, reconstructed from individual order events
- For true full depth across all exchanges, use DBEQ.MAX dataset or direct exchange feeds
