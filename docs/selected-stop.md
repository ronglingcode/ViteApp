# Fresh stop selection for every entry

Hover the stop price and press **Z**, then use the normal entry button or key
within 30 seconds. A thin **Stop** line appears on the chart. No extra panel
or dialog is required. Z prepares only the next entry; it does not adjust the
protection or invalidation of existing shares.

Each opening action needs a fresh selection, including fixed-share entries,
adds and partial reloads, opposite-direction entries, and swaps that re-enter.
The selection is consumed before opening-side effects. Missing, expired,
wrong-symbol or wrong-side stops block the action. Submission also checks the
captured permission and exact selected stop, preventing duplicate use.

Space, Cancel Entry, changing the active chart symbol, expiry, or reloading the
app clears the selection and its line. Selected stops are not persisted. After
a rejected entry attempt, select again. Existing exits and the exit-only swap
branch remain available without selecting a stop.

Sizing uses the selected level as the risk reference. The protective stop uses
that exact cent-rounded level, without the previous extra one-cent stop offset.
An accepted pending entry retains its stop: automatic stop widening is disabled.
A stop is a trigger, not a guaranteed fill price.

Verification:

```powershell
node --experimental-strip-types --test src/trading/core/controllers/selectedStop.test.ts src/trading/runtime/tradingRuntime.test.ts
npm run test:direct-execution
npm run test:extended-execution
npm run build
```

The extended browser fixtures describe post-selection order construction;
freshness and single-use permissions are tested separately. The Java plugin
keeps its existing target-allocation fixtures, which differ from the browser's;
the browser generator must not overwrite them. This change aligns stop selection
and protection without changing either application's target policy.
