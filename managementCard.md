# Management Card Implementation Plan

## Goal

Add a Trade Management UI that is always visible. The first version helps choose the setup and edit management values. The values are still manual notes for now, but exit adjustments can be configured to require the active setup card to be committed first.

## Current App Touchpoints

- `index.html` already has a left-pane Trade Management section:
  - `#traderFocusInstructionsContent`
- `src/controllers/traderFocus.ts` already owns that section:
  - `updateTradeManagementUI()` passes current position contexts into the persistent management shell.
  - `populateTradeManagementForPosition()` delegates single-position rendering to `ManagementCard.populateForPosition()`.
- `src/ui/chart.ts` calls `TraderFocus.updateTradeManagementUI()` after broker account sync.
- `src/models/models.ts` already exposes position data:
  - `Models.getOpenPositions()`
  - `Models.getPositionNetQuantity(symbol)`
  - `Position.netQuantity > 0` means long.
  - `Position.netQuantity < 0` means short.
- `TradingPlansModels.BasePlan` already has the management fields we want to display:
  - `runnerCount`
  - `coreCount`
  - `coreTarget`
- `runnerTarget`, `originalOfferPrice`, `originalSize`, and `reappearedOfferSize` are manual draft fields for now because there are no matching `BasePlan` fields.

## First Version Behavior

The Trade Management section renders a persistent management shell inside `#traderFocusInstructionsContent` as soon as the app has the watchlist.

For page load:

1. Build one management card for every watchlist symbol.
2. Keep cards keyed by symbol instead of making card existence depend on current position or tradebook state.
3. Render both long and short setup sections once, so pre-trade setup selection is always available.
4. If an open position already exists on first render, infer the active side and initial setup from trade state when available.
5. Each stock's management card has its own expand/collapse button and persisted collapsed state.

For every account refresh after cards exist:

1. Do not rebuild the card DOM.
2. Determine long or short from `position.netQuantity` when there is an open position.
3. Only update the status tag and long/short side visibility.
4. If there is no open position for a symbol, show both side sections.
5. If there is an open position, show only the side matching the position and hide the opposite side.
6. If `TradingPlans.getTradingPlans(symbol).long.enabled` or `.short.enabled` is explicitly `false`, hide that side completely.

When a setup is selected, persist that selected setup separately from card data and re-render only that side section. For reappear setups, add the original/reappeared price and size fields above the common management fields.

The existing `Test popup` button should render the same management-card UI with a mock short `TEST` position. This lets the card be tested before a real broker position exists. In test mode, `bookmap_offer_reappear` is preselected so the editable card is visible immediately.

## Setup Choices

Long position options:

- `bookmap_offer_breakout`: Offer Breakout
- `bookmap_bid_step_up`: Bid Step Up
- `bookmap_bid_reappear`: Bid Reappear

Short position options:

- `bookmap_bid_breakdown`: Bid Breakdown
- `bookmap_offer_step_down`: Offer Step Down
- `bookmap_offer_reappear`: Offer Reappear

All setup choices render the same common management card.

## Tradebook ID Setup Inference

Use `breakoutTradeState.submitEntryResult.tradeBookID` as the first guess for the selected setup:

- `GapAndGoBookmapOfferWallBreakout` -> `bookmap_offer_breakout`
- `GapDownAndGoUpBookmapOfferWallBreakout` -> `bookmap_offer_breakout`
- `GapGiveAndGoBookmapReversal` -> `bookmap_bid_reappear`
- `GapDownAndGoUpBookmapReversal` -> `bookmap_bid_reappear`
- `GapAndCrapBookmapBidWallBreakdown` -> `bookmap_bid_breakdown`
- `GapAndCrapBreakdownBidSwingLow` -> `bookmap_bid_breakdown`
- `GapDownAndGoDownBookmapBidWallBreakdown` -> `bookmap_bid_breakdown`
- `GapDownAndGoDownBreakdownBidSwingLow` -> `bookmap_bid_breakdown`
- `GapAndCrapOfferStepDownReappear` -> `bookmap_offer_reappear`
- `GapDownAndGoDownOfferStepDownReappear` -> `bookmap_offer_reappear`

The chooser remains visible even when a setup is inferred, so the setup can be changed manually.

## Management Setup Cards

Common fields to render as editable text inputs for every setup:

- Core count
- Core target
- Runner count
- Runner target
- Runner trigger condition

Additional fields for reappear setups, rendered above the common fields:

- Original price
- Original size
- Reappeared size

Additional fields for Bookmap Offer Breakout, rendered above the common fields:

- Wall price
- Wall size
- Swing low

Additional fields for Bookmap Bid Breakdown, rendered above the common fields:

- Wall price
- Wall size
- Swing high

Additional fields for Bookmap Bid Step Up and Bookmap Offer Step Down, rendered above the common fields:

- Wall 1 price
- Wall 1 size
- Wall 2 price
- Wall 2 size

Setup cards can define field-specific hint text. For reappear setups:

- Core target hint: `vwap, premarket high`
- Bid Reappear runner trigger condition hint: `vwap reclaim, premarket high breakout`
- Offer Reappear runner trigger condition hint: `vwap bounce fail, premarket low breakdown`

Setup cards can also define field width as `long` or `short`. `Core count` is short by default. For reappear setups, `Original price`, `Original size`, and `Reappeared size` are short fields. For wall breakout/breakdown setups, `Wall price`, `Wall size`, `Swing low`, and `Swing high` are short fields. For wall step setups, `Wall 1 price`, `Wall 1 size`, `Wall 2 price`, and `Wall 2 size` are short fields.

Setup cards can define quick templates. Applying a template writes only that selected setup's draft fields, records the active template on that draft, then refreshes that side section with that template button highlighted. For reappear setups:

- `Scalp to vwap`: `runnerCount = 0`, `coreCount = 5`, `coreTarget = vwap`
- `Major at vwap`: `coreCount = 4`, `coreTarget = vwap`, `runnerCount = 3`, `runnerTarget = below vwap`
- `Confident to lose vwap`: `coreCount = 4`, `coreTarget = vwap`, `runnerCount = 6`, `runnerTarget = below vwap`

The first version should not validate or enforce these values beyond keeping them editable, saving the draft, and optionally requiring a committed active setup before exit orders can be adjusted. Later, the trading bot can read the saved management draft values and apply those rules in exit adjustment checks.

## Prefill Rules

Each field should use the first available source in this order:

1. Existing saved draft for the same symbol, side, and setup.
2. Active trade state plan, when available. This is the exact `BasePlan` copied into `TradingState` when the bot submitted the entry:
   - `TradingState.getBreakoutTradeState(symbol, isLong).plan.runnerCount`
   - `TradingState.getBreakoutTradeState(symbol, isLong).plan.coreCount`
   - `TradingState.getBreakoutTradeState(symbol, isLong).plan.coreTarget`
3. Loaded trading plan for the symbol, when no active trade state plan exists:
   - `TradingPlans.getTradingPlans(symbol)`
   - choose the matching direction's `BasePlan` for the selected setup
   - for `bookmap_offer_reappear`, use the active short plan if known; otherwise prefer `plan.short.gapAndCrapPlan`, then `plan.short.gapDownAndGoDownPlan`
4. Simple UI fallback:
   - `runnerCount`: empty string
   - `coreCount`: empty string
   - `coreTarget`: empty string
   - `runnerTarget`: empty string
   - `wallPrice`: empty string
   - `wallSize`: empty string
   - `wall1Price`: empty string
   - `wall1Size`: empty string
   - `wall2Price`: empty string
   - `wall2Size`: empty string
   - `swingLow`: empty string
   - `swingHigh`: empty string
   - `originalOfferPrice`: empty string
   - `originalSize`: empty string
   - `reappearedOfferSize`: empty string
   - `runnerTriggerCondition`: `vwap bounce fail`

Reason: `runnerCount`, `coreCount`, and `coreTarget` already live on `TradingPlansModels.BasePlan`, and existing Bookmap tradebooks use those values from their `basePlan`. Saved drafts also keep manual edits available across setup switches and page reloads.

The setup chooser stays visible even after selection because the first choice may be wrong. Changing the setup should update `setupId` in the draft and switch the card shown below the chooser.

## Draft State

Use browser `localStorage` for the first version. This keeps the implementation small and prevents UI refreshes from wiping text box edits.

Suggested draft key:

```ts
trade-management:${symbol}:${side}:${setupId}
```

Where `side` is `long` or `short`.

Suggested selected-setup key:

```ts
trade-management:${symbol}:selected
```

The selected-setup value stores only which side/setup is currently visible. Each setup keeps its own draft data, so typing in one setup card does not carry into another setup card.

Suggested per-card collapsed key:

```ts
trade-management:${symbol}:collapsed
```

The Trade Management section itself stays visible. Expanding or collapsing affects only that stock's management card, so multiple open positions can be managed independently.

Suggested shape:

```ts
interface ManagementDraft {
    symbol: string;
    side: 'long' | 'short';
    setupId?: ManagementSetupId;
    wallPrice: string;
    wallSize: string;
    wall1Price: string;
    wall1Size: string;
    wall2Price: string;
    wall2Size: string;
    swingLow: string;
    swingHigh: string;
    originalOfferPrice: string;
    originalSize: string;
    reappearedOfferSize: string;
    runnerCount: string;
    coreCount: string;
    coreTarget: string;
    runnerTarget: string;
    runnerTriggerCondition: string;
    activeTemplateId?: string;
    committed?: boolean;
    updatedAt: string;
}

type ManagementSetupId =
    | 'bookmap_offer_breakout'
    | 'bookmap_bid_step_up'
    | 'bookmap_bid_reappear'
    | 'bookmap_bid_breakdown'
    | 'bookmap_offer_step_down'
    | 'bookmap_offer_reappear';
```

The values stay strings because the first version is a manual UI. Numeric validation can come later when rules start consuming the fields.

Each setup card ends with a `Commit` button. Clicking it toggles the draft between committed and uncommitted. Transitioning from uncommitted to committed requires every rendered field for that setup to have a non-empty value. `GlobalSettings.blockExitAdjustmentsWithoutCommittedTradeManagementCard` controls whether an uncommitted active side blocks exit-order adjustments. The primary checks live in the tradebook exit-rule wrapper calls for single limit, single stop, and all-exit adjustments, with the lower order-adjustment helper kept as a configurable backstop. Clicking `Commit` also records an inferred setup as the selected setup, so tradebook-id inference can still drive the exit-adjustment guard.

## Proposed Code Shape

Keep `traderFocus.ts` as the owner of the Trade Management section, keep setup definitions in a config module, and keep management-card rendering/state helpers in a focused renderer module:

- `src/controllers/managementCard.ts`
  - localStorage draft load/save
  - trading-plan default lookup
  - card render functions
  - field change handlers
- `src/controllers/managementCardConfig.ts`
  - setup option definitions
  - setup-specific field hints
  - setup-specific field widths
  - setup-specific quick templates
- `src/controllers/traderFocus.ts`
  - call `ManagementCard.render(root, contexts)` from `updateTradeManagementUI()`
  - keep the `breakoutTradeState` lookup so `tradeBookID` can infer the active setup
  - expose the `Test popup` path through `ManagementCard.populateMockForTest(root)`
- `src/main.ts`
  - call `TraderFocus.test()` from the `#test_popup` click handler
- `public/mystyle.css`
  - add small styles for setup buttons and compact form rows
- `src/config/globalSettings.ts`
  - expose `blockExitAdjustmentsWithoutCommittedTradeManagementCard`

This avoids mixing the new manual management-card state with the existing tradebook entry logic.

## Rendering Flow

```ts
updateTradeManagementUI()
    -> Models.getWatchlist()
    -> Models.getOpenPositions()
    -> build symbol contexts from the watchlist
    -> TradingState.getBreakoutTradeState(symbol, isLong) for positioned symbols
    -> read breakoutTradeState.submitEntryResult.tradeBookID when available
    -> ManagementCard.render(root, contexts)
        -> create each watchlist card only once
        -> render long and short setup sections once
        -> on later updates, only update the status tag and side visibility
        -> derive side from position.netQuantity when present
        -> infer setup from tradebookID only on the active side when present during first render
        -> load selected setup from localStorage
        -> load draft for selected symbol/side/setup from localStorage
        -> always render setup choosers
        -> mark selected or inferred setupId as active only on the selected/position side
        -> render one selected setup management card
        -> add original/reappeared price and size fields for reappear setups
```

## First Coding Slice

1. Add `src/controllers/managementCard.ts`.
2. Update `src/controllers/traderFocus.ts` so the management shell is rendered from the watchlist on page load and the active side follows the open position direction.
3. Add compact styles in `public/mystyle.css`.
4. Run the TypeScript build.
5. Manually verify:
   - page load: Trade Management renders one card per watchlist symbol
   - no position: each card still shows selectable long and short setup sections
   - no position: selecting any setup shows its editable management card
   - long position: long setup choices show
   - short position: short setup choices show
   - short position: long setup choices are hidden
   - selecting Offer Reappear shows offer-size fields plus the common editable fields
   - selecting any other setup shows the common editable fields
   - setup choices remain visible after selecting a setup
   - selecting a different setup changes the one visible active setup and rendered card
   - text entered in one setup card does not carry over to another setup card
   - manual edits survive `TraderFocus.updateTradeManagementUI()`
   - clicking `Test popup` renders a mock short `TEST` card with Offer Reappear selected

## Not In First Version

- No order changes.
- No exit-rule enforcement.
- No Firestore persistence.
- No validation beyond rendering editable fields.
- No setup-specific fields for the other five setup choices yet.
