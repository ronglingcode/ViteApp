# Performance Improvement Tasks

Plan for review, one item at a time.

## 1. Market-open data sources

- [x] Confirm what streams are active at the same time:
  - Alpaca trades/quotes
  - Massive trades
  - Schwab quotes/account/chart updates
  - Bookmap socket
- Goal: check whether duplicate feeds or unnecessary subscriptions multiply work right after open.

## 2. Per-trade tick path

- [ ] Review `DB.updateFromTimeSale()` carefully.
- Goal: separate critical state updates from expensive UI/chart rendering.

## 3. Quote update path

- [ ] Review `DB.updateFromLevelOneQuote()` and quote stream handlers.
- Goal: see whether quote messages are causing high-frequency DOM or network work.

## 4. Chart rendering cost

- [ ] Review chart updates in `src/ui/chart.ts`, especially:
  - series `.update()`
  - DOM text updates
  - time-and-sales rows
  - higher timeframe charts
- Goal: identify what can be throttled safely.

## 5. Timers and account sync

- [ ] Review `AutoTrader.scheduleEvents()`, `UI.setupAutoSync()`, and `Broker.UpdateAccountUIWithDelay()`.
- Goal: check if scheduled work stacks up around 6:30.

## 6. Bookmap path

- [ ] Review `bookmapSocket.ts`, `largeOrderTracker`, and bookmap tradebooks.
- Goal: confirm orderbook snapshots are bounded and not doing heavy per-message processing.
