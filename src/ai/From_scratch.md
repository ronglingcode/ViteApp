# From-Scratch Architecture: AI-Powered Trading Bot

If we were to build a new trading bot from scratch with AI at the core, here's the ideal architecture.

## Core Insight

The AI shouldn't be a bolt-on that "analyzes" after the fact. It should be the **central nervous system** — but as a **layered system**, not a single LLM call.

## Three-Layer AI Stack

```
┌─────────────────────────────────────────────────────┐
│                    LAYER 3: LLM                     │
│         Judgment calls, ambiguous situations         │
│            (slow, expensive, on-demand)              │
├─────────────────────────────────────────────────────┤
│                  LAYER 2: RULES ENGINE              │
│       Tradebook rules as executable code/config      │
│          (fast, deterministic, always-on)             │
├─────────────────────────────────────────────────────┤
│                LAYER 1: EVENT STREAM                │
│         Market data → normalized events              │
│           (real-time, sub-millisecond)                │
└─────────────────────────────────────────────────────┘
```

Most trading bots make the mistake of trying to do everything in Layer 3 (LLM). The right approach is to make Layer 2 the workhorse and only escalate to Layer 3 when Layer 2 can't decide.

## Layer 1: Event Stream

Everything in the system is an **event**. Not just candle closes — everything.

```
Market Events:
  - price_tick(symbol, price, volume, timestamp)
  - candle_close(symbol, timeframe, OHLCV)
  - vwap_cross(symbol, direction)
  - level_touch(symbol, level_name, price)
  - volume_spike(symbol, magnitude)
  - spread_widen(symbol, spread)

Position Events:
  - order_submitted(symbol, side, type, price, qty)
  - order_filled(symbol, price, qty)
  - partial_exit(symbol, price, qty, remaining)
  - stop_hit(symbol, price)
  - target_hit(symbol, price, R_multiple)

Derived Events (computed from market events):
  - setup_forming(symbol, tradebook, conditions_met[])
  - setup_ready(symbol, tradebook)
  - setup_invalidated(symbol, tradebook, reason)
  - management_rule_activated(symbol, rule, context)
  - risk_threshold_reached(symbol, metric, value)
```

**Key design:** The event stream is a pub/sub bus. Every component subscribes to events it cares about. This decouples market data ingestion from decision-making.

**Tech choice:** In-browser, a simple `EventEmitter` or `BroadcastChannel` is fine. If you want multi-process (e.g., separate data worker), use `SharedArrayBuffer` or WebSocket to a local Node process.

## Layer 2: Rules Engine (the core)

Instead of tradebooks being classes with hardcoded `refreshState()` methods, **tradebooks become declarative rule definitions**.

```typescript
interface TradebookRule {
  id: string;
  condition: EventCondition;    // when to evaluate
  evaluate: (context: MarketContext) => RuleResult;
  action: RuleAction;           // what to do when triggered
  priority: number;             // higher = evaluated first
  phase: 'pre_entry' | 'entry' | 'management' | 'exit';
}

interface EventCondition {
  events: string[];             // which events trigger evaluation
  throttle_ms?: number;         // min time between evaluations
  requires_position?: boolean;  // only when in a position
}

type RuleResult =
  | { type: 'pass' }
  | { type: 'alert', message: string, severity: 'info' | 'warn' | 'critical' }
  | { type: 'action', action: TradeAction }
  | { type: 'escalate_to_llm', context: string }  // ← this is the key
```

### Example: VWAP Continuation tradebook as rules

```typescript
const vwapContinuationLong: TradebookRule[] = [
  // PRE-ENTRY RULES
  {
    id: 'vc_long_setup_check',
    phase: 'pre_entry',
    condition: { events: ['candle_close', 'vwap_cross'] },
    evaluate: (ctx) => {
      if (ctx.openPrice > ctx.vwap && ctx.vwap > ctx.keyLevel) {
        return { type: 'alert', message: 'VWAP Cont Long setup valid', severity: 'info' };
      }
      return { type: 'pass' };
    },
    action: { type: 'update_button', state: 'active' },
    priority: 10,
  },
  {
    id: 'vc_long_primed',
    phase: 'pre_entry',
    condition: { events: ['price_tick'], throttle_ms: 1000 },
    evaluate: (ctx) => {
      let distToBreakout = ctx.highOfDay - ctx.price;
      if (distToBreakout > 0 && distToBreakout < ctx.atr * 0.02) {
        return { type: 'alert', message: 'Breakout imminent', severity: 'warn' };
      }
      return { type: 'pass' };
    },
    action: { type: 'update_button', state: 'primed' },
    priority: 20,
  },

  // MANAGEMENT RULES
  {
    id: 'vc_long_vwap_test',
    phase: 'management',
    condition: { events: ['level_touch'], requires_position: true },
    evaluate: (ctx) => {
      if (ctx.levelName === 'vwap' && ctx.position.isLong) {
        return {
          type: 'alert',
          message: 'Testing VWAP - do NOT tighten stop, keep VWAP as stop',
          severity: 'critical'
        };
      }
      return { type: 'pass' };
    },
    action: { type: 'show_reminder' },
    priority: 30,
  },
  {
    id: 'vc_long_lost_vwap',
    phase: 'exit',
    condition: { events: ['vwap_cross'], requires_position: true },
    evaluate: (ctx) => {
      if (ctx.crossDirection === 'below' && ctx.position.isLong) {
        // This is ambiguous — is it a true fail or shakeout?
        return {
          type: 'escalate_to_llm',
          context: 'Price crossed below VWAP. Shakeout or real failure?'
        };
      }
      return { type: 'pass' };
    },
    action: { type: 'alert_and_ask' },
    priority: 50,
  },
];
```

**The critical insight:** most rules return `pass` or `alert`. Only the genuinely ambiguous ones return `escalate_to_llm`. This is how you keep LLM costs near zero while still getting AI help exactly when you need it.

### Rule Engine Runner

```typescript
class RulesEngine {
  private rules: Map<string, TradebookRule[]> = new Map();
  private eventBus: EventBus;

  onEvent(event: TradingEvent) {
    let applicableRules = this.getApplicableRules(event);

    // Sort by priority, evaluate in order
    for (let rule of applicableRules) {
      let context = this.buildContext(event.symbol);
      let result = rule.evaluate(context);

      switch (result.type) {
        case 'pass': continue;
        case 'alert': this.ui.showAlert(result); break;
        case 'action': this.executor.execute(result.action); break;
        case 'escalate_to_llm':
          this.llmLayer.analyze(event.symbol, result.context, context);
          break;
      }
    }
  }
}
```

## Layer 3: LLM (judgment layer)

The LLM is only called when Layer 2 explicitly escalates. It receives a **focused, narrow question** — not "analyze this trade."

```typescript
class LLMLayer {
  async analyze(symbol: string, question: string, context: MarketContext) {
    let prompt = `
      You are evaluating ONE specific situation during a live trade.

      Tradebook: ${context.tradebookDoc}
      Position: ${context.positionSummary}
      Question: ${question}
      Recent price action: ${context.last5Candles}

      Answer in 1-2 sentences. Be definitive.
      Say "hold", "exit", or "tighten stop" — not "consider".
    `;
    // ... call OpenAI with focused prompt
  }
}
```

**Why this is better:**
- The LLM gets a specific question, not "analyze everything"
- Context is minimal and focused (saves tokens, faster response)
- The trader gets an answer in 2-3 seconds, not 10+
- Costs drop from ~$0.05/min to ~$0.05/event (maybe 3-5 events per trade)

## System Architecture Diagram

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Broker API  │    │  Market Data │    │  Tradebook   │
│  (Schwab)    │    │  (Massive)   │    │  Config      │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────┐
│                    EVENT BUS                         │
│  market events, position events, derived events      │
└──────┬──────────────┬───────────────────┬───────────┘
       │              │                   │
       ▼              ▼                   ▼
┌────────────┐ ┌─────────────┐  ┌─────────────────┐
│  Derived   │ │   Rules     │  │  State Manager  │
│  Event     │ │   Engine    │  │  (positions,    │
│  Generator │ │  (Layer 2)  │  │   P&L, risk)    │
│            │ │             │  │                 │
│ vwap_cross │ │ evaluate()  │  │                 │
│ level_touch│ │ escalate()  │  │                 │
│ vol_spike  │ │             │  │                 │
└────────────┘ └──────┬──────┘  └─────────────────┘
                      │
              ┌───────┴────────┐
              │                │
     alert/action        escalate
              │                │
              ▼                ▼
       ┌────────────┐  ┌─────────────┐
       │     UI     │  │  LLM Layer  │
       │            │  │  (Layer 3)  │
       │ • Strip    │  │             │
       │ • Buttons  │  │  OpenAI     │
       │ • Checklist│  │  focused Q  │
       │ • Chart    │  │             │
       │ • Alerts   │  └──────┬──────┘
       │            │         │
       │  ◄─────────┼─────────┘
       └────────────┘
```

## Comparison: Current Codebase vs From-Scratch

| Current | From Scratch |
|---|---|
| Tradebooks are classes with imperative logic | Tradebooks are declarative rule sets (data, not code) |
| State scattered across window globals | Centralized state store with event-driven updates |
| AI calls every minute regardless | AI calls only on escalation from rules engine |
| Button colors updated in each tradebook's `refreshState()` | Button states are UI projections of rule evaluation results |
| Trade management shown as static text | Trade management is a live checklist driven by rule status |
| Market data flows directly to chart updates | Market data flows to event bus → derived events → rules → UI |
| Hard to add new tradebooks (copy-paste class) | New tradebook = new JSON/config rule set |

## The Declarative Tradebook Advantage

The biggest win: **tradebooks become data, not code.**

```json
{
  "name": "VWAP Continuation Long",
  "setup": {
    "require": ["open > vwap", "vwap > key_level"],
    "entry_trigger": "breakout_above_high_of_day",
    "stop_loss": "low_of_day"
  },
  "management": [
    { "rule": "if tested vwap, keep vwap as stop", "events": ["level_touch:vwap"] },
    { "rule": "trail to last bar low after 5min", "after_minutes": 5 }
  ],
  "fail_conditions": ["price < vwap"],
  "targets": ["1R", "2R", "ATR_extension"]
}
```

This means:
- The LLM can read the same config the rules engine uses (no doc duplication)
- New tradebooks can be created without writing TypeScript
- The rules engine interprets the config at runtime
- Testing a tradebook = testing a config file, not a class hierarchy

## Summary

The key architectural principle: **make the computer do what computers are good at (rules, speed, consistency) and make the AI do what AI is good at (judgment under ambiguity).** Don't ask the LLM "what should I do" every minute. Ask the rules engine every tick, and only escalate to the LLM when the rules engine says "I don't know."
