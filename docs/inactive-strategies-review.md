# Inactive historical strategy remnants: removal proposal

## Second review at current HEAD

Rechecked 2026-10-01 at ViteApp HEAD `09781e943f17435ee18d3ae0a9cefb17838afd4e`. The only worktree change is this review document, already staged from the earlier audit; no application edit is being made in this review.

Three approved cleanup commits landed after the first review:

| Commit | Completed scope | Effect on this proposal |
| --- | --- | --- |
| `c2e4846` | Removed the four obsolete wall-break enum IDs, `enableBookmapWallBreakSwingPullback`, and the three obsolete wall-break sections from `rules.md`. | H1-H5 and the earlier wall-break D1 are complete. Do not propose them again. H6-H11 remain open. |
| `110032e` | Removed TradeStation API/order factories, futures and TradeStation profiles, broker branches, TradeStation auto-sync, related secret fields and UI controls. | TradeStation removal is complete. The remaining TDA adapter is still active in `marketData.ts` for quotes/weekly-options and is exposed through `HybridApp.Api.TdaApi`; it is not a dead TradeStation remnant. |
| `09781e9` | Removed J/K/L trailing-stop and Shift trailing-market-out workflows from browser handlers, keyboard dispatch, core workflow, fixture coverage and the index help text. | Trailing execution is complete. Remaining mentions are documentation stale references only; no trailing code deletion is proposed. |

The current factory still constructs exactly six active `BookmapWallReversal` definitions. The two alternate swing-low IDs (`GapAndCrapBreakdownBidSwingLow`, `GapDownAndGoDownBreakdownBidSwingLow`) still remain only in `BookmapWallReversal` branches and are still open candidates H6-H7. The old audit's H8-H11, V2-V14, S1-S3, U1-U4 and F1-F6 remain candidates unless separately approved.

New findings from this pass:

- `src/api/tdAmeritrade/api.ts` is a live dependency: `src/api/marketData.ts` calls `getQuote` and `hasWeeklyOptions`, while `main.ts` exposes `TdaApi`. Do not remove the TDA folder under the TradeStation decision.
- Futures support is only partially removed. `src/config/profiles/futures.ts` is gone and `marketData.ts` explicitly rejects/returns empty for futures, but `Helper.isFutures`, `TradingPlans.isFutures`, futures branches in `rules.ts`, `watchlist.ts`, `bookmapSocket.ts`, `chart.ts`, `streamingHandler.ts` and TDA-facing parameters remain. This is an uncertain compatibility cleanup, not proof of dead code. It is tracked as T1 below and should remain deferred until persisted plan data and symbol conventions are checked.
- `rules.md` still catalogs eleven deleted or no-longer-constructed strategy classes (`GapAndCrapBookmapRejection`, old gap-down/go-up, premarket rejection, gap/give-and-go, big-wall breakdown, ATH continuation, open-drive, VWAP continuation, above-water breakout and emerging-strength breakout). Only `baseTradebook.ts` and `bookmapWallReversal.ts` are concrete classes under `src/tradebooks`. This is a documentation cleanup candidate D2, separate from runtime removal.
- `docs/performance-improvement-tasks.md` still mentions TradeStation auto-sync and `docs/risk-model-1r-plan.md` still names `handler.trailStop`; these are stale documentation references after the recent commits. They are tracked as D3-D4, with no code behavior implied.

No new source deletions are authorized by this review. The completed commits remain outside this chat's future implementation scope, and this document remains the only file being updated here.

Historical baseline review (superseded by the second review above): started at ViteApp HEAD `a883086e2e6b00b4c237cd4403e2740a18e978ff` and ended at `7237b16415502a64e5c76a4a02ace5aeac27a925` after another chat committed its authorized VWAP removals. Source references and remaining candidates in the baseline sections below were later rechecked at current HEAD. **Proposal only. No application code has been changed by this review. Every removal below requires the human user's explicit approval in this chat.** Leave any subsequently approved implementation uncommitted for human review.

## Scope and starting state

“Inactive historical strategies” is migration shorthand, not a hidden collection of complete strategy implementations. The current source has one concrete `BookmapWallReversal extends Tradebook` implementation and six active factory definitions. Other remnants are identifiers, branches, plan/config declarations, analysis helpers and duplicate wiring. These categories need different decisions.

Seven application files already had uncommitted VWAP bounce/fail removal changes when this review started:

- `src/algorithms/autoTrader.ts`, `src/algorithms/vwapPatterns.ts`
- `src/controllers/handler.ts`, `src/controllers/keyboardHandler.ts`
- `src/models/models.ts`, `src/models/tradingPlans/tradingPlansModels.ts`
- `src/tradebooks/tradebookIds.ts`

The initially untracked [feature-removal-progress.md](C:/Users/lingr/trading/ViteApp/docs/feature-removal-progress.md) belongs to chat `01a0f9d5-5bed-7a41-83f2-bf0f3cf27ff3`. Its recent history and source diff were inspected read-only. That chat records the user's selection of “vwap bounce fail strategy” and initial instruction not to commit. This proposal does not repeat that removal or authorize edits to its progress document. Future approved edits in overlapping files must preserve its changes.

**Concurrent update detected before delivery:** that same chat subsequently received the user's explicit “also remove code for the Vwap push down fail strategy” request and completed it. The final working tree has both removals. The source diff increased from 100 to 156 deleted lines, and that chat updated its progress document. This review did not cause those changes. V1 below is now an already-completed record, excluded from approval; S3 is narrowed to the remaining open-drive shapes. Remaining source references were rechecked after this update.

**Final checkpoint:** the user then explicitly told that chat “commit this work.” It committed the two removals and its progress document as `7237b16`, leaving this review document untracked. The earlier uncommitted-state notes describe the audit's starting state. This review did not stage or commit anything; its approval requirement and no-commit default for later implementation remain in effect.

Read for context: workspace and ViteApp `AGENTS.md`, [trading library README](C:/Users/lingr/trading/ViteApp/src/trading/README.md), and the sibling Bookmap `direct-broker-execution.md`, `direct-broker-execution-plan.md`, `standalone-native-trading-plan.md` and `standalone-native-trading-progress.md`. Current operation/progress documents supersede historical bridge/flag rollout plans. No Bookmap change is proposed here.

## Retained behavior: mandatory boundary for every approval

The following six IDs remain unchanged in [createTradebookDefinitions](C:/Users/lingr/trading/ViteApp/src/trading/core/configuration/tradingConfig.ts:4) and are constructed by [createAllTradebooks](C:/Users/lingr/trading/ViteApp/src/tradebooks/tradebooksManager.ts:83):

| Active ID | Plan / entry boundary |
| --- | --- |
| `GapGiveAndGoBookmapReversal` | `long.gapAndGoPlan` / support |
| `GapDownAndGoUpBookmapReversal` | `long.gapDownAndGoUpPlan` / support |
| `GapAndCrapOfferStepDownReappear` | `short.gapAndCrapPlan` / resistance |
| `GapDownAndGoDownOfferStepDownReappear` | `short.gapDownAndGoDownPlan` / resistance |
| `RangeBoundBidReversal` | `rangeBoundReversalPlan` / support |
| `RangeBoundOfferReversal` | `rangeBoundReversalPlan` / resistance |

Preserve their plan evidence, side enablement, area normalization/validation, inclusive range/defensive-edge entry policy, retest modes, entry methods and current prices/stops. Preserve all entry/exit/risk/sizing/core/target/reload/swap rules, market data, notifications, indicator computations and mirrored libraries/core/runtime.

In particular, [BookmapWallReversal.getAllowedReasonToAddPartial](C:/Users/lingr/trading/ViteApp/src/tradebooks/bookmapWallReversal.ts:175) still calls:

- `gapAndCrapAlgo.getAllowedReasonToAddPartial`: entry below VWAP.
- `gapDownAndGoDownAlgo.getAllowedReasonToAddPartial`: entry below VWAP.
- `gapDownAndGoUpAlgo.getAllowedReasonToAddPartial`: entry at/above premarket high.

Keep those modules and rules. The active gap give-and-go default add permission and range-bound current fallback also remain unchanged. Neither absence of a historical class nor absence from the factory authorizes deleting an entire gap algorithm module.

Also retain `BasePlan`, `PlanConfigs`, support/resistance and price-reference types, `Analysis.singleMomentumKeyLevel`, `usePremarketKeyLevel`, shared plan accessors and all active gap/range plans. Keep `GapAndGoPlan.allTimeHigh`: the current core configuration validator accepts it as gap-plan evidence, and `gapAndGoAlgo.hasAtLeastOneReasonSet` reads it. Keep `SymbolData.allTimeHigh` and its historical-high calculation in `indicators/basicIndicators.ts`.

## Evidence and compatibility limits

The old [dead-code audit](C:/Users/lingr/trading/ViteApp/docs/dead-code-audit.md) and JSON were starting inventories, not current removal authority. Rechecked candidate names, imports, call/reference chains, current factories, `main.ts` namespace assignments, generated chart controls, checked-in scripts/tests and fixture mentions. No audit or fixture generator was run.

`window.HybridApp.Algo.AutoTrader`, `Models.TradingPlans`, `UI.Chart` and several controller namespaces are public browser APIs. `vwapPatterns`, `patterns`, `rules`, `tradebooksManager`, `TradebookID` and the disconnected helper modules are not directly assigned as whole namespaces in `main.ts`. No checked-in dynamic importer or reflective consumer of the proposed functions was found. This is evidence of checked-in inactivity, not proof against arbitrary developer-console ESM imports or untracked tooling.

`index.html` loads remote TradingData `watchlist/recentData.js`. Its deployed contents and private console scripts were not fetched or inspected. Local TradingData producer source was searched read-only for the relevant config/type fields. No Backtest or live Firestore documents were read. External/current persisted-state content therefore remains unverified; approvals must not imply a database purge or producer update.

Configuration is permissive at runtime: `models/tradingPlans/tradingPlans.ts#fetchConfigData` casts `data.plans`, and core `readTradingConfig` similarly retains raw plan objects rather than stripping unknown keys. Firestore codecs decode arbitrary fields. Type declaration deletion alone does not remove serialized data or prevent old extra fields from surviving loads.

Captured trade identity is a string: `SubmitEntryResult.tradeBookID` in `models.ts`, consumed by reload/exit lookup in `handler.ts` and `exitRulesCheckerNew.ts`. Same-day state restoration retains captured plans/results; `TradeState` also clones restored raw state. Obsolete IDs already lack constructed factory tradebooks. Removing enum declarations must not remove/rewrite saved ID strings, captured `BasePlan`, partial counts, target coverage or unknown-ID fallback behavior. Any change to those behaviors would need another proposal.

## Approval items H: historical IDs and disconnected strategy helpers

H1-H5 below are historical records of the wall-break cleanup already committed in `c2e4846`; they are closed and must not be selected again. H6-H11 remain separately approvable. Shared compatibility notes above and validation recipes below apply in addition to each row's specifics.

| Item | Purpose and exact proposed removal | Current inactivity evidence | Retain / compatibility / expected change | Focused validation |
| --- | --- | --- | --- | --- |
| **H1 — complete** | `TradebookID.GapAndGoBookmapOfferWallBreakout`; former long offer-wall breakout identity. | Removed in `c2e4846`; no current application reference. | Keep gap-and-go plan, support, ATH evidence and reversal ID. Saved strings remain readable. | Historical validation recorded in `docs/wall-break-strategy-removal.md`. |
| **H2 — complete** | `TradebookID.GapAndCrapBookmapBidWallBreakdown`; former short bid-wall breakdown identity. | Removed in `c2e4846`; no current application reference. | Keep offer-step-down/reappear reversal and `gapAndCrapAlgo` add rule. | Historical validation recorded in the wall-break review. |
| **H3 — complete** | `TradebookID.GapDownAndGoDownBookmapBidWallBreakdown`; former gap-down short bid-wall breakdown identity. | Removed in `c2e4846`; no current application reference. | Keep short gap-down reversal, resistance and below-VWAP add rule. | Historical validation recorded in the wall-break review. |
| **H4 — complete** | `TradebookID.GapDownAndGoUpBookmapOfferWallBreakout`; former gap-down long offer-wall breakout identity. | Removed in `c2e4846`; no current application reference. | Keep long gap-down reversal, support and premarket-high add rule. | Historical validation recorded in the wall-break review. |
| **H5 — complete** | `enableBookmapWallBreakSwingPullback`; unused false flag for wall-break swing-stop tracking. | Removed in `c2e4846`; historical `BookmapWallBreak` used it. | Shared chart price selection, swing/candle/stop helpers and other flags remain. | Historical validation recorded in the wall-break review. |
| **H6** | `TradebookID.GapAndCrapBreakdownBidSwingLow` plus its exclusive constructor name/label/side branch and second OR operand in `BookmapWallReversal.getAllowedReasonToAddPartial`. Files: `tradebookIds.ts`, `bookmapWallReversal.ts`. | Only enum plus those two branches; no factory construction or checked-in direct constructor for this ID. | Preserve the active `GapAndCrapOfferStepDownReappear` branch and common `GapAndCrapAlgo` call. Saved strings remain; intentional direct construction with this retired ID loses its recognized name/add branch. | B, I, P, A |
| **H7** | `TradebookID.GapDownAndGoDownBreakdownBidSwingLow` plus its exclusive constructor branch and second OR operand in add eligibility, same two files. | Only enum plus those two branches; absent from factory. | Preserve active `GapDownAndGoDownOfferStepDownReappear` and its common gap-down add call. As H6, deliberate external construction would no longer recognize the alternative. | B, I, P, A |
| **H8** | Entire disconnected `src/tradebooks/singleKeyLevel/commonRules.ts`, containing `validateCommonEntryRules`. Checks outside-key-level price, global size/risk rules and optional VWAP alignment. | No checked-in importer, callback registration or namespace exposure. Former `singleKeyLevelTradebook.ts` already deleted. | Preserve `EntryRulesChecker.checkBasicGlobalEntryRules`, `Patterns.isPriceOutsideLevel`, models, logging and shared `LevelArea`/`BasePlan`. No live strategy checks are removed. No persisted schema. | B, I, A |
| **H9** | Entire disconnected `src/utils/entryThresholdValidator.ts`: `ThresholdValidatorConfig`, `validateEntryThreshold`, `entryIsLessThanThreshold`. Earlier key-level/1m ORB/first-new-high-low validator. | No checked-in importer/exposure. `return true` at line 35 makes later ORB/first-new-high-low branches unreachable; initial missing-candle/key-level checks still precede it. | Do not describe the whole function as unconditional success. Retain candle aggregation, market clock, price comparison helpers elsewhere and chart first-high/low behavior. No current trading or schema change. | B, I, C |
| **H10** | Only `getFirstNewHighLowPrice` in `src/algorithms/patterns.ts:371`; selects a first new high/low threshold from post-open bars. | No checked-in caller/reference beyond declaration. Not directly exposed by `main.ts`. | Keep the file and all general candle/range/price helpers. In particular keep `getFirstNewHighInFirstFiveMinutes`. No current chart/order change. | B, I, C |
| **H11** | Only `checkFirstNewHighPattern` in `src/algorithms/patterns.ts:397`; analyzes untriggered first-high/low pattern and closed reversal candles on a chosen timeframe. | No checked-in caller/reference beyond declaration. | Keep `isRedBar`, `isGreenBar`, aggregation and shared data access. No current chart/order change. | B, I, C |

Historical confirmation: `src/tradebooks/bookmapWallBreak.ts` was deleted by `35849e7`; its parent version contained the four H1-H4 identities, wall crossing/pullback checks and H5-controlled swing-pullback tracking/stop selection. There is no current class to remove. `singleKeyLevelTradebook.ts` was deleted in `2833299`. `vwapContinuationFailed.ts` was deleted in `875e5b5`.

**Preserve the similarly named active chart helper.** `patterns.getFirstNewHighInFirstFiveMinutes` is called by `ui/chart.ts#getBreakoutEntryPrice` when `entryParameters.useFirstNewHigh` is selected. `Chart` is exposed through `HybridApp.UI.Chart`; chart button generation also retains first-high/first-low parameter support. Even when default wall-reversal controls do not select this parameter, it is a retained chart API path. H9-H11 do not authorize removing it, `TradebookEntryParameters.useFirstNewHigh` or its UI wiring.

## Approval items V: selective VWAP/open-drive analysis cleanup

Keep both `src/algorithms/vwapPatterns.ts` and `src/algorithms/rules.ts`. This table classifies every current `vwapPatterns` export plus the relevant older rules. “Inactive” means no current checked-in reachable caller; external developer ESM consumers remain unverified as described above. These are analysis/rule helpers, not complete strategy classes.

All V removal items have no dedicated persisted-state schema. Retain underlying candles, VWAP data/calculation/display/notifications, ATR, plan accessors and `Helper`/logging/risk/config modules. Expected behavior change for each inactive item is loss of that callable ESM helper only; no current application trading or annotations change. Validate B and I for each; additionally D for edits to this module, and A for edits to `rules.ts`.

| Item / decision | Exact symbol(s) and current source | Purpose, evidence and dependency boundary |
| --- | --- | --- |
| **KEEP — active browser analysis and exposed API dependency** | `vwapPatterns.getStatusForVwapContinuationLongWithPremarketHigh` (`:12`) | Reports consolidation/testing/confirmation between VWAP and premarket high. Called by `autoTrader.getChartAnalysis` (`:681`); that function is called from price updates (`:618`) to update the chart tooltip price line and is exposed as `HybridApp.Algo.AutoTrader.getChartAnalysis`. Preserve its complete calculation. |
| **V1 — already removed elsewhere; not selectable** | Former `vwapPatterns.getStatusForVwapPushdownFail` | Long failed-pushdown status scan had no checked-in caller at review start. The other chat removed it during this review under its own explicit user authorization, then committed it in `7237b16`. Keep that removal intact; no duplicate work is proposed here. |
| **V2 — inactive root and exclusive child** | `vwapPatterns.getStatusForOpenDrive` (`:89`) and `getAboveWaterMomentumForPrice` (`:65`) | Open-drive status from price/key-level/VWAP momentum and consecutive weakness/reversal. Root has no caller. Momentum helper has only three references, all inside that root. Approve/delete the pair together; do not delete key-level/VWAP accessors. |
| **V3 — inactive rule chain** | `rules.isAllowedByVwapContinuation` (`:502`), `vwapPatterns.isVwapContinuationEntry` (`:246`), `hasTwoConsecutiveCandlesAgainstVwap` (`:181`) | Historical continuation filter escalates from 1m to 5m/15m/30m after 10/30/60 minutes. Root has no caller; its two child helpers are referenced only from the root. Delete the complete chain only if approved; retain the independent active status helper above and shared `getSingleMomentumLevel`/`hasSingleMomentumLevel`. |
| **V4 — inactive scratch diagnostic** | `vwapPatterns.test` (`:5`) | Hardcoded NKE loop over 90-119 bars logging continuation status. No checked-in `VwapPatterns.test` caller or namespace exposure. Remove scratch wrapper only; retain the status function it invokes. |
| **V5 — inactive** | `vwapPatterns.hasTwoConsecutiveCandlesAgainstLevel` (`:131`) | Detects two closes on wrong side of a fixed level; no caller. General analysis helper, not proof of a removed strategy. |
| **V6 — inactive** | `vwapPatterns.hasTwoConsecutiveCandlesAgainstLevelAfterCloseAbove` (`:148`) | Detects loss after an earlier close on the favorable side; no caller. Preserve ordinary level and candle state. |
| **V7 — inactive** | `vwapPatterns.hasMostRecentClosedCandleAgainstVwap` (`:207`) | Tests latest closed candle against its VWAP; no caller. Preserve active VWAP notifications/controllers in other modules. |
| **V8 — inactive** | `vwapPatterns.getNumberOfCandlesClosedAgainstVwap` (`:223`) | Counts against-VWAP bars using its existing forward loop; no caller. Comment/loop discrepancy is irrelevant to removal and is not a request to repair behavior. |
| **V9 — inactive** | `vwapPatterns.isNearAgainstVwap` (`:261`) | Tests opposite-side proximity within 0.15 ATR; no caller. Preserve ATR/VWAP values and active proximity logic elsewhere. |
| **V10 — inactive** | `vwapPatterns.isNearAlignWithVwap` (`:272`) | Favorable-side proximity within 0.15 ATR; no caller. Same boundary as V9. |
| **V11 — inactive** | `vwapPatterns.isNearAgainstLevel` (`:284`) | Opposite-side level proximity within 0.15 ATR; no caller. Preserve support/resistance policies. |
| **V12 — inactive; broader rule helper** | `rules.checkVwap` (`:60`) | Profile-aware entry alignment with exceptions for distance/risk ratios >=2 or <=0.25. No checked-in caller. Does not authorize removing `requireVwapSameDirection` profile fields or wall-reversal `mustAlignVwap` checks. |
| **V13 — inactive; broader opening rule helper** | `rules.checkOpenCandle` (`:90`) | Avoids chasing an opening candle, with second-minute retracement/top-pick cases; no caller. Keep general candle direction helpers even if their current remaining references are only in this function. Removing those helpers or profile fields would require another scope. |
| **V14 — inactive; broader rule helper** | `rules.isLossWhenHoldingVwap` (`:299`) | Combines `Patterns.isPriceAboveVwap` with overall symbol profit; no caller. Remove this rule wrapper only. Preserve profit/account state and `Patterns.isPriceAboveVwap` for separate review. |

`entryRulesChecker.ts` has an unused namespace import of `VwapPatterns`; no current `VwapPatterns.*` calls occur there. An approved V edit may remove that import if confirmed still unused. Import cleanup in changed files is allowed only when made unnecessary by the approved deletions; no blanket import/function cleanup is included.

Classification uncertainty concerns **external consumption**, not an invented active internal caller. There is no reason to remove `AutoTrader.getChartAnalysis`, its tooltip update or its public namespace to make V cleanup easier. Other exported functions in `patterns.ts` and `rules.ts` outside the listed items are out of scope.

## Approval items S: old plan/config declarations — separate compatibility decision

All proposed symbols here are in `src/models/tradingPlans/tradingPlansModels.ts`. They have no current runtime reads or factory construction, but several fields are still **produced** by TradingData. These items remove ViteApp declarations only; they never authorize pruning JSON, Firestore state, producer code or another repository. Recommendation: **defer Group S while reviewing the schema boundary**, or explicitly approve declaration-only retirement with permissive old-field loading retained.

| Item | Exact proposed removal and purpose | Evidence / external producer | Retain / behavior / validation |
| --- | --- | --- | --- |
| **S1** | `SingleDirectionPlans.levelMomentumPlan` and `LevelMomentumPlan`; old single-level momentum plan. | Only ViteApp declaration. `TradingData/dataPusher/data.ts` still constructs it for both directions at lines 99/118 and 178/198; template also constructs it; producer models declare it. | Keep analysis single/dual levels, shared `BasePlan` and every gap plan. No current strategy change; ViteApp consumers lose the named TS property. Legacy JSON must remain accepted. B, I, S. |
| **S2** | `SingleDirectionPlans.allTimeHighVwapContinuationPlan` and `AllTimeHighVwapContinuationPlan`; separate ATH continuation strategy plan. | Only ViteApp declaration; TradingData producer `models.ts:108` still declares it. Searched current `data.ts`/template yielded no direct field construction, which does not establish all older snapshots are free of it. | Keep `GapAndGoPlan.allTimeHigh`, `SymbolData.allTimeHigh`, historical-high calculation, analysis levels and active continuation tooltip. Named TS strategy plan disappears; old extra data stays loadable. B, I, S, D. |
| **S3** | Remaining `TradingPlans.tradebooksConfig`, `TradebooksConfig`, `TradebookCommonConfig`, `OpenLevelVwapConfig`, `VwapLevelOpenConfig`; includes `open_level_vwap.longOpenDrive` and `vwap_level_open.shortOpenDrive`. | ViteApp only declares these remaining shapes. TradingData `data.ts:66` and `:145`, template `:65`/`:125`, and producer `models.ts:49-79` still emit/declare the layouts and fields, including additional already-retired VWAP fields. | No active factory behavior depends on these open-drive declarations. Preserve permissive raw config loading, `defaultConfigs`, `BasePlan.planConfigs`, targets, retest settings and other analysis fields. Pushdown-fail fields/types were already removed by the other chat and are excluded. B, I, S. |

The other chat already removed bounce/fail `level_open_vwap`, short bounce/fail fields, `VwapBounceFailPlan` and its IDs. Its later pushdown-fail slice removed both `longVwapPushdownFail` fields, the shared config type initially renamed `VwapPushdownFailConfig`, and the empty `VwapOpenLevelConfig` / `vwap_open_level` shape. Do not restore any of these or take ownership of those changes. Group S is assessed against the final resulting working tree, not HEAD alone.

No live config/state document was examined, and no automatic state migration is proposed. Existing unknown-ID strings are already possible; do not introduce enum membership filtering, reset captured state or broaden fallback behavior under schema cleanup.

## Approval items U: disconnected utility/analysis files

These are optional housekeeping, not executable strategy implementations. Each has no checked-in importer, startup path, test import or direct `HybridApp` namespace assignment. Exported utility calls through private ESM tooling remain unverified. No persisted-field deletion is included. Expected application behavior change: none; deliberate imports lose that file/API. Validate B and I for each.

| Item | Exact removal and purpose | Shared dependencies explicitly retained | Additional validation |
| --- | --- | --- | --- |
| **U1** | `src/patterns/camPivots.ts`: `getPatterns`, `getPatternsForPrice`; private-in-module 0.2 near-percentage classification of open/current prices across R/S pivot bands. | Active `src/indicators/camPivots.ts`, `indicators/basicIndicators.ts`, core Camarilla/market math, `SymbolData.camPivots`, chart pivot lines and Bookmap indicator subset. | D; confirm displayed pivot values/lines unchanged. |
| **U2** | `src/patterns/allTimeHigh.ts`: `getPatterns`; flags open/closed M1 candles above the historical high. | `SymbolData.allTimeHigh`, calculation in `basicIndicators.ts`, active gap-plan `allTimeHigh` evidence and all daily market data. | D; confirm retained gap plan validation still accepts ATH evidence. |
| **U3** | `src/algorithms/strategies.ts`: only the unexported `R2Target` table of ten RRR/daily-range target values. | Active take-profit/target allocation, `SingleExitTarget`, `ExitTargets`/`ExitTargetsSet` types (do not chase their other usages here). | A; existing captured target counts/payloads unchanged. |
| **U4** | `src/tradebooks/tradebookUtil.ts`: `setButtonStatus`, only toggles active/inactive/degraded classes. | Actual tradebook enable/disable/button rendering and CSS classes. No CSS cleanup authorized. | C; current buttons and enablement unchanged. |

Other old inventory orphans (`models/atr.ts`, `ui/popup.ts`) are outside this historical-strategy proposal. Their appearance in the old audit is not approval to remove them.

## Approval items F: duplicate factory wiring

These helpers create **active** strategies; they are not retired strategy definitions. All are exported from `src/tradebooks/tradebooksManager.ts`, have no checked-in callers, and are not assigned to a whole public namespace. `createAllTradebooks` delegates to the shared factory instead. Remove only individually approved helper bodies. Keep the manager module, active enum members, construction class, event/status methods and button definitions.

For every row, expected change is loss of an unused direct ESM factory API; current `createAllTradebooks` behavior stays identical. No config/serialized state field changes. Validate B, I, A and F.

| Item | Exact removal | Retained equivalent |
| --- | --- | --- |
| **F1** | `createTradebooksForGapAndGo` (`:23`) | Core definition for `GapGiveAndGoBookmapReversal` with gap-and-go support. |
| **F2** | `createTradebooksForGapAndCrap` (`:29`) | Core offer-step-down/reappear definition with gap-and-crap resistance. |
| **F3** | `createTradebooksForGapDownAndGoDown` (`:36`) | Core short gap-down offer-step-down/reappear definition. |
| **F4** | `createTradebooksForGapDownAndGoUp` (`:42`) | Core long gap-down reversal definition. |
| **F5** | `createTradebooksForRangeBoundReversal` (`:48`) | Core bid/offer pair with normalized, nonoverlapping areas. Do not port or alter the duplicate helper's finite-number checks during deletion; core current policy is retained. |
| **F6** | Private `isDirectionEnabled` (`:19`) | No references at all; `createTradebookDefinitions` already checks enabled directions. |

Only after the final approved F subset is known may the now-unused manager `TradingPlansModels`/`TradebookID` imports be removed. Partial approval must retain imports still used by unapproved helpers. This group does not authorize simplifying the live factory or changing enabled-side/range validity semantics.

## Approval items T/D: newly found compatibility and documentation cleanup

| Item | Exact scope | Evidence and compatibility boundary | Expected change / validation |
| --- | --- | --- | --- |
| **T1 — defer / uncertain** | Futures-only compatibility remnants: `Helper.isFutures` and futures price helpers in `src/utils/helper.ts`; `TradingPlans.isFutures` and symbol selection branches in `src/models/tradingPlans/tradingPlansModels.ts` / `tradingPlans.ts`; `isFutures` parameters and explicit unsupported branches in `src/api/marketData.ts`; futures branches in `rules.ts`, `watchlist.ts`, `bookmapSocket.ts`, `chart.ts` and `streamingHandler.ts`. | The futures profile was deleted, and current market-data code rejects or returns empty for futures, but multiple runtime branches and the persisted `TradingPlans.isFutures` field remain. Symbols are recognized through a hard-coded list (`MESZ22`, `ESZ22`, `ES`, `MES`). No producer/state migration or external symbol inventory was inspected. | Do not remove yet. If later approved, first trace TradingData/Firestore persisted plans and decide whether old futures documents must remain readable. Focused validation must cover equity startup, legacy futures-shaped config loading, symbol rounding and Bookmap message filtering. No active equity behavior should change. |
| **D2 — documentation only** | Reconcile or remove stale concrete-strategy sections in `rules.md`: `GapAndCrapBookmapRejection`, `GapDownAndGoDown`, `GapDownAndGoUp`, `PremarketHighRejection`, `GapGiveAndGo`, `BookmapBigWallBreakdownFailLong`, `AllTimeHighVwapContinuation`, `OpenDrive`, `VwapContinuation`, `AboveWaterBreakout` and `EmergingStrengthBreakout`. The source paths named there are absent; only `baseTradebook.ts` and `bookmapWallReversal.ts` are concrete classes now. | `rg` confirms the listed source files do not exist and no current factory constructs those historical classes. `rules.md` is prose, not a runtime import. Shared-helper paragraphs may still describe logic retained by active modules, so do not delete the entire file without rewriting the shared section. | Documentation-only behavior change: readers stop seeing historical classes as current. Preserve active six-ID rules and shared helper facts. Validate headings/source links against the current tree and `git diff --check`; no build required unless a link-generating tool is added. |
| **D3 — documentation only** | Remove or mark stale TradeStation references in `docs/performance-improvement-tasks.md` (the `UI.setupAutoSync()` TradeStation notes at the identified lines). | TradeStation integration and auto-sync were removed in `110032e`; the document still describes them as present. | Prose-only correction. Preserve unrelated performance history and the active VWAP analysis note. Validate exact old references disappear from this document. |
| **D4 — documentation only** | Remove or mark stale `handler.trailStop` references in `docs/risk-model-1r-plan.md`. | Browser and native trailing workflows were removed in `09781e9`; the document still names the deleted handler and describes its old 10-partial assumptions. | Prose-only correction, unless the user wants the historical plan retained with an explicit archived label. Validate no current source path is presented as executable. |

## Already handled elsewhere: not an approval item here

The bounce/fail removal, now committed elsewhere as part of `7237b16`, covers `ShortVwapBounceFailed`, `GapAndCrapShortVwapBounceFailed`, `GapDownAndGoDownShortVwapBounceFailed`, V/Shift+V entry dispatch, the handler, minute-close status logging, `getStatusForVwapBounceFail`, plan/config declarations and an entry-method enum member. The concrete failed-continuation class was already deleted in `875e5b5`.

The same chat later received separate explicit authorization to remove long VWAP pushdown/fail. It removed `getStatusForVwapPushdownFail`, both `longVwapPushdownFail` fields, their shared config type and now-empty `vwap_open_level` type/layout. V1 is retained only as an already-completed inventory record; S3 now includes remaining open-drive declarations only. Both strategy removals were committed by that chat after its separate user authorization and are untouched by this review. No audit/progress document belonging to that chat is rewritten.

## Focused validation after approval

These are recipes for a later approved implementation, **not claims that this review ran implementation tests**. No new generic test framework is proposed. Use the existing scripts, sanitized inputs and recording/fake broker paths. Never load live credentials or invoke real order/Firestore mutations for these checks.

| Code | Review/check |
| --- | --- |
| **B** | `npm run build` (both headless/browser TypeScript checks and Vite); `git diff --check`. Review final approved diff and ensure both VWAP removals from `7237b16` remain intact. |
| **I** | Repeat exact symbol/import searches through source, static assets, checked-in scripts/tests and namespace assignments. Ensure only approved names vanish and six active IDs remain. Docs/history are allowed to retain retired names. Check no fixture, sibling repository or unrelated file was edited. |
| **P** | Sanitized same-day restoration with an old `submitEntryResult.tradeBookID` string and captured base plan/targets. Confirm string retention, no enum filtering, and unchanged existing missing-tradebook reload/exit behavior. `test:state` supplies general restore/config coverage, but does not by itself prove every retired-ID case. No write to real state. |
| **A** | `npm run test:direct-execution`, `npm run test:core-target-exits`, `npm run test:state`, and `npm run test:extended-execution` when H6/H7 or factory/rule changes warrant workflow coverage. Inspect retained gap add decisions around VWAP/premarket high for both sides; expected quantities, targets, accepted add state and reload/swap sequencing must match. Existing suites do not directly exercise every browser virtual branch, so inspect those branches explicitly. |
| **C** | Inspect chart price-selection and generated entry/button wiring. With fake/sanitized chart data, preserve 1st High/Low selection, current-candle/day-extreme/custom override paths and long/short rounding. No connected trading app smoke run. |
| **D** | Inspect the live `onNewPrice` -> `getChartAnalysis` -> continuation-status -> tooltip dependency. With sanitized bars, retain “no data”, testing/confirmation and consolidation output. Keep chart VWAP/Camarilla/historical-high calculations and notifications. `test:market` may be relevant only if a change unexpectedly touches their dependencies; it is not necessary for deleting an isolated scratch wrapper. |
| **S** | Feed sanitized config containing both active plans and old ignored fields through the existing config loader/validator. Confirm raw old fields remain loadable and active definitions/validation match. Check configs without the removed declared shapes also load when all active requirements are satisfied. Do not change external producers or stored documents. A declaration-only change needs no live database migration. |
| **F** | Compare `createAllTradebooks`/core definition output for all six active IDs, disabled sides, normalized reversed range boundaries and invalid/overlapping range plans. Shared `test:state` covers current core config cases; explicitly review manager construction and button IDs/labels. Core definition code must not change. |

Checked fixture generator tails: `test:state` and `test:extended-execution` use `--check`, which compares fixtures rather than writing them. Without that flag their generators write both ViteApp and Bookmap copies. Do not regenerate those files as part of this cleanup. Do not run the old audit generator, which would replace audit documents and broaden this review.

The README's mirror rule applies if a future edit actually changes shared trading decisions/contracts. This proposal confines removal to inactive browser remnants and optional declarations/wiring; it does not authorize changing `src/trading` or `bookmap-plugin`. If active/core behavior must change to implement a selected item, stop that expansion and prepare a separate concrete proposal.

## Explicit approval groups

The user may approve/reject any item code, or approve exactly one or more named groups. A blank or missing decision means **not approved**.

| Group | Exact included items | Recommendation |
| --- | --- | --- |
| **Group H — remaining historical remnants** | H6-H11 only (two alternative reversal branches/IDs, disconnected common-rule and threshold modules, two uncoupled first-high/low functions). H1-H5 are already complete in `c2e4846`. | Reasonable next cleanup. Preserve old serialized strings and all shared/live behavior as specified. |
| **Group V — selective analysis helpers** | V2-V14 only; V1 is already removed elsewhere and excluded | Optional broader helper retirement. Retain the active continuation status/API and whole modules. External ESM use remains unverified. |
| **Group U — disconnected utilities** | U1-U4 only | Optional separate housekeeping. Retain all indicators and active target/button behavior. |
| **Group F — duplicate wiring** | F1-F6 only | Optional separate factory cleanup; all six current strategies stay active. |
| **Group S — legacy declarations only** | S1-S3 only | Defer, or explicitly accept declaration-only retirement while old producer/config fields remain tolerated. Never includes producer/database edits. |
| **Group T — compatibility review** | T1 only | Defer until persisted futures-shaped config and symbol conventions are traced. No source deletion is recommended yet. |
| **Group D — documentation cleanup** | D2-D4 only | Safe prose cleanup after confirming which documents should remain historical archives. No runtime behavior change. |

“Remove inactive strategies” alone is too broad to select all groups. Request an explicit group name or item codes. No group includes the other chat's bounce/fail changes, shared gap-module deletion, extra indicators, real configuration/state cleanup, Bookmap edits, commits or deployment.

## Review checkpoint

Only this review document has been changed in the current worktree (`AM`; its earlier staged version belongs to the prior audit). This chat made no edits to application code, the other chat's progress document, old audit files, fixtures or sibling repositories. Comparison with the initial source diff/progress-file hash detected the other chat's additional authorized pushdown-fail removal; its latest turns and source were inspected to update this proposal. It then committed both removals as `7237b16` under separate explicit authorization. No live app, vendor requests, broker mutations, Firestore writes, credential provisioning, commits or deployment were started by this review. Validation: proposal scope and source references reviewed, `git diff --check`, final HEAD/status inspection and current source searches.

**Await the human user's approval of individual item codes or explicit named groups before implementing any deletion.**

## Implementation update

The user subsequently authorized removal of the unused VWAP/open-drive helpers, legacy plan/config declarations, and partial futures compatibility. The current working tree applies that scope:

- `vwapPatterns.ts` retains only the active premarket-high continuation status used by chart analysis; the open-drive scratch logic, unused continuation gates, proximity helpers and test loop are removed. The unused VWAP/open-candle/loss rule wrappers are removed from `rules.ts`.
- The obsolete `TradingPlans` futures/config fields and legacy single-direction plan declarations are removed from ViteApp types. Raw config loading remains permissive, and the no-op base `updateConfig` hook is removed.
- Futures-only profile fields, symbol matching, market-data rejection/empty branches, rounding/contract helpers, watchlist and Bookmap filters, rules exceptions, and the empty futures streaming branch are removed. Schwab/TDA equity paths and the active tradebooks remain.
- The extended execution fixture generator no longer mocks the removed futures helper API.
- `rules.md` now documents only the six factory-produced tradebooks. The performance and risk-model notes no longer claim TradeStation auto-sync or the removed trailing-stop workflow.

Validation completed: `npm run build` and `git diff --check` pass. The review scope remains limited to ViteApp; no producer repository, persisted config, broker, Firestore, fixture or deployment action was touched.
