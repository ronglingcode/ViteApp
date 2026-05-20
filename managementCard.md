# Management Card Implementation Plan

## Goal

Add a Trade Management card that appears when the account has an open position. The first version is UI-only: it helps choose the setup and edit management values, but it does not enforce those values in order or exit rules yet.

## Current App Touchpoints

- `index.html` already has a left-pane Trade Management section:
  - `#traderFocusInstructionsContent`
- `src/controllers/traderFocus.ts` already owns that section:
  - `updateTradeManagementUI()` clears and rebuilds the management pane.
  - `populateTradeManagementForPosition()` delegates open-position rendering to `ManagementCard.populateForPosition()`.
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

## First Version Behavior

For every open position:

1. Show a management card inside `#traderFocusInstructionsContent`.
2. Determine long or short from `position.netQuantity`.
3. Read `TradingState.getBreakoutTradeState(symbol, isLong).submitEntryResult.tradeBookID`.
4. Infer the initial setup from that tradebook ID.
5. Always show the setup chooser for that position.
6. If a setup has already been selected or inferred, show it as the active selection.
7. When a setup is selected, persist that selection as a local draft and re-render the matching card.
8. If the selected setup is `bookmap_offer_reappear`, show the first editable management card.
9. Other setup choices can be recorded, but their full cards can show a small placeholder until we implement them.

The card disappears automatically when there is no open position because `updateTradeManagementUI()` rebuilds from `Models.getOpenPositions()`.

The existing `Test popup` button should render the same management-card UI with a mock short `TEST` position. This lets the card be tested before a real broker position exists. In test mode, `bookmap_offer_reappear` is preselected so the editable card is visible immediately.

## Setup Choices

Long position options:

- `bookmap_offer_breakout`: Bookmap Offer Breakout
- `bookmap_bid_step_up`: Bookmap Bid Step Up
- `bookmap_bid_reappear`: Bookmap Bid Reappear

Short position options:

- `bookmap_bid_breakdown`: Bookmap Bid Breakdown
- `bookmap_offer_step_down`: Bookmap Offer Step Down
- `bookmap_offer_reappear`: Bookmap Offer Reappear

Only `bookmap_offer_reappear` gets a full card in the first coding pass.

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

## Bookmap Offer Reappear Card

Fields to render as editable text inputs:

- Runner count
- Core count
- Core target
- Runner trigger condition

The first version should not validate or enforce these values beyond keeping them editable and saving the draft. Later, the trading bot can read the saved management draft and apply those rules in exit adjustment checks.

## Prefill Rules

Each field should use the first available source in this order:

1. Existing saved draft for the same open position.
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
   - `runnerTriggerCondition`: `vwap bounce fail`

Reason: `runnerCount`, `coreCount`, and `coreTarget` already live on `TradingPlansModels.BasePlan`, and existing Bookmap tradebooks use those values from their `basePlan`. Account refreshes can rebuild the Trade Management pane, so saved drafts prevent manual edits from being lost while trading.

The setup chooser stays visible even after selection because the first choice may be wrong. Changing the setup should update `setupId` in the draft and switch the card shown below the chooser.

## Draft State

Use browser `localStorage` for the first version. This keeps the implementation small and prevents UI refreshes from wiping text box edits.

Suggested key:

```ts
trade-management:${symbol}:${side}
```

Where `side` is `long` or `short`.

Suggested shape:

```ts
interface ManagementDraft {
    symbol: string;
    side: 'long' | 'short';
    setupId?: ManagementSetupId;
    runnerCount: string;
    coreCount: string;
    coreTarget: string;
    runnerTriggerCondition: string;
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

## Proposed Code Shape

Keep `traderFocus.ts` as the owner of the Trade Management section, but move the new management-card rendering and state helpers into a focused module:

- `src/controllers/managementCard.ts`
  - setup option definitions
  - localStorage draft load/save
  - trading-plan default lookup
  - card render functions
  - field change handlers
- `src/controllers/traderFocus.ts`
  - call `ManagementCard.populateForPosition(position, root)`
  - stop requiring `breakoutTradeState` before showing a management card
  - expose the `Test popup` path through `ManagementCard.populateMockForTest(root)`
- `src/main.ts`
  - call `TraderFocus.test()` from the `#test_popup` click handler
- `public/mystyle.css`
  - add small styles for setup buttons and compact form rows

This avoids mixing the new manual management-card state with the existing tradebook entry logic.

## Rendering Flow

```ts
updateTradeManagementUI()
    -> Models.getOpenPositions()
    -> TradingState.getBreakoutTradeState(symbol, isLong)
    -> read breakoutTradeState.submitEntryResult.tradeBookID
    -> ManagementCard.populateForPosition(position, root, tradebookID)
        -> derive side from position.netQuantity
        -> infer setup from tradebookID
        -> load draft from localStorage
        -> always render setup chooser
        -> mark saved or inferred setupId as active when present
        -> if draft.setupId === 'bookmap_offer_reappear', render Bookmap Offer Reappear card
        -> otherwise render selected setup header and placeholder
```

## First Coding Slice

1. Add `src/controllers/managementCard.ts`.
2. Update `src/controllers/traderFocus.ts` so open positions always get a management card based on position direction.
3. Add compact styles in `public/mystyle.css`.
4. Run the TypeScript build.
5. Manually verify:
   - no position: Trade Management section is empty
   - long position: long setup choices show
   - short position: short setup choices show
   - selecting Bookmap Offer Reappear shows the editable fields
   - setup choices remain visible after selecting a setup
   - selecting a different setup changes the active setup and rendered card
   - manual edits survive `TraderFocus.updateTradeManagementUI()`
   - clicking `Test popup` renders a mock short `TEST` card with Bookmap Offer Reappear selected

## Not In First Version

- No order changes.
- No exit-rule enforcement.
- No Firestore persistence.
- No validation beyond rendering editable fields.
- No full cards for the other five setup choices.
