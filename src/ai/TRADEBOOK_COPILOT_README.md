# Tradebook Copilot - AI-Powered Execution Assistant

## Problem

During live trading, it's easy to forget tradebook details - entry conditions, stop loss rules, conditions to fail, trade management instructions. The previous AI integration made an LLM call on every 1-minute candle close, which was costly, slow, and not contextually relevant.

## Design Philosophy

**Right information, right time, always visible when it matters.**

- 3 out of 4 components are rule-based (zero LLM cost)
- AI is reserved for judgment calls at critical moments
- Visual cues are persistent and adapt to live conditions
- Reminders trigger when needed, not on a fixed interval

## Components

### 1. Playbook Strip (Always Visible)

A thin bar below the topbar on each chart that always shows the relevant tradebook context.

**Pre-entry mode:** Shows all enabled tradebook names (e.g., `Active Setups: L:VWAP Cont | S:Open Flush`).

**Hover mode:** When you hover over a tradebook button in the sidebar, the strip shows that tradebook's key rules condensed into one line (stop loss, conditions to fail).

**In-position mode:** Automatically switches to show the active trade's management rules (e.g., `VWAP Cont LONG | Fail: loses VWAP | Stop: keep VWAP if tested | Trail: last bar low after 5min`).

**Implementation:** `TradebookCopilot.createTradebookStrip()` creates the DOM element. `updatePlaybookStrip()` refreshes it on each candle close. `showTradebookInStrip()` handles hover previews.

**Files:** `src/ai/tradebookCopilot.ts`, `public/mystyle.css` (`.playbookStrip*` classes)

### 2. Event-Driven AI Nudges

Replaces the every-1-minute LLM call. AI analysis triggers only at decision points:

| Trigger | When | What AI Evaluates |
|---|---|---|
| `price_near_key_level` | Price within 3% ATR of key level, VWAP, entry, or stop | Should I act at this level? |
| `position_opened` | Net quantity transitions from 0 to non-zero | Does this entry match my tradebook? Red flags? |
| `condition_to_fail_triggered` | Price loses VWAP (long) or reclaims VWAP (short) | True failure or shakeout? |
| `manual_ai_check` | User clicks AI button | Full tradebook compliance check |

**Cooldown:** 60 seconds minimum between auto-nudges per symbol (manual check bypasses cooldown).

**Output:** Focused response in chat panel (amber/gold styling to distinguish from old AI), spoken short answer via `Helper.speak()`, tooltip on chart.

**Implementation:** Event detection runs on every time-and-sales price update via `TradebookCopilot.onPriceUpdate()`, called from the time-and-sales data path in `autoTrader.ts`. This means events are detected in real time on every tick, not delayed until candle close. UI-only updates (playbook strip, checklist) still run on candle close via `TradebookCopilot.onCandleClose()`.

**Files:** `src/ai/tradebookCopilot.ts`, `src/algorithms/autoTrader.ts`

### 3. Trade Management Checklist (Left Pane Upgrade)

Upgrades the existing "Trade Management" section in the left pane with a live, interactive checklist:

```
AAPL  [VWAP Cont LONG]

CONDITIONS TO FAIL
  ✅ Price above VWAP (current: 185.20, VWAP: 184.50)
  ✅ Price above key level (current: 185.20, level: 183.00)

CONDITIONS TO EXIT
  → If price loses VWAP                     [ACTIVE - price near VWAP]
  Trail stop to last bar low after 5min

PROFIT TAKING
  Half at 1R
  → Final target: ATR extension             [ACTIVE - after 5min]

Entry: 184.00 | Stop: 183.00 | P&L/sh: 1.20 | R: 1.2
```

**Features:**
- Conditions-to-fail shown at top with live pass/fail status (green check or warning)
- Management rules highlighted when currently relevant (time-based, price-based)
- Position P&L and R-multiple always visible
- Auto-updates on each candle close

**Implementation:** `TradebookCopilot.updateTradeManagementChecklist()` replaces the old `TraderFocus.updateTradeManagementUI()`. Uses heuristic rule matching (`isRuleCurrentlyActive()`) to highlight active rules.

**Files:** `src/ai/tradebookCopilot.ts`, `public/mystyle.css` (`.copilotChecklist*`, `.checklist*` classes)

### 4. AI Check Button (Manual Trigger)

A purple "AI" button on each chart's topbar. Clicking it triggers a full tradebook compliance check via OpenAI.

**Prompt includes:** Current tradebook doc, trade management rules, position details, market data (candles, VWAP, key levels).

**Response:** Focused analysis in the chat panel + spoken short answer.

**Implementation:** `TradebookCopilot.createAiCheckButton()` creates the button during setup. Calls `manualAiCheck()` which triggers `runCopilotAnalysis()`.

**Files:** `src/ai/tradebookCopilot.ts`, `public/mystyle.css` (`.aiCheckButton`)

## Architecture

```
autoTrader.ts (time & sales, every tick)
    └── TradebookCopilot.onPriceUpdate(symbol)
            ├── checkPositionChange()        ← may trigger LLM
            ├── checkPriceNearKeyLevel()     ← may trigger LLM
            └── checkConditionsToFail()      ← may trigger LLM

autoTrader.ts (candle close)
    └── TradebookCopilot.onCandleClose(symbol)
            ├── updatePlaybookStrip()        ← rule-based, no LLM
            └── updateTradeManagementChecklist() ← rule-based, no LLM

chart.ts (tradebook button hover)
    └── TradebookCopilot.showTradebookInStrip() ← rule-based, no LLM

topbar AI button (click)
    └── TradebookCopilot.manualAiCheck()     ← triggers LLM
```

## Files Modified

| File | Change |
|---|---|
| `src/ai/tradebookCopilot.ts` | **New file** - main copilot module |
| `src/algorithms/autoTrader.ts` | Replace `Agent.testTradeAnalysis()` with `TradebookCopilot.onCandleClose()` |
| `src/main.ts` | Import and call `TradebookCopilot.setup()` |
| `src/ui/chart.ts` | Add hover events on tradebook buttons for playbook strip |
| `public/mystyle.css` | Add all copilot CSS styles |

## Configuration

The copilot is enabled by default when the app runs. The old `enableAiAgent` flag in `globalSettings.ts` is no longer used for the copilot (it still gates the old `Agent.testTradeAnalysis` path, which is now unused).

The copilot's event-driven LLM calls require a valid OpenAI API key (same as before, configured in secrets).

## Key Design Decisions

1. **Rule-based over LLM:** Most features (playbook strip, button colors, checklist) use no AI at all. They read directly from tradebook data structures that already exist.

2. **Event-driven over periodic:** Instead of calling OpenAI every minute, we detect specific events (price near level, position opened, failure condition) and only call AI when there's a genuine decision to make.

3. **Cooldown mechanism:** 60-second minimum between auto-nudges per symbol prevents AI spam during volatile price action.

4. **Backward compatible:** The old `Agent.testTradeAnalysis` code is still available but no longer called from the candle close path. The old agent.ts functions like `getMarketDataText()` are reused by the copilot.

5. **No new dependencies:** Uses existing OpenAI streaming infrastructure (`chatgpt.ts`), existing chat UI panels, and existing tradebook data structures.

---

