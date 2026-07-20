import type * as Messages from '../workers/marketDataMessages';

let started = false;
let interval: ReturnType<typeof setInterval> | null = null;
let observer: PerformanceObserver | null = null;
let eventCount = 0;
let batchCount = 0;
let tradeCount = 0;
let quoteCount = 0;
let batchDurationMs = 0;
let maxBatchDurationMs = 0;
let quoteDurationMs = 0;
let maxQuoteDurationMs = 0;
let longTaskCount = 0;
let longTaskDurationMs = 0;
let maxDeliveryLagMs = 0;
let lastAcceptedCount = 0;
let lastRenderCount = 0;
let lastRenderDurationMs = 0;

interface TimeSaleDiagnostics {
    accepted: number;
    rendered: number;
    renderDurationMs: number;
    maxRenderDurationMs: number;
}

const getTimeSaleDiagnostics = () => (globalThis as any).timeSaleDiagnostics as TimeSaleDiagnostics | undefined;

const resetIntervalCounters = () => {
    eventCount = 0;
    batchCount = 0;
    tradeCount = 0;
    quoteCount = 0;
    batchDurationMs = 0;
    maxBatchDurationMs = 0;
    quoteDurationMs = 0;
    maxQuoteDurationMs = 0;
    longTaskCount = 0;
    longTaskDurationMs = 0;
    maxDeliveryLagMs = 0;
};

const renderSummary = () => {
    const averageBatchMs = batchCount > 0 ? batchDurationMs / batchCount : 0;
    const averageQuoteMs = quoteCount > 0 ? quoteDurationMs / quoteCount : 0;
    const diagnostics = getTimeSaleDiagnostics();
    const acceptedCount = diagnostics?.accepted ?? lastAcceptedCount;
    const renderCount = diagnostics?.rendered ?? lastRenderCount;
    const renderDuration = diagnostics?.renderDurationMs ?? lastRenderDurationMs;
    const acceptedPerSecond = acceptedCount - lastAcceptedCount;
    const rendersPerSecond = renderCount - lastRenderCount;
    const renderDurationThisSecond = renderDuration - lastRenderDurationMs;
    const averageRenderMs = rendersPerSecond > 0 ? renderDurationThisSecond / rendersPerSecond : 0;
    lastAcceptedCount = acceptedCount;
    lastRenderCount = renderCount;
    lastRenderDurationMs = renderDuration;
    const memory = (performance as any).memory;
    const heapText = memory ? ` heap=${Math.round(memory.usedJSHeapSize / 1024 / 1024)}MB` : '';
    const summary = ` | events=${eventCount}/s trades=${tradeCount}/s accepted=${acceptedPerSecond}/s quotes=${quoteCount}/s ` +
        `DB avg=${averageBatchMs.toFixed(2)}ms max=${maxBatchDurationMs.toFixed(2)}ms ` +
        `quote avg=${averageQuoteMs.toFixed(2)}ms max=${maxQuoteDurationMs.toFixed(2)}ms ` +
        `render=${rendersPerSecond}/s avg=${averageRenderMs.toFixed(2)}ms max=${(diagnostics?.maxRenderDurationMs ?? 0).toFixed(2)}ms ` +
        `lag=${maxDeliveryLagMs.toFixed(1)}ms long=${longTaskCount}/${longTaskDurationMs.toFixed(0)}ms${heapText}`;
    const element = document.getElementById('replayMetrics');
    if (element) element.textContent = summary;
    console.log(`[replay metrics]${summary}`);
    resetIntervalCounters();
};

export const start = () => {
    if (started) return;
    started = true;
    const diagnostics = getTimeSaleDiagnostics();
    lastAcceptedCount = diagnostics?.accepted ?? 0;
    lastRenderCount = diagnostics?.rendered ?? 0;
    lastRenderDurationMs = diagnostics?.renderDurationMs ?? 0;
    try {
        observer = new PerformanceObserver(list => {
            list.getEntries().forEach(entry => {
                longTaskCount++;
                longTaskDurationMs += entry.duration;
            });
        });
        observer.observe({ entryTypes: ['longtask'] });
    } catch {
        observer = null;
    }
    interval = setInterval(renderSummary, 1000);
};

export const recordMessage = (message: Messages.WorkerToMainMessage, durationMs: number) => {
    if (message.type === 'timeSaleFlush') {
        eventCount++;
        batchCount++;
        tradeCount += message.trades.length;
        batchDurationMs += durationMs;
        maxBatchDurationMs = Math.max(maxBatchDurationMs, durationMs);
    } else if (message.type === 'quote') {
        eventCount++;
        quoteCount += message.quotes.length;
        quoteDurationMs += durationMs;
        maxQuoteDurationMs = Math.max(maxQuoteDurationMs, durationMs);
    }
};

export const recordState = (message: Extract<Messages.WorkerToMainMessage, { type: 'replayState' }>) => {
    maxDeliveryLagMs = Math.max(maxDeliveryLagMs, message.deliveryLagMs ?? 0);
};

export const stop = () => {
    if (interval) clearInterval(interval);
    observer?.disconnect();
    interval = null;
    observer = null;
    started = false;
};
