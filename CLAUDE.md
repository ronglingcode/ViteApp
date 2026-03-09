# CLAUDE.md

## Project Overview

This is a personal intraday trading bot (day trading) built as a single-page web application. It uses TradingView Lightweight Charts to display candlestick charts and connects to broker APIs (primarily Charles Schwab) for live order execution. The app enforces trading discipline by codifying strategies into "tradebooks" — each tradebook implements a specific pattern/setup with entry rules, exit rules, and risk management. An AI assistant (OpenAI/ChatGPT) is integrated for trade analysis.

**Deployed at**: https://tradingapp-84f28.web.app/ (Firebase Hosting)

## Tech Stack

- **Build**: Vite 7 + TypeScript 5.9 (strict mode, ES2022 target)
- **Charts**: `sunrise-tv-lightweight-charts` (TradingView Lightweight Charts v4 wrapper)
- **Database/Logging**: Firebase Firestore
- **UI**: jQuery + jQuery UI (collapsible panels, popups)
- **AI**: OpenAI ChatGPT API
- **No backend server** — pure frontend SPA that calls broker APIs directly (with a localhost proxy at port 3000 for CORS)

## Commands

```bash
npm run dev      # Start Vite dev server (http://localhost:5173)
npm run build    # TypeScript check + Vite production build (tsc && vite build)
npm run preview  # Preview production build locally
```

**Type checking**: `npx tsc --noEmit` (no separate test runner — build is the primary validation)

## Project Structure

```
src/
├── main.ts                    # App entry — initializes all modules, sets up window.HybridApp
├── firestore.ts               # Firebase logging
├── tosClient.ts               # TradeStation client init
│
├── api/                       # Broker API integrations
│   ├── broker.ts              # Broker abstraction layer
│   ├── marketData.ts          # Market data fetching
│   ├── proxyServer.ts         # Localhost proxy for API calls
│   ├── schwab/                # Charles Schwab (primary broker)
│   │   ├── api.ts             # OAuth, orders, account data
│   │   ├── streaming.ts       # WebSocket for quotes/activity
│   │   └── orderFactory.ts    # Bracket order construction
│   ├── alpaca/                # Alpaca (market data + trading)
│   ├── tdAmeritrade/          # TD Ameritrade (legacy)
│   ├── tradeStation/          # TradeStation (futures)
│   ├── massive/               # Massive Blocks (shares outstanding data)
│   ├── interactiveBroker/     # Interactive Brokers
│   └── googleDocs/            # Google Docs for trading plans
│
├── tradebooks/                # Trading strategy definitions (~39 files)
│   ├── baseTradebook.ts       # Abstract base class for all tradebooks
│   ├── tradebooksManager.ts   # Factory, state management, live stats
│   ├── tradebookStates.ts     # OBSERVING → TRIGGERED → STOPPED
│   ├── singleKeyLevel/        # Single key level strategies
│   │   ├── vwapContinuation.ts
│   │   ├── openDrive.ts
│   │   ├── openFlush.ts
│   │   └── ...
│   ├── gapAndGo.ts            # Gap-based strategies
│   ├── gapAndCrap.ts
│   ├── breakoutReversal.ts
│   ├── vwapScalp.ts
│   └── tradebookDocs/         # Strategy documentation
│
├── algorithms/                # Trading logic engines
│   ├── autoTrader.ts          # Main auto-trading engine
│   ├── patterns.ts            # Pattern recognition
│   ├── rules.ts               # Trading rules validation
│   ├── riskManager.ts         # Position sizing, risk calc
│   ├── vwapPatterns.ts        # VWAP-specific patterns
│   ├── takeProfit.ts          # Profit target management
│   ├── watchlist.ts           # Watchlist management
│   ├── setupQuality.ts        # Setup quality scoring
│   └── strategies.ts          # Strategy definitions
│
├── controllers/               # Event handling and order flow
│   ├── handler.ts             # Main event handler
│   ├── entryHandler.ts        # Entry signal processing
│   ├── entryRulesChecker.ts   # Entry validation
│   ├── exitRulesChecker*.ts   # Exit validation (multiple versions)
│   ├── orderFlow.ts           # Order flow management
│   ├── streamingHandler.ts    # WebSocket event routing
│   ├── keyboardHandler.ts     # Keyboard shortcuts for trading
│   └── volumeMonitor.ts       # Volume tracking
│
├── ui/                        # User interface
│   ├── chart.ts               # TradingView chart wrapper (main chart logic)
│   ├── chartSettings.ts       # Chart sizing, colors, series config
│   ├── ui.ts                  # UI utilities, auto-sync
│   ├── popup.ts               # Popup dialogs
│   ├── flowchart.ts           # Trading state visualization
│   └── liveStats.ts           # Real-time statistics display
│
├── models/                    # Data models and state
│   ├── models.ts              # Core models (SymbolData, ChartWidget, etc.)
│   ├── tradingState.ts        # Per-symbol trading state
│   ├── CandleModels.ts        # OHLCV candle structures
│   ├── levelOneQuote.ts       # Level 1 quote model
│   └── tradingPlans/          # Trading plan models
│
├── data/
│   └── db.ts                  # In-memory database, candle aggregation
│
├── config/
│   ├── config.ts              # Profile-based configuration
│   ├── globalSettings.ts      # Feature flags and global settings
│   ├── secret.ts              # API keys (NOT in template — create from secret_template.ts)
│   ├── secret_template.ts     # Template for secrets
│   └── profiles/              # Trading profiles (schwab, futures, etc.)
│
├── ai/                        # LLM/AI integration
│   ├── agent.ts               # ChatGPT agent with market context
│   ├── chatgpt.ts             # OpenAI API wrapper
│   └── marketDataFeatures.ts  # Feature extraction for AI
│
├── indicators/                # Technical indicators
│   ├── basicIndicators.ts     # Moving averages, basic calcs
│   └── camPivots.ts           # Camarilla pivot points
│
├── utils/                     # Utility functions
│   ├── helper.ts              # General utilities
│   ├── timeHelper.ts          # Market hours, time calculations
│   ├── calculator.ts          # Price/math calculations
│   └── webRequest.ts          # HTTP request wrapper
│
└── patterns/                  # Pattern detection
    ├── falseBreakout.ts
    ├── camPivots.ts
    └── allTimeHigh.ts
```

## Architecture Notes

### State Management
All state lives on `window.HybridApp` namespace — no framework state management:
- `window.HybridApp.Models` — per-symbol market data, chart widgets, watchlist
- `window.HybridApp.AccountCache` — broker account state (positions, orders, balance)
- `window.HybridApp.TradingData` — active profile, stock selections, settings

### Data Flow
1. WebSocket streams real-time quotes from Schwab/Alpaca
2. `streamingHandler.ts` routes events → `db.ts` aggregates candles (1m, 5m, 15m, 30m)
3. `chart.ts` updates TradingView charts with new data
4. `tradebooksManager.ts` evaluates strategies on each update
5. `handler.ts` / `entryHandler.ts` processes entry signals
6. `orderFlow.ts` manages order lifecycle through broker API
7. `riskManager.ts` calculates position sizing

### Tradebook Pattern
Each tradebook extends `Tradebook` (baseTradebook.ts):
- Has a state: OBSERVING → TRIGGERED → STOPPED
- Defines entry conditions, exit rules, and key levels
- Updates live stats on every chart tick
- Integrates with risk management for sizing

### Broker Abstraction
`api/broker.ts` provides a broker-agnostic interface. Each broker folder (schwab/, alpaca/, etc.) implements the specifics. Schwab is the primary live trading broker.

### Proxy Server
A localhost proxy (`http://localhost:3000`) handles CORS for broker API calls. This must be running during development.

## Configuration

### Secrets Setup
Copy `src/config/secret_template.ts` → `src/config/secret.ts` and fill in:
- Schwab: app key, secret, OAuth tokens
- Firebase: project config
- OpenAI: API key
- TradeStation/TD Ameritrade: if using those brokers

### Global Settings (`src/config/globalSettings.ts`)
Key flags:
- `marketDataSource`: "massive" or "alpaca"
- `impliedMarketCapThresholdInBillions`: 0.9 (minimum market cap filter)
- `premarketVolumeThresholdInMillions`: 0.9 (minimum premarket volume)
- `enableLeftPaneFeatures`: currently `false` (disables AI agent UI)
- `enableAiAgent`: tied to left pane feature flag

### Profiles (`src/config/profiles/`)
Trading profiles define broker, asset type, entry/exit rules:
- `schwab.ts` — Schwab equity trading (primary)
- `futures.ts` — Futures trading
- `momentumSimple.ts` — Simple momentum strategy

## Key Conventions

- **No test framework** — `tsc` type checking and `vite build` are the primary CI checks
- **ES modules** throughout (`type: "module"` in package.json)
- **No routing** — single HTML page with collapsible sections
- **jQuery** used for UI manipulation alongside vanilla DOM
- **Async/await** for all API calls and WebSocket handling
- **Maps** used extensively for symbol→data lookups
- **Feature flags** in `globalSettings.ts` control what's enabled
- Commit messages are short, lowercase, descriptive of the trading logic change

## Important Warnings

- `secret.ts` contains real API keys — never commit to public repos
- The app executes real trades with real money when connected to Schwab
- The localhost proxy (port 3000) must be running for API calls to work
- Chart data comes from both WebSocket streams and remote TradingView scripts loaded from `tradingdata-15425.web.app`
