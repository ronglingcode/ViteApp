# Bookmap wall-break remnants: removal proposal

Reviewed 2026-10-01 against HEAD `7237b16415502a64e5c76a4a02ace5aeac27a925`.
**Status: W1-W5 and D1 implemented and validated; human authorized commit.**

The dispatch instruction authorizes investigation and this document only. After
approval, implement only the selected items and leave changes uncommitted for
code review. Recheck HEAD/status/references first because other chats share the
checkout. Do not interpret another chat's approval as approval here.

## Starting state and evidence

- Startup status: only untracked `docs/inactive-strategies-review.md`, owned by
  another chat. It was consulted read-only; its H1-H5 overlap this proposal but
  confer no authority to delete. Its other groups are outside this scope.
- Read workspace/repository `AGENTS.md`, root README, `src/trading/README.md`
  and `src/bookmap/README.md`.
- `35849e7aaded647c270da6156db32f11254cb9bd` (`remove bookmap wall break`)
  deleted the complete 290-line `src/tradebooks/bookmapWallBreak.ts`. Its parent
  version recognized the four IDs below and used W5 to track pullback extrema
  and select a stop. The class and its local tracking state are already absent.
  No reconstruction or port is proposed.
- Exact-name and broader wall-break searches covered tracked source, static
  assets, scripts/tests, fixtures and documentation. An additional hidden,
  no-ignore filename-only search, excluding dependencies, Git, builds and
  secrets, found only the two candidate source files, `rules.md`, and the other
  review document. Current tracked application matches are declaration-only.
- Current `createTradebookDefinitions` in
  `src/trading/core/configuration/tradingConfig.ts:4` creates six reversal IDs;
  `src/tradebooks/tradebooksManager.ts:83` constructs `BookmapWallReversal` from
  these definitions. Neither constructs a wall-break ID.
- `main.ts:45-82` exposes several namespaces through `window.HybridApp`, but
  does not expose `TradebookID`, `tradebooksManager` or `GlobalSettings` as whole
  namespaces. No checked-in reflective lookup or dynamic import of these
  candidate declarations was found. `public/startup.js` initializes globals
  without exposing them.
- `index.html:10` loads TradingData `watchlist/recentData.js`. A read-only HTTP
  fetch returned 200 and 241 characters at review time; none of the five
  candidate names, `TradebookID`, `globalSettings`, `import(`,
  `document.createElement` or `getScript` occurred. The script was not executed
  or saved. This is a snapshot, not proof about future deployments or private
  console tooling. Local TradingData exact-name searches also found no matches;
  no producer or sibling-repository file was modified.
- Live Firestore/configuration/state and private secret/console scripts were
  not inspected. No app startup, broker action, live order, Firestore mutation,
  deployment, staging or commit was performed.

## Per-item application proposal

Each item is separately approvable. W1-W4 remove only the named enum member and
its matching string initializer in `src/tradebooks/tradebookIds.ts`; these are
string enum members, so removal cannot renumber retained IDs. Remove the empty
`// Gap & Go` comment if W1 leaves it with no member. No other enum cleanup.

| Item | Exact file/symbol and historical purpose | Evidence of inactivity | Shared dependencies retained and compatibility | Validation after approval |
| --- | --- | --- | --- | --- |
| W1 | `src/tradebooks/tradebookIds.ts:3`, `TradebookID.GapAndGoBookmapOfferWallBreakout`; long offer-wall breakout | Declaration only; deleted class used it; absent from current factory, tests, scripts and static assets | Keep `GapGiveAndGoBookmapReversal`, gap-and-go support/plan evidence, ATH data and all entry/add/exit helpers. External direct enum consumers lose this member; saved strings remain loadable. | Build, exact references, all-six factory review, sanitized old-ID restoration |
| W2 | Same file `:9`, `TradebookID.GapAndCrapBookmapBidWallBreakdown`; short bid-wall breakdown | Same declaration-only evidence | Keep `GapAndCrapOfferStepDownReappear`, its resistance plan and `gapAndCrapAlgo` below-VWAP add rule. Same external enum/saved-string boundary as W1. | Same as W1 |
| W3 | Same file `:14`, `TradebookID.GapDownAndGoDownBookmapBidWallBreakdown`; gap-down short bid-wall breakdown | Same declaration-only evidence | Keep `GapDownAndGoDownOfferStepDownReappear`, resistance and `gapDownAndGoDownAlgo` below-VWAP add rule. Same compatibility boundary. | Same as W1 |
| W4 | Same file `:19`, `TradebookID.GapDownAndGoUpBookmapOfferWallBreakout`; gap-down long offer-wall breakout | Same declaration-only evidence | Keep `GapDownAndGoUpBookmapReversal`, support and `gapDownAndGoUpAlgo` premarket-high add rule. Same compatibility boundary. | Same as W1 |
| W5 | `src/config/globalSettings.ts:35-36`, `enableBookmapWallBreakSwingPullback` plus its one-line comment; disabled swing-pullback tracking/stop option | Only current reference is its `false` declaration; historical consumers were inside the deleted class | Keep every other flag, shared chart entry/stop selection, swing/candle helpers, price normalization, sizing and indicators. External direct ESM imports lose the named export; this is not a stored config-field deletion. | Build and repeat references/namespace checks |

Expected active application behavior change for W1-W5: none. The current factory
already cannot produce the historical strategies. No helper has been verified
exclusive and remaining to remove; the old class's tracking implementation was
local and is already gone. Do not follow historical imports into general cleanup.

## Optional documentation item

**D1**: remove only these three obsolete sections from `rules.md`:

- `## GapAndCrapBookmapBidWallBreakdown`, currently lines 15-23.
- `## GapAndGoBookmapOfferWallBreakout`, currently lines 31-38.
- `## GapDownAndGoDownBookmapBidWallBreakdown`, currently lines 40-47.

They refer to absent pre-consolidation class files and describe old rules as
current concrete tradebooks. No corresponding fourth wall-break section exists.
Deleting these sections avoids presenting retired strategies as current. It
removes historical prose only; Git history and this proposal retain the audit
trail. Preserve adjacent rejection/gap-down sections and the rest of `rules.md`,
even where broader documentation may also be old. Validation: review section
boundaries, search remaining candidate mentions and `git diff --check`.

## Retained behavior and compatibility boundary

Preserve these six active IDs, their construction, buttons and rules:

| Active ID | Factory input |
| --- | --- |
| `GapGiveAndGoBookmapReversal` | long gap-and-go support |
| `GapDownAndGoUpBookmapReversal` | long gap-down/go-up support |
| `GapAndCrapOfferStepDownReappear` | short gap-and-crap resistance |
| `GapDownAndGoDownOfferStepDownReappear` | short gap-down/go-down resistance |
| `RangeBoundBidReversal` | range-bound support |
| `RangeBoundOfferReversal` | range-bound resistance |

Keep `bookmapWallReversal.ts`, `tradebooksManager.ts`, `baseTradebook.ts`, core
configuration/libraries/runtime, the four gap algorithm modules, support/resistance
policies, shared entry/add/exit rules, captured plans/targets, risk sizing,
market data/indicators and all Bookmap integration unchanged. Also keep the
alternate `GapAndCrapBreakdownBidSwingLow` and
`GapDownAndGoDownBreakdownBidSwingLow` identifiers and branches. Open-drive,
VWAP continuation/pushdown-failure diagnostics, range reversals and generic
dead-code cleanup are excluded. Preserve the separately approved VWAP removals
already committed in `7237b16` and any subsequent unrelated work.

Persisted trade identity is `SubmitEntryResult.tradeBookID: string` in
`src/models/models.ts:1868`. `src/firestore.ts:161` restores nested state without
enum filtering, and `src/models/tradingState.ts:86` retains same-day state.
`TradeState` in `src/trading/core/state/tradeState.ts` clones raw restored state.
Removing enum members must not rewrite or reject historical ID strings, remove
captured plans, reset state or introduce membership validation.

`getTradebookByID` already looks up a string in the current tradebook map. Old IDs
already have no constructed entry. Keep existing missing-tradebook behavior in
`handler.ts:543` (reload rules) and `exitRulesCheckerNew.ts` (shared core-target
checks followed by existing fallback) exactly as it is. Removal does not make
an old saved strategy executable and must not alter its current fallback.

`models/tradingPlans/tradingPlans.ts:90` and core `readTradingConfig` retain raw
plan objects, and Firestore codecs preserve arbitrary fields. No config schema,
unknown-field handling, stored state, producer, protocol or remote configuration
change is needed. Direct private ESM consumers remain an unverified compatibility
risk even though checked-in callers and browser namespace exposures are absent.

## Validation and resume checklist

After explicit approval, record the approved item codes here before application
edits and recheck status/HEAD and exact-name references. Apply selected items
only; preserve others' changes without reverting, staging or committing them.

1. Run `npm run build` (headless TypeScript, browser TypeScript and Vite) and
   `git diff --check`. No dev/preview/live application validation.
2. Repeat source/static/test/script/namespace searches. Only approved application
   names disappear; documentation/history may intentionally retain names.
   Review unchanged six-definition factory, manager construction and active IDs.
3. Run `npm run test:state` in its existing `--check` mode for config/captured-state
   coverage. Never invoke fixture generators without `--check`, because they can
   write sibling Bookmap fixtures. No fixture regeneration is proposed.
4. For W1-W4, use an ephemeral offline check with sanitized same-day state for
   each retired ID through `TradeState` and the pure Firestore codecs. Assert
   unchanged string, captured plan and targets. This supplements `test:state`,
   which does not specifically cover every retired ID. Inspect browser restore
   and missing-tradebook branches; do not import/start connected browser modules.
5. Review final diff for the selected declarations/comment and optional D1 only,
   plus this progress document. No mirrored trading or execution logic is
   changed, so broader execution suites/Java changes are unnecessary unless a
   newly discovered dependency requires a separate proposal.

Review-time validation: reference/history/compatibility inspection and
`git diff --check` passed. Implementation results are recorded below.

## Approval checkpoint

Recommended application scope: **W1-W5** (two source files). Optional prose
scope: **D1** (`rules.md`). This is narrower than Group H in the separate review;
approval here never includes that group's H6-H11 or other groups.

Human decision on 2026-10-01: **approved W1-W5 and D1**, with the explicit
message "approve W1-W5 and also D1". Implementation is authorized for those
items only. Leave changes uncommitted for review; staging, commit, deployment
and any broader cleanup remain outside this approval.

Pre-edit checkpoint: HEAD remains `7237b16`; only the two review documents are
untracked. Candidate references still match the proposal. No concurrent source
changes were found.

## Implementation results — 2026-10-01

- W1-W4: removed exactly the four enum members and the now-empty Gap & Go
  category comment from `src/tradebooks/tradebookIds.ts`. The six active IDs and
  two alternate swing-low reversal IDs remain.
- W5: removed only the unused swing-pullback flag and its explanatory comment
  from `src/config/globalSettings.ts`.
- D1: removed only the three approved obsolete sections from `rules.md`.
- Tracked diff: three files, 33 deleted lines. No factory, strategy class,
  shared helper, state/config loader, execution rule or Bookmap integration edit.
- `npm run build`: passed both TypeScript checks and Vite production build.
  Vite reported a runtime-resolved `mystyle.css` reference and a chunk above
  500 kB; neither blocked the build, and neither was expanded into this scope.
- `npm run test:state`: passed all 99 production account/state/config scenarios
  with `--check`; no fixture regeneration.
- Ephemeral stdin-only offline Node check: passed pure Firestore codec
  round-trip and same-day `TradeState` restoration for all four retired IDs,
  asserting exact ID, captured plan, targets and complete restored state.
  Confirmed all six current factory IDs and long/short directions. No new test
  file or persistent test artifact was added.
- Exact-name source/static/script/test/rules searches found no remaining
  candidate references. Historical mentions remain in review documents.
- Final diff inspection and `git diff --check` passed. HEAD stayed at
  `7237b16415502a64e5c76a4a02ace5aeac27a925`; nothing staged or committed.
- The unrelated `docs/inactive-strategies-review.md` retained SHA256
  `ED785A2BAF026619D9B118FA3953B7D02217614798CAEDB534A6978B1FA24C25`.
  No sibling repository, secrets or remote configuration edits. No live trading,
  broker orders, connected app startup or Firestore writes used for validation.

Implementation is complete for the approved scope. After the uncommitted review
checkpoint above, the user explicitly requested "commit this work" on 2026-10-01.
This authorizes committing only the three changed application/rules files and
this progress document. Keep the unrelated inactive-strategies review document
outside the commit. No push or deployment was requested.
