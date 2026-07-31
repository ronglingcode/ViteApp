# Notification Engine

## Purpose

The notification engine evaluates trading conditions on every live
time-and-sales price update and after account state refreshes. When a rule
triggers, the app displays a dismissible notification, optionally plays a
warning tone, optionally speaks the rule's message, and writes an informational
Firestore log.

The engine is intentionally small so additional notification rules can share
dispatch and reload protection without introducing a separate state-management
system.

## Runtime Flow

```text
time-and-sales price
        |
        v
AutoTrader.onNewTimeAndSalesData()
        |
        v
NotificationEngine.onPriceTick(symbol, price)
        |
        v
each registered NotificationRule.evaluate()
        |
        v
state update ------> optional sessionStorage persistence
        |
        v
optional notification
        |
        +--> visual notification center
        +--> optional AudioHelper warning tone
        +--> optional speech synthesis
        +--> Firestore information log
```

The live integration point is
`src/algorithms/autoTrader.ts`. The engine also listens for the existing
per-symbol account refresh event so a just-reconciled fill is evaluated using
the latest price. It does not scan historical candles during startup.

## Files

| File | Responsibility |
| --- | --- |
| `src/notifications/types.ts` | Shared rule, result, and notification contracts |
| `src/notifications/notificationEngine.ts` | Rule registration, evaluation, state persistence, and account-refresh handling |
| `src/notifications/notificationDispatcher.ts` | Visual, sound, speech, and Firestore delivery |
| `src/notifications/rules/` | One file per notification condition |
| `src/ui/notificationCenter.ts` | Dismissible on-screen notifications |
| `src/utils/audioHelper.ts` | Reusable Web Audio warning tone |
| `src/config/globalSettings.ts` | Global delivery and per-rule enable flags |
| `src/algorithms/autoTrader.ts` | Calls the engine for each live price |

## Rule Contract

Every rule implements `NotificationRule<State>`:

```ts
interface NotificationRule<State> {
    id: string;
    createInitialState: () => State;
    evaluate: (
        symbol: string,
        currentPrice: number,
        state: State,
    ) => NotificationRuleResult<State>;
}

interface NotificationRuleResult<State> {
    state: State;
    notification?: TradingNotification;
    persist?: boolean;
}
```

- `id` must be unique and stable. It is part of the persistence key. Changing
  it intentionally gives the rule a fresh persisted state.
- `createInitialState` returns the state used when the browser has no saved
  state for this rule and symbol.
- `evaluate` is synchronous and runs on every price update.
- `state` is always returned, even when nothing happens.
- `notification` is returned only for a tick that should produce sound.
- `persist: true` saves the returned state to `sessionStorage`.

Rules read existing application state directly from `Models`, `TradingState`,
or another established model module. Do not build a parallel notification
context that copies the same state.

## State and Deduplication

The engine keeps state in memory under:

```text
<rule id>:<symbol>
```

When state is not in memory, it restores it from:

```text
tradingscripts.notification.<rule id>:<symbol>
```

`sessionStorage` survives a page reload in the same browser tab. It does not
survive closing the tab, which is appropriate for intraday notification state.

For a once-per-position rule:

1. Build a stable position key from the current open position's first fill.
2. Store the key after alerting.
3. Compare the current position key with the alerted key on every later tick.
4. Set `persist: true` when either a new position is recognized or the alert is
   fired.

Do not use the latest add as the key unless the rule is intentionally designed
to re-arm on every add.

## Current VWAP-Touch Rule

`src/notifications/rules/firstTouchToVwap.ts` handles both sides:

- A long whose first entry is below VWAP alerts on the first live price at or
  above the current VWAP.
- A short whose first entry is above VWAP alerts on the first live price at or
  below the current VWAP.

The rule:

- Uses the earliest fill of the current open trade to identify the position.
- Uses the matching `BreakoutTradeState.entryPrice`, with the first-fill price
  as a fallback.
- Compares the entry price with VWAP at or immediately before the first fill.
- Requires an actual VWAP touch or cross; there is no ATR approach buffer.
- Persists `alertedPositionKey`, so the same open position alerts only once,
  including after a page reload.
- Does not re-arm when the position is added to.
- Re-evaluates after account refreshes to cover delayed broker position state.
- Does not perform historical hydration.

The notification includes the entry price, entry VWAP, touch price, and current
VWAP. At most five notifications remain visible; each can be dismissed
independently.

## Adding a Rule

### 1. Add an enable flag

Add one rule-level flag to `notificationSettings` when the rule needs to be
independently disabled:

```ts
export const notificationSettings = {
    enabled: true,
    soundEnabled: true,
    speechEnabled: true,
    firstTouchToVwap: {
        enabled: true,
    },
    exampleRule: {
        enabled: true,
    },
};
```

Tone and speech do not need separate flags unless the product behavior
explicitly requires independent control.

### 2. Implement the rule

Create `src/notifications/rules/exampleRule.ts`:

```ts
import * as GlobalSettings from '../../config/globalSettings';
import * as Models from '../../models/models';
import type {
    NotificationRule,
    NotificationRuleResult,
} from '../types';

interface ExampleRuleState {
    alertedEventKey?: string;
}

const ruleId = 'example-rule';

const evaluate = (
    symbol: string,
    currentPrice: number,
    state: ExampleRuleState,
): NotificationRuleResult<ExampleRuleState> => {
    if (!GlobalSettings.notificationSettings.exampleRule.enabled) {
        return { state };
    }

    const eventKey = 'build-from-the-event-being-tracked';
    const conditionIsMet =
        Models.getPositionNetQuantity(symbol) !== 0 && currentPrice > 0;
    const alreadyAlerted = state.alertedEventKey === eventKey;

    if (!conditionIsMet || alreadyAlerted) {
        return { state };
    }

    const nextState = {
        ...state,
        alertedEventKey: eventKey,
    };
    return {
        state: nextState,
        persist: true,
        notification: {
            id: `${ruleId}:${symbol}:${eventKey}`,
            ruleId,
            symbol,
            title: `${symbol} example notification`,
            message: `${symbol} example notification`,
            speechMessage: `${symbol}, example notification`,
            severity: 'info',
            occurredAt: Date.now(),
        },
    };
};

export const exampleRule: NotificationRule<ExampleRuleState> = {
    id: ruleId,
    createInitialState: () => ({}),
    evaluate,
};
```

The event key must come from stable domain data such as a first-fill timestamp,
order ID, candle time, or setup ID. Do not generate it from the current wall
clock during evaluation.

### 3. Register the rule

Import the rule in `notificationEngine.ts` and add it to `rules`:

```ts
const rules: NotificationRule<any>[] = [
    firstTouchToVwapRule,
    exampleRule,
];
```

No other startup or UI integration is required. The existing `onPriceTick()`
call evaluates every registered rule, and the shared dispatcher handles all
delivery channels.

## Rule-Author Checklist

- The rule ID is unique and stable.
- The rule reads canonical model state instead of copying it into a new
  context.
- Long and short behavior is considered explicitly when the condition is
  directional.
- Boundary comparisons match the intended event. For a real touch, use
  `>= level` from below or `<= level` from above.
- The deduplication key represents exactly what may alert once.
- Every state transition that must survive reload sets `persist: true`.
- Repeated ticks after a trigger return no notification.
- Missing positions, fills, VWAP data, or prices fail safely without sound.
- Notification text includes the symbol and a concise action-oriented message.
- The rule has no UI side effects and does not place or change orders.

## Validation

Run:

```bash
npx tsc --noEmit
npm run build
```

For a once-per-position directional rule, manually verify:

1. An ineligible entry does not alert.
2. An eligible long alerts on the upward boundary touch.
3. An eligible short alerts on the downward boundary touch.
4. Further ticks around or through the boundary do not alert again.
5. Reloading the page does not repeat the alert for the same open position.
6. Closing and opening a new position creates a new eligible event key.
7. Adding to the same open position does not create a new event key unless
   that is an explicit requirement of the rule.
