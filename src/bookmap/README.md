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

## Data Flow

### Volume Dots (trades)
```
Massive/Alpaca WebSocket → streamingHandler.ts → BookmapManager.onTrade()
                                                       ↓
                                               TradeClusterer.addTrade()
                                                       ↓
                                               BookmapCanvas.drawVolumeDots()
```

### Heatmap (order book)
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

## Configuration

In `src/config/globalSettings.ts`:
- `enableBookmap: boolean` — master toggle (also adjusts candle chart heights)
- `enableBookmapHeatmap: boolean` — enable Level 2 heatmap rendering
- `enableBookDataLogging: boolean` — log raw Schwab book data
- `bookmapWidth: number` — bookmap panel width (currently unused, width matches candle chart)

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

### Data Depth Limitation
- Schwab `NASDAQ_BOOK` / `LISTED_BOOK` provides **full snapshots** (~15 levels per side), not deltas
- Coverage is roughly $1-2 on each side of the current price — the nearest, most actionable levels
- Deeper order book data (50+ levels or full depth) requires direct exchange feeds (NASDAQ TotalView, CME, etc.)
