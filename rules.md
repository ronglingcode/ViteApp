# Tradebook Rules

This document describes the tradebooks that the current factory can create. `src/trading/core/configuration/tradingConfig.ts` produces up to six active definitions, and `src/tradebooks/tradebooksManager.ts` instantiates each one as `BookmapWallReversal`.

## Active tradebooks

### Gap, Give & Go

- ID: `GapGiveAndGoBookmapReversal`
- Direction: long.
- Entry area: the configured gap-and-go support area.
- Entry handling: the Bookmap wall reversal validates the entry against that support area, checks the shared global entry rules, applies the selected risk method, and submits the configured exit pairs.
- Add handling: adds use the gap-and-go algorithm's allowed-price check.

### Gap & Crap offer step-down / reappear

- ID: `GapAndCrapOfferStepDownReappear`
- Direction: short.
- Entry area: the configured gap-and-crap resistance area.
- Entry handling: the Bookmap wall reversal validates the entry against resistance, checks the shared global entry rules, applies the selected risk method, and submits the configured exit pairs.
- Add handling: the gap-and-crap algorithm validates add prices, including its VWAP condition.

### Gap Down & Go Down offer step-down / reappear

- ID: `GapDownAndGoDownOfferStepDownReappear`
- Direction: short.
- Entry area: the configured gap-down-and-go-down resistance area.
- Entry handling: the Bookmap wall reversal validates the entry against resistance, checks the shared global entry rules, applies the selected risk method, and submits the configured exit pairs.
- Add handling: the gap-down-and-go-down algorithm validates add prices.

### Gap Down & Go Up bookmap reversal

- ID: `GapDownAndGoUpBookmapReversal`
- Direction: long.
- Entry area: the configured gap-down-and-go-up support area.
- Entry handling: the Bookmap wall reversal validates the entry against support, checks the shared global entry rules, applies the selected risk method, and submits the configured exit pairs.
- Add handling: the gap-down-and-go-up algorithm validates add prices.

### Range-bound bid reversal

- ID: `RangeBoundBidReversal`
- Direction: long.
- Entry area: the normalized support area from `rangeBoundReversalPlan`.
- Factory validation: both range areas must have finite, positive, nonzero bounds, and support must be below resistance. Invalid or overlapping ranges produce no range-bound definitions.
- Entry handling: the Bookmap wall reversal requires an entry at or above support unless the plan explicitly requires the entry to be inside the area.

### Range-bound offer reversal

- ID: `RangeBoundOfferReversal`
- Direction: short.
- Entry area: the normalized resistance area from `rangeBoundReversalPlan`.
- Factory validation: it shares the same finite-bound, nonzero, and nonoverlap checks as the bid reversal.
- Entry handling: the Bookmap wall reversal requires an entry at or below resistance unless the plan explicitly requires the entry to be inside the area.

## Shared entry and risk behavior

- The core configuration validator requires a valid gap reference, ATR settings, both direction plans, final targets, and at least one configured tradebook reason for each enabled direction. A disabled direction does not create its gap definitions.
- Every active Bookmap tradebook calls `EntryRulesChecker.checkBasicGlobalEntryRules(...)` before submitting orders. That gate covers daily loss, liquidity, timing, watchlist, no-trade-zone, tradable-area, and related global checks.
- The entry method determines both the risk multiplier and the exit-pair count. The current default methods are `1 R` and `0.1 R`.
- `BookmapWallReversal` validates the configured support or resistance area before checking VWAP alignment and submitting the entry. Its entry area is normalized by the factory for range-bound plans.
- Base `Tradebook` behavior disallows partial adds unless the active book overrides that check. It allows the generic single-order exit adjustments, market-outs, flattening, and full exit-pair adjustments unless a derived book changes the behavior.
- The live chart and Bookmap integrations receive button definitions from the instantiated tradebook map. Status refreshes and time-and-sales callbacks are routed to those active instances.

## Plan validation and state

- Legacy plan fields may still be present in older raw configuration documents, but they are ignored by the current ViteApp type surface and factory.
- Captured tradebook IDs remain strings in persisted state. Removing a strategy from the active factory does not rewrite historical state or introduce enum filtering.
- The factory is the source of truth for the current set of executable tradebooks. This document intentionally omits retired single-key-level, VWAP continuation, open-drive, breakout, premarket-rejection, and old wall-break classes because their source files and construction paths are gone.
