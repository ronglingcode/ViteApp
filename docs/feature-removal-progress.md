# ViteApp feature removal progress

Updated: 2026-10-01.

## Current checkpoint

Selected removals complete: **VWAP bounce fail** and **VWAP pushdown fail**
strategies. The user initially requested uncommitted changes for review, then
explicitly authorized committing this work.

- ViteApp baseline verified: `a883086`; working tree clean before this document.
- Bookmap migration handoff reports `fc281d6`; its architecture/operation documents
  were read for context only. No sibling-repository changes are authorized here.
- Replay and AI/chat have already been removed. The browser execution bridge and
  native-routing flag are also already removed.

## Instructions and scope

Read `AGENTS.md`, `src/trading/README.md`, and the sibling Bookmap documents
`docs/standalone-native-trading-progress.md` and `docs/direct-broker-execution.md`.

Keep removals scoped to features selected by the user. Preserve unrelated live
trading and mirrored modules needed by retained features. Treat repositories
independently; do not change Bookmap without an authorized need. Never exercise
real broker mutations or real Firestore writes during validation. Do not read,
copy, print, or commit real secrets as part of this work.

## Initial feature/dependency inventory

| Area | Entry points and dependencies to inspect for a selected removal |
| --- | --- |
| Browser startup and exposed APIs | `src/main.ts` initializes `window.HybridApp`, chart/UI, account/token jobs, worker/vendor streams and optional Bookmap socket. Namespace exports can also be consumed by remote scripts or browser-console commands. |
| Chart/trading UI | `index.html`, `src/ui/chart.ts`, `src/ui/ui.ts`, `src/controllers/keyboardHandler.ts`, `src/controllers/traderFocus.ts`; chart-generated controls require inspection beyond static HTML. |
| Execution review/export tools | `show_execution`, `show_execution_detail`, `export_trades`, `check_quantity`, `update_account_ui`, and no-op `test_popup` listeners in `src/main.ts`; broker/tool/UI consumers differ. |
| Strategies and plans | `src/tradebooks/tradebooksManager.ts` constructs wall-reversal tradebooks through shared `core/configuration/tradingConfig.ts`; plans, sizing, entry/exit controllers and saved state are connected. |
| Broker profiles | `src/config/config.ts` selects Schwab and momentumSimple profiles; `src/api/broker.ts` dispatches Schwab broker operations. |
| Market data and indicators | `src/data/db.ts`, worker bridge, Massive/Schwab transports, chart adapters and mirrored market libraries/core; preserve data used by retained risk/eligibility rules. |
| Notifications and logging | `src/notifications`, `src/ui/notificationCenter.ts`, `src/firestore.ts`, speech/sound settings; Firestore also imports Bookmap screen logging. |
| Bookmap browser integration | `src/bookmap/bookmapSocket.ts`, startup calls, `src/firestore.ts` screen log, wall-reversal tradebooks, price normalization in `src/utils/exitOrderPairs.ts`; a folder deletion alone could break retained behavior. |
| Optional settings | `src/config/globalSettings.ts` controls left pane, Camarilla, candle visibility, notifications, worker use, Bookmap socket, wall swing pullback, core target and risk levels. A disabled setting is not proof that its dependencies are unused. |
| Mirrored domain/runtime | `src/trading/{libraries,core,runtime,ports,adapters}` feeds production browser adapters and separately tested headless runtime; mirror architecture must be considered before deleting shared code. |

`src/bookmap/README.md` still describes canvas components absent from the current
file inventory. `docs/dead-code-audit.md` contains references to already removed
bridge modules. Treat both as historical context and recheck current source
before using them to decide deletions.

## Next steps

Await another selected feature. For subsequent
removals, trace UI/callbacks/imports/globals/config/state/shared dependencies before
editing, then run the build and relevant package checks. Prefer fixture `--check`
modes; fixture generators may write into both repositories without that flag.

## Completed removal: VWAP bounce fail

The strategy was already absent from the active tradebook factory. Removed its
remaining browser behavior and exclusive declarations:

- `src/controllers/keyboardHandler.ts`: remove V/Shift+V dispatch, so the key no
  longer triggers the strategy or the used-key log/account sync path.
- `src/controllers/handler.ts`: remove the strategy entry handler and its unused
  TradebookID import (including the exposed `window.HybridApp` handler export).
- `src/algorithms/autoTrader.ts`: remove minute-close bounce-fail status logging
  and its unused TradebookID import.
- `src/algorithms/vwapPatterns.ts`: remove bounce-fail pattern detection. Other
  VWAP helpers remain; the subsequent removal below also deletes pushdown fail.
- `src/models/models.ts`: remove the bounce-fail entry-method enum member.
- `src/models/tradingPlans/tradingPlansModels.ts`: remove the bounce-fail plan,
  short config fields and now-empty config interface. The shared config
  type was initially renamed for long pushdown fail, then removed in the next slice.
- `src/tradebooks/tradebookIds.ts`: remove generic and gap-specific bounce-fail IDs.

Source searches found no remaining bounce-fail names in application source,
static UI/assets or scripts. Existing config snapshots may still contain ignored
legacy fields; no remote config/state documents were changed. Other VWAP rules,
calculation/display/notifications remain.

No changes to `src/trading` or bookmap-plugin are needed: the mirrored runtime
already treats KeyV as an unsupported no-op and has no constructed bounce-fail
strategy. Its existing no-op compatibility remains. The old dead-code audit is
historical and was not regenerated as part of this focused removal.

## Completed removal: VWAP pushdown fail

The user also selected the long pushdown-fail strategy for removal. Source searches
found only an uncalled status helper and legacy configuration types/fields, with
no active strategy class, factory entry, keyboard dispatch or mirrored implementation.

- `src/algorithms/vwapPatterns.ts`: remove `getStatusForVwapPushdownFail` and its
  pattern-detection implementation.
- `src/models/tradingPlans/tradingPlansModels.ts`: remove `VwapPushdownFailConfig`,
  both `longVwapPushdownFail` fields, and the now-empty `VwapOpenLevelConfig` plus
  its `vwap_open_level` field. Retain the long/short open-drive config declarations.
- No remaining bounce-fail or pushdown-fail matches in application source, scripts
  or static UI/assets. Existing remote snapshots are untouched; legacy fields
  are ignored. Other VWAP calculations, continuation helpers and rules remain.
- No changes to mirrored modules, fixtures or Bookmap.

## Validation

- `npm run build`: passed both headless/browser TypeScript checks and Vite build.
  Existing missing runtime `mystyle.css` and large-bundle warnings remain.
- `npm run test:direct-execution`: 5 tests passed.
- `npm run test:core-target-exits`: 6 tests passed.
- `npm run test:state`: 99 account/state/config scenarios verified, fixtures unchanged.
- `git diff --check`: passed.
- Reviewed the complete source diff; no mirrored library/runtime files changed.

After the pushdown-fail removal, reran `npm run build`, `npm run test:state` (99
scenarios), source searches and `git diff --check`; all passed. The build has only
the same existing stylesheet/bundle warnings. Earlier execution/exit test results
above apply to the bounce-fail slice; no execution/exit logic changed afterward.

No live application, vendor requests, real broker mutations, real Firestore writes
or credential provisioning was started. Commit authorized after review; no
deployment performed. The unrelated `docs/inactive-strategies-review.md` is
excluded from this commit.
