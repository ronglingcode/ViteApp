# Risk model: 1R = $1,000, daily max 4R

Status: implemented, pending review (not committed).

## Goal

- 1R = $1,000 of risk per full-size trade.
- Daily max loss = 4R = $4,000.
- Two default entry methods:
  - `1 R` (default): risks $1,000 and splits the exit into 10 partial pairs.
  - `0.1 R`: risks $100 and uses a single exit pair.
- Safety reductions (liquidity scale, tradable area / VWAP / volume halvings) still reduce size below the target.

## How it worked before

- `Helper.returnDefaultEntryMethods()` returned `["0.5 R", "0.1 R"]`; `getRiskMultiplierFromEntryMethod()` parsed the trailing number.
- Only `BookmapWallReversal` consumed the entry method. Buttons render from `getEntryMethods()` in the main chart UI, the Lite UI, and the Bookmap plugin definitions. The Bookmap hover hotkey defaults to the first method.
- Per-trade risk was `allowedSize x getMaxDailyLossLimit()`, where `allowedSize = liquidityScale x getRiskMultiplerForNextEntry(...) x entryMethodMultiplier`. `getRiskMultiplerForNextEntry` defaulted to `0.24` (a fraction of the daily max), so a `"0.5 R"` entry actually risked `0.24 x 0.5 x dailyLimit` (~$600-$1,250).
- `RiskManager.dailyMax = 5000`, but `getMaxDailyLossLimit()` returned `initialBalance x 0.0575 x 1.2` (~6.9% of account) when the day's initial balance was over $120K, else $5,000.
- Exit partials came from the global `GlobalSettings.batchCount = 10` (`TakeProfit.BatchCount`). `planConfigs.sizingCount` was already written into the persisted trade plan on entry, but was always 10.
- Downstream code (`handler.getPartialQuantity`, `handler.trailStop`, `exitRulesCheckerSimple.isAllowedForSingle`, `coreTargetExitRules.getOriginalPartialNumber`, `bookmapSocket.getPartialsTaken`) assumed 10 partials.

## Changes

### 1. `src/algorithms/riskManager.ts` - R as a real unit

- `export const R = 1000;`
- `export const dailyMax = 4 * R;` (4000)
- `getMaxDailyLossLimit()` returns `dailyMax` unconditionally (balance-based scaling removed, per decision).
- `allowAddIfBelow = R` (1R, same dollar value as before).
- `calculateTotalShares`: `maxRiskPerTrade = multiplier * R`.
- `getInitialMultipler`: default `0.24` -> `1` (a plan's `planConfigs.size`, if ever set, is now an R multiplier).
- `riskInDollarToMultiples`: `risk / R`, so all "risk multiple" consumers are true R units. This keeps `quantityToRiskMultiples` (swap-position flow) consistent with `calculateTotalShares`.
- `isOverSized`: threshold `0.25` -> `1.0` (over 1R).

### 2. `src/utils/helper.ts` - entry method table

- `returnDefaultEntryMethods()` returns `["1 R", "0.1 R"]`.
- Added `entryMethodConfigs` table: label -> risk multiple + partials count (`1 R` -> 10 pairs, `0.1 R` -> 1 pair).
- Added `getPartialCountFromEntryMethod(entryMethod, defaultCount = batchCount)`. Unknown or prefixed labels fall back to `defaultCount` (10), preserving legacy behavior.
- `getRiskMultiplierFromEntryMethod` refactored onto a shared `parseRiskMultipleFromEntryMethod`, behavior unchanged.

### 3. `src/tradebooks/bookmapWallReversal.ts` + `src/tradebooks/baseTradebook.ts` - carry the count

- `triggerEntry` computes `partialsCount` from the entry method and passes it through `triggerEntryCommon` -> `submitEntryOrdersBase`.
- `submitEntryOrdersBase` takes an optional `partialsCount` (default `this.sizingCount`), writes it to `basePlan.planConfigs.sizingCount` (persisted with the trade state), and stores `basePlan.entryMethod` for traceability.

### 4. `src/controllers/orderFlow.ts` + `src/algorithms/takeProfit.ts` - build N exit pairs

- `submitBreakoutOrders` / `submitMarketEntryOrders` read `plan.planConfigs.sizingCount` (fallback `TakeProfit.BatchCount`) and pass it into both the fixed-risk and fixed-quantity paths.
- `getEntryProfitTargets` / `getEntryTargetPrices` / `splitTargetsEvenly` accept `partialsCount = BatchCount` and use it instead of the module constant. With count 1 the whole share size goes to one target (nearest Bookmap wall, else 3R).

### 5. `src/models/tradingState.ts` - read the trade's count

- Added `getPartialsCount(symbol, isLong)` reading `breakoutTradeState.plan.planConfigs.sizingCount`, falling back to `GlobalSettings.batchCount` for trades persisted before this change.

### 6. Downstream consumers use the trade's count

- `handler.getPartialQuantity` - KeyA reload size uses the trade's count (1R -> 1/10 of initial; 0.1R -> full position, per decision).
- `handler.trailStop` - `getBatchIndex` uses the trade's count.
- `exitRulesCheckerSimple.isAllowedForSingle` - early single-exit allowance uses `planConfigs.sizingCount`.
- `coreTargetExitRules.getOriginalPartialNumber` - partial numbering uses the trade's count (feature is behind `enableCoreTargetExitFeature = false`).
- `bookmapSocket.getPartialsTaken` - passes the trade's count to `estimateCompletedPartials` (same feature flag).

Deliberately unchanged:

- `handler.cancelKeyPressed` keeps the global `BatchCount * 0.4` threshold so a single-exit-pair trade is still treated as "not split" (cancel-all path).
- `bookmapSocket.getPositionRiskPercent` still sends percent-of-R to the plugin (`riskPercent` is part of the external plugin contract); a 1R position is 100%.

### 7. Display in R units (`src/ui/chart.ts`)

- `getRiskMultiplesForDisplay` returns R units instead of `x100` percent.
- Pending entry label becomes `entry: <n>R`; `entryOrderLabelRiskMultiple` is now in R units (`autoTrader.detectOverRisk`'s `> 1.5` threshold now means 1.5R).
- `showPositionSize` shows `Pos: +<n>R` instead of a percent.

### 8. No changes needed

- Chart / Lite / Bookmap button rendering picks up the new labels automatically (`0.1 R` is under the two-buttons-per-row length limit).
- Schwab order factory handles a single OCO child (`createOneEntryWithMultipleExits` loops over targets; `extractWorkingExitPairs` accepts one pair).
- `tradingPlans.populateTargetsLabels` already caps by the actual exit-pair count.

## Behavior notes

- Full-size risk becomes $1,000 (up from ~$600-$1,250); 0.1R becomes $100 (down from ~$120-$250).
- Daily stop becomes $4,000 flat (down from ~$10K on a $150K account).
- `Math.max(2, ...)` in `calculateTotalShares` still applies: on a stock with more than $50 risk/share, 0.1R can exceed $100 for the 2-share minimum.
- Existing open trades keep their persisted `sizingCount` (10), so their management is unchanged.

## Validation

- `npx tsc --noEmit`
- `npm run build`
- Manual smoke with the localhost proxy running:
  - Main and Lite UIs show `1 R` / `0.1 R`; Bookmap plugin receives the new definitions; hover hotkey defaults to `1 R`.
  - `1 R` entry -> 10 exit pairs, risk ~$1,000.
  - `0.1 R` entry -> 1 exit pair, risk ~$100.
  - New entries blocked once realized PnL reaches -$4,000.
  - KeyA reload on a 0.1R trade adds the full position back.
