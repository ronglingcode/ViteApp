# Live API indicators

The sticky strip above the charts reports three independent observations. Expand
each indicator for its last successful read, data details and error. Text labels
accompany the green/amber/red dots; gray means a read has not been checked yet.

- **Schwab account:** a successful account GET must contain finite liquidation
  and cash balances and valid positions (an empty/omitted positions array is
  valid). The summary shows the last three whole-dollar digits plus cents, such
  as `…234.56`. Details show the full liquidation balance, cash and position
  count. Normal account reads feed this indicator before order-history reads,
  so an order-history failure does not imply account access failed. The separate
  health probe does not update AccountCache or fetch orders.
- **Massive history:** completed, validated, paginated aggregate-bar reads feed
  the indicator, including MarketLoader startup reads. An empty result is amber
  with “No bars returned.” A successful probe cannot conceal a watchlist chart
  that failed its three startup attempts; chart-load status appears separately.
- **Massive trades:** socket open, authentication and subscription acceptance
  remain amber until a valid trade for a subscribed symbol arrives. Health uses
  the original receipt time (including worker batching delay) and the vendor
  event timestamp. Valid prints filtered from chart calculations still prove
  receipt. Details list receipt/event ages for each watchlist symbol. Error,
  authentication/subscription failure, disconnect and worker failure are red.

Checks start after initialization, or following a caught startup failure. Every
30 seconds without a recent account attempt, the app performs an account-only
GET using the current token; existing token maintenance remains responsible for
renewal. Every 60 seconds without a recent history attempt, it probes a small
range of completed SPY daily bars. Reads are coalesced/skipped while in progress.
Account reads and Massive reads have a 15-second fetch/body-read timeout, allowing
later probes to recover from stalled requests. The status is stale after 90
seconds for accounts or 180 seconds for historical reads.

The strip refreshes once per second. “Check APIs now” forces the two REST checks
without reconnecting the stream or placing orders. After 15 seconds without
receipts, the stream is amber with “No recent trades.” Recent receipts whose
newest event time is more than 15 seconds old show “Delayed trades.” A future
timestamp more than 5 seconds ahead flags the local clock. Quiet symbols,
weekends, holidays and closed sessions may all produce no trades: this warning
does not assert a disconnect. A disconnected stream stays red until restarted;
these indicators do not add automatic reconnection.

Both worker and fallback streaming paths are instrumented. The indicators do not
change order placement, sizing, entry/exit rules or Bookmap messages.

Validation: `npm run test:integration-health`, `npm run test:market`,
`npm run test:massive`, `npm run test:broker-read`, `npm run test:streams`,
and `npm run build`. New health tests use mocked services and sockets.
