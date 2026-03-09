# Bookmap Feature

Custom bookmap-style visualization showing order flow as volume dots and (future) Level 2 heatmap.

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
  - Phase 1 (current): logs raw data to console + Firestore for format analysis
  - Phase 2 (TODO): parse into `OrderBookSnapshot` and feed to bookmap

## Data Flow

```
Massive/Alpaca WebSocket → streamingHandler.ts → BookmapManager.onTrade()
                                                       ↓
                                               TradeClusterer.addTrade()
                                                       ↓
                                               BookmapCanvas.draw() → canvas rendering
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

### Phase 2: Schwab Book Data Discovery (IN PROGRESS)
- Subscribe to NASDAQ_BOOK / LISTED_BOOK via Schwab streaming
- Log raw messages to understand undocumented data format
- Implement `parseBookDataToSnapshot()` after format is known

### Phase 3: Heatmap
- Render Level 2 order book as horizontal colored bars at price levels
- Bar width/opacity proportional to limit order size
- Real-time updates as orders are placed/pulled
- Set `enableBookmapHeatmap = true` to activate
