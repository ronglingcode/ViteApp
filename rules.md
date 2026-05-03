# Tradebook Rules

This document summarizes the concrete tradebook classes under `src/tradebooks`. Helper and abstract files such as `baseTradebook.ts`, `gapAndCrapBookmapShortCommon.ts`, `singleKeyLevel/commonRules.ts`, `singleKeyLevel/singleKeyLevelTradebook.ts`, and `singleKeyLevel/baseBreakoutTradebook.ts` are not listed as standalone tradebooks, but their shared rules are called out below where relevant.

## Shared Helpers

- `EntryRulesChecker.checkBasicGlobalEntryRules(...)` is used by most tradebooks. It blocks entries on daily max-loss breach, zero liquidity scale, failed early-entry gating, stop-trading-after timing, watch-level conflicts, and no-trade zones. It can also cut size for tradable-area distance checks, near-against-VWAP/open-VWAP cases, and weak post-open volume.
- `EntryRulesChecker.allowEntryRulesForGapAndCrap(...)` blocks entries after the first 5 minutes and blocks entries above premarket high.
- `singleKeyLevel/commonRules.validateCommonEntryRules(...)` enforces three shared entry rules: the entry price must be outside the key level, the trade must pass `checkBasicGlobalEntryRules(...)`, and the entry must be on the correct side of VWAP when `shouldCheckVwap` is true.
- `Rules.isTimingAndEntryAllowedForHigherTimeframe(...)` allows M1 immediately. For higher timeframes it requires either HOD/LOD breakout status or an entry that breaks at least one prior closed candle on that timeframe, with at least two closed candles available.
- `ExitRulesCheckerNew.isAllowedForSingleOrderForAllTradebooks(...)` and `isAllowedForLimitOrderForAllTradebooks(...)` are shared exit gates used by several single-key-level books. They can allow exits after 15 minutes, when oversized, when exit-pair count is already large, on shared trailing thresholds, for added positions, or when the new target meets the minimum-target rules.
- Base `Tradebook` defaults are important: partial adds are disallowed by default, while single-order limit moves, single-order stop moves, market-outs, flattening, and adjusting all exit pairs are allowed by default unless a tradebook overrides them.
- `BaseBreakoutTradebook` adds shared exit protection for `AboveWaterBreakout` and `EmergingStrengthBreakout`: after the generic exit helper it can allow exits when the key level is lost, block changes that make price worse than the key level, and constrain stop moves to the first pullback pivot or the breakout/breakdown candle.

## GapAndCrapBookmapBidWallBreakdown

- Source: `src/tradebooks/gapAndCrapBookmapBidWallBreakdown.ts`
- Entry rules: requires `allowEntryRulesForGapAndCrap(...)`, then `checkBasicGlobalEntryRules(...)`. Manual entry also requires a custom stop from the chart; Bookmap-triggered entry uses the supplied stop.
- Sizing rules: accepted size is quartered (`allowedSize / 4`).
- Add rules: delegates to `GapAndCrapAlgo.getAllowedReasonToAddPartial(...)`, which only allows adds when the add price is below current VWAP.
- Exit rules: no custom exit restrictions; base `Tradebook` defaults apply.

## GapAndCrapBookmapRejection

- Source: `src/tradebooks/gapAndCrapBookmapRejection.ts`
- Entry rules: uses the shared `runGapAndCrapBookmapShortEntryPipeline(...)`, so it applies `allowEntryRulesForGapAndCrap(...)` and `checkBasicGlobalEntryRules(...)`. Stop-out is always the current high of day.
- Sizing rules: applies a risk multiplier of `0.15` for `wall reject 0.15R` and `0.25` for `wall reject 0.25R`.
- Add rules: delegates to `GapAndCrapAlgo.getAllowedReasonToAddPartial(...)`, so adds are only allowed below VWAP.
- Exit rules: no custom exit restrictions; base `Tradebook` defaults apply.

## GapAndGoBookmapOfferWallBreakout

- Source: `src/tradebooks/gapAndGoBookmapOfferWallBreakout.ts`
- Entry rules: this book is effectively Bookmap-only because `triggerEntry(...)` is disabled. In `triggerEntryCommon(...)`, if `basePlan.mustOpenAboveVwap` is set, the open price must be at or above the last VWAP before open. It then applies `checkBasicGlobalEntryRules(...)`.
- Sizing rules: accepted size is quartered (`allowedSize / 4`).
- Add rules: partial adds are only allowed once the add price is at or above premarket high.
- Exit rules: no custom exit restrictions; base `Tradebook` defaults apply.

## GapDownAndGoDownBookmapBidWallBreakdown

- Source: `src/tradebooks/gapDownAndGoDownBookmapBidWallBreakdown.ts`
- Entry rules: applies `checkBasicGlobalEntryRules(...)`. Manual entry also requires a custom stop from the chart; Bookmap-triggered entry uses the supplied stop.
- Sizing rules: accepted size is quartered (`allowedSize / 4`).
- Add rules: explicitly disallows adds.
- Exit rules: no custom exit restrictions; base `Tradebook` defaults apply.

## GapDownAndGoDown

- Source: `src/tradebooks/gapDownAndGoDown.ts`
- Plan-validation rule: `hasAtLeastOneReasonSet(...)` requires at least one of `nearBelowConsolidationRange`, `nearBelowConsolidationRangeTop`, `buyersTrappedBelowThisLevel`, or `previousInsideDay`.
- Entry rules: `validateEntry(...)` only applies `checkBasicGlobalEntryRules(...)`.
- Risk rules: default risk level comes from `Models.chooseRiskLevel(...)`; the `HOD` entry method forces the risk level to the exact high of day.
- Add rules: no override, so base `Tradebook` default applies and adds are disallowed.
- Exit rules: no custom exit restrictions; base `Tradebook` defaults apply.

## GapDownAndGoUp

- Source: `src/tradebooks/gapDownAndGoUp.ts`
- Plan-validation rule: `hasAtLeastOneReasonSet(...)` requires `nearAboveSupport` or `nearAboveKeyEventLevel`.
- Entry rules: if the plan has support levels, the entry cannot be below the first support's `low`. If the entry is below VWAP, the code also uses the first support plus `0.5 * ATR` as a distance cap; entries above that cap are blocked.
- Shared entry rules: after the support checks it applies `checkBasicGlobalEntryRules(...)`.
- Sizing rules: below-VWAP entries that pass validation are cut to half size.
- Risk rules: default risk level comes from `Models.chooseRiskLevel(...)`; the `LOD` entry method forces the risk level to the exact low of day.
- Add rules: no override, so adds are disallowed by the base `Tradebook`.
- Exit rules: no custom exit restrictions; base `Tradebook` defaults apply.

## PremarketHighRejection

- Source: `src/tradebooks/premarketHighRejection.ts`
- Plan-validation rule: `hasAtLeastOneReasonSet(...)` requires at least one of `heavySupplyZoneDays`, `recentRallyWithoutPullback`, `extendedGapUpInAtr`, `earnings`, `topEdgeOfCurrentRange`, or `nearBelowPreviousEventKeyLevel`.
- Entry rules: if `aboveThisLevelNoMoreShort` is set, entry must stay at or below that level. If `belowThisLevelOnlyVwapContinuation` is set, entries are blocked when they are still above VWAP but already below that threshold. It also requires `allowEntryRulesForGapAndCrap(...)` and then `checkBasicGlobalEntryRules(...)`.
- Sizing rules: entries above VWAP are cut to half size.
- Risk rules: default risk level comes from `Models.chooseRiskLevel(...)`; the `HOD` entry method forces the risk level to the exact high of day.
- Add rules: partial adds are only allowed when the add price is below current VWAP.
- Exit rules: no custom exit restrictions; base `Tradebook` defaults apply.

## GapGiveAndGo

- Source: `src/tradebooks/gapGiveAndGo.ts`
- Plan-validation rule: `hasAtLeastOneReasonSet(...)` requires at least one of `nearAboveConsolidationRange`, `nearBelowConsolidationRangeTop`, `nearPreviousKeyEventLevel`, `previousInsideDay`, or `allTimeHigh`.
- Entry rules: entry must stay above `basePlan.support.low`. If the stock opened below pre-open VWAP and later reclaimed it, the setup is abandoned when the last two M1 closes both fall back below that VWAP.
- Shared entry rules: after the local checks it applies `checkBasicGlobalEntryRules(...)`.
- Sizing rules: if the entry is below VWAP, the trade is only allowed when it is not too extended from support; accepted below-VWAP entries are cut to half size.
- Risk rules: default risk level comes from `Models.chooseRiskLevel(...)`; the `LOD` entry method forces the risk level to the exact low of day.
- Add rules: no override, so adds are disallowed by the base `Tradebook`.
- Exit rules: no custom exit restrictions; base `Tradebook` defaults apply.

## BookmapBigWallBreakdownFailLong

- Source: `src/tradebooks/bookmapBigWallBreakdownFailLong.ts`
- Entry rules: the entry price must already be at or above `basePlan.bigWallLevel`, then the trade must pass `checkBasicGlobalEntryRules(...)`.
- Risk rules: stop-out comes from `Chart.getStopLossPrice(...)`, and risk level comes from `Models.chooseRiskLevel(...)`.
- Add rules: no override, so adds are disallowed by the base `Tradebook`.
- Exit rules: no custom exit restrictions; base `Tradebook` defaults apply.

## AllTimeHighVwapContinuation

- Source: `src/tradebooks/allTimeHighVwapContinuation.ts`
- Entry rules: an entry method is required. The selected timeframe is blocked if it already has two consecutive candles against VWAP or two consecutive candles against the all-time-high level.
- Price-location rules: the entry must be above current VWAP and above the configured all-time high.
- Higher-timeframe rule: it requires `Rules.isTimingAndEntryAllowedForHigherTimeframe(...)`.
- Shared entry rules: after the local checks it applies `checkBasicGlobalEntryRules(...)`.
- Warning-only checks: the file logs but does not block when price has not touched VWAP yet or when high of day has not yet exceeded the configured all-time high.
- Add rules: no override, so adds are disallowed by the base `Tradebook`.
- Exit rules: no custom exit restrictions; base `Tradebook` defaults apply.

## OpenDrive

- Source: `src/tradebooks/singleKeyLevel/openDrive.ts`
- Entry rules: an entry method is required. `VwapPatterns.getStatusForOpenDrive(...)` must return a status starting with `good` or `2 consecutive weak momentum candles`; any other status blocks the trade.
- Sizing rules: a `good` status uses full size, `2 consecutive weak momentum candles` uses half size. During the first minute after open, if there is no reversal move since open, size is also cut to half.
- Threshold rule: the entry price must clear at least one candle that is already beyond the key level.
- Shared entry rules: after the local checks it applies `validateCommonEntryRules(...)`, which means the entry must be outside the key level, must pass `checkBasicGlobalEntryRules(...)`, and must be on the correct side of VWAP.
- Add rules: no override, so adds are disallowed by the base `Tradebook`.
- Exit rules: if the key level has not been retested yet, limit moves, stop moves, and market-outs are allowed early. Otherwise the tradebook falls back to `ExitRulesCheckerNew(...)`, `hasLostKeyLevel(...)`, `isPriceWorseThanKeyLevel(...)`, and then pullback or breakout-candle stop constraints. `adjustAllExitPairs` and `flatten` are always allowed here.

## VwapContinuation

- Source: `src/tradebooks/singleKeyLevel/vwapContinuation.ts`
- Entry rules: an entry method is required. Two consecutive candles against VWAP on the selected timeframe do not block the trade, but they cut the final size to half.
- Warning-state rule: when the most recent M1 close is on the wrong side of VWAP, the tradebook raises a warning and degrades UI state, but it does not hard-block `triggerEntry(...)`.
- Threshold and structure rules: if VWAP has moved to the other side of the key level, the tradebook treats the setup like an above-water/below-water breakout and requires the entry to already be beyond the key level. Otherwise it runs `EntryThresholdValidator.validateEntryThreshold(...)`, whose current active rule is simply that the entry cannot be inside the key level.
- Higher-timeframe rule: it requires `Rules.isTimingAndEntryAllowedForHigherTimeframe(...)`.
- Gap-and-crap helper rule: the current implementation always calls `allowEntryRulesForGapAndCrap(...)`, so every `VwapContinuation` entry is also subject to the first-5-minutes and below-premarket-high checks.
- Shared entry rules: after the local checks it applies `validateCommonEntryRules(...)`.
- Add rules: partial adds are only allowed below current VWAP.
- Exit rules: limit moves, stop moves, and market-outs first consult `ExitRulesCheckerNew(...)`; even then, actions near VWAP alignment are blocked by `VwapPatterns.isNearAlignWithVwap(...)`. `flatten` and `adjustAllExitPairs` are allowed by default, except they are also blocked near VWAP alignment.

## VwapContinuationFailed

- Source: `src/tradebooks/singleKeyLevel/vwapContinuationFailed.ts`
- Entry rules: an entry method is required. `Closed Candle` waits for the specific fail pattern (`pushing down from vwap` for long, `bouncing off vwap` for short). `Live Candle` skips that wait-for-close rule. `M5/M15/M30 NewHighLow` require the entry to break both a prior candle and VWAP on that timeframe.
- Momentum rule: `Rules.isReverseOfMomentumCandle(...)` blocks market orders that are against the current candle's momentum.
- VWAP-side check: the code logs and speaks when the entry is on the wrong side of VWAP, but it does not hard-block on that condition.
- Shared entry rules: after the local checks it applies `validateCommonEntryRules(...)`.
- Add rules: no override, so adds are disallowed by the base `Tradebook`.
- Exit rules: limit moves, stop moves, and market-outs first consult `ExitRulesCheckerNew(...)`; if that does not allow the action, losing VWAP via `Patterns.isPriceWorseThanVwap(...)` can allow the exit. `flatten` and `adjustAllExitPairs` use base `Tradebook` defaults.

## AboveWaterBreakout

- Source: `src/tradebooks/singleKeyLevel/aboveWaterBreakout.ts`
- Entry rules: an entry method is required. If the chosen timeframe has two consecutive candles back through the level after a close beyond the level, entry is blocked.
- Pattern-routing rules: after `Patterns.analyzeBreakoutPatterns(...)`, the book chooses one of several paths: closed-beyond-level with no retest, closed-beyond-level with retest that touched the level, closed-beyond-level with retest that did not touch the level, closed-within-level reclaim/new-high logic, live no-close bull/bear-flag logic, or the within-level fallback.
- Config-gated rules: `allowCloseWithin` is required for the closed-within-level reclaim/new-high paths. `waitForClose` must be false before the no-close flag paths are allowed.
- Shared entry rules: every path eventually routes into `validateCommonEntryRules(...)`.
- Add rules: no override, so adds are disallowed by the base `Tradebook`.
- Exit rules: inherits `BaseBreakoutTradebook` exit rules: shared exit-helper checks first, then lost-key-level handling, worse-than-key-level blocking, and pullback or breakout-candle stop constraints. `flatten` and `adjustAllExitPairs` use base `Tradebook` defaults.

## EmergingStrengthBreakout

- Source: `src/tradebooks/singleKeyLevel/emergingStrengthBreakout.ts`
- Entry rules: an entry method is required. If the chosen timeframe has two consecutive candles back through the level after a close beyond the level, entry is blocked.
- Pattern-routing rules: unlike `AboveWaterBreakout`, this book requires a candle to have already closed beyond the level. Once that happens, it only routes through the closed-beyond-level paths: no retest, retest touched level, or retest did not touch level.
- Blocking rule: if no candle has closed beyond the level yet, the trade is rejected immediately.
- Shared entry rules: the selected path ultimately routes into `validateCommonEntryRules(...)`.
- Add rules: no override, so adds are disallowed by the base `Tradebook`.
- Exit rules: inherits `BaseBreakoutTradebook` exit rules: shared exit-helper checks first, then lost-key-level handling, worse-than-key-level blocking, and pullback or breakout-candle stop constraints. `flatten` and `adjustAllExitPairs` use base `Tradebook` defaults.
