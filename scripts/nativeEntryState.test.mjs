import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const coreState = {};
const coreSource = readFileSync(new URL('../src/trading/core/state/tradeState.ts', import.meta.url), 'utf8');
new Function('exports', ts.transpileModule(coreSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(coreState);

test('accepted adds preserve the active trade even if refreshed account state changes', async () => {
    // Exercise the actual tradingState export with only its browser/storage dependencies replaced.
    const source = readFileSync(new URL('../src/models/tradingState.ts', import.meta.url), 'utf8');
    let writes = 0;
    const mocks = {
        '../trading/core/state/tradeState.ts': coreState,
        '../firestore': { setTradingState: () => { writes++; } },
        './models': { BreakoutTradeStatus: { None: 'None', Pending: 'Pending' },
            getPositionNetQuantity: () => 0, getAtr: () => ({ average: 1 }) },
        'firebase/firestore': { Timestamp: { now: () => ({ seconds: 1 }) } },
    };
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
    const exported = {};
    new Function('require', 'exports', compiled.outputText)(id => mocks[id] ?? {}, exported);
    const state = exported.getBreakoutTradeState('AAPL', true);
    state.entryPrice = 9.5; state.initialQuantity = 1000;
    state.plan.coreTarget = 12; state.plan.coreCount = 5; state.stopTightenPhase = 'needs_tighten';
    await exported.onNativeEntryAccepted('AAPL', { preserveExistingTrade: true, isLong: true });
    assert.strictEqual(exported.getBreakoutTradeState('AAPL', true), state);
    assert.equal(state.entryPrice, 9.5); assert.equal(state.initialQuantity, 1000);
    assert.equal(state.plan.coreTarget, 12); assert.equal(state.plan.coreCount, 5);
    assert.equal(state.stopTightenPhase, 'needs_tighten'); assert.equal(writes, 0);
});
