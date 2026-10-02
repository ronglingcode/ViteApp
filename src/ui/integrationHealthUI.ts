import { integrationHealth as health, ageText, maskedBalance } from '../health/integrationHealth.ts';
import * as SchwabApi from '../api/schwab/api';
import { massiveApi } from '../trading/adapters/browserMarket.ts';
import { marketTime } from '../trading/core/marketdata/marketClock.ts';

let ready = false;
let checking: Promise<void> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
const currency = (value: number | undefined) => value === undefined ? 'unavailable' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const dateText = (value: number | undefined) => value === undefined ? 'never' : new Date(value).toLocaleTimeString();
const readDetails = (read: typeof health.account, now: number) => [
    `Last success: ${dateText(read.lastSuccess)} (${ageText(read.lastSuccess, now)})`,
    read.pending ? 'Request in progress' : '', read.error ? `Error: ${read.error}` : '',
].filter(Boolean);

export function renderIntegrationHealth(now = Date.now()) {
    const paint = (id: string, color: string, title: string, detail: string[]) => {
        const node = document.getElementById(id);
        if (!node) return;
        node.className = color;
        const summary = node.querySelector('summary');
        const body = node.querySelector('.healthDetail');
        if (summary && summary.textContent !== title) summary.textContent = title;
        if (body) body.textContent = detail.filter(Boolean).join('\n');
    };
    const account = health.readView(health.account, 90000, now);
    paint('health-account', account.color,
        `Schwab account · ${account.text}${health.balance === undefined ? '' : ` · balance ${maskedBalance(health.balance)}`} · ${ageText(health.account.lastSuccess, now)}`,
        [...readDetails(health.account, now), `Account balance (liquidation value): ${currency(health.balance)}`,
            `Cash: ${currency(health.cash)}`, `Positions: ${health.positionCount ?? 'unavailable'}`]);
    const history = health.readView(health.history, 180000, now);
    const incompleteLoads = [...health.historyLoads].filter(([, status]) => status !== 'Loaded');
    const chartStatus = incompleteLoads.some(([, status]) => status !== 'Loading') ? 'Chart load issue' : 'Charts loading';
    paint('health-history', incompleteLoads.length && history.color === 'healthy' ? 'warning' : history.color,
        `Massive history · ${incompleteLoads.length && history.color === 'healthy' ? chartStatus : history.text} · ${ageText(health.history.lastSuccess, now)}`,
        [...readDetails(health.history, now), health.history.detail,
            ...[...health.historyLoads].map(([symbol, status]) => `${symbol} chart: ${status}`)]);
    const stream = health.streamView(now);
    const latest = [...health.stream.trades.values()].sort((a, b) => b.receivedAt - a.receivedAt)[0];
    paint('health-stream', stream.color,
        `Massive trades · ${stream.text}${latest ? ` · received ${ageText(latest.receivedAt, now)}` : ''}`,
        [`Socket/subscription: ${health.stream.phase}`, health.stream.error ? `Error: ${health.stream.error}` : '',
            `Last receipt: ${dateText(latest?.receivedAt)}`, `Trade timestamp: ${dateText(latest?.timestamp)} (${ageText(latest?.timestamp, now)})`,
            ...health.stream.symbols.map(symbol => {
                const trade = health.stream.trades.get(symbol);
                return `${symbol}: received ${ageText(trade?.receivedAt, now)}, trade ${ageText(trade?.timestamp, now)}`;
            }), 'Quiet symbols and closed sessions may produce no trades. No recent trades does not prove a disconnect.']);
}

async function runChecks(force: boolean) {
    if (!ready) return;
    const now = Date.now();
    const checks: Promise<unknown>[] = [];
    if (!health.account.pending && (force || now - (health.account.lastAttempt ?? 0) >= 30000))
        checks.push(SchwabApi.checkAccountConnection());
    if (!health.history.pending && (force || now - (health.history.lastAttempt ?? 0) >= 60000))
        // Completed daily bars avoid the empty current-session result on quiet days/weekends.
        checks.push(massiveApi.getDailyCandlesForLastNDays('SPY', 10, marketTime(now).date));
    await Promise.allSettled(checks);
}

export function checkIntegrationsNow(force = false) {
    if (checking) return checking;
    const button = document.getElementById('check_api_health') as HTMLButtonElement | null;
    if (button) button.disabled = true;
    checking = runChecks(force).finally(() => {
        checking = undefined;
        if (button) button.disabled = !ready;
        renderIntegrationHealth();
    });
    return checking;
}

export function startIntegrationChecks() {
    ready = true;
    const button = document.getElementById('check_api_health') as HTMLButtonElement | null;
    if (button) button.disabled = false;
    void checkIntegrationsNow();
}

export function initializeIntegrationHealthUI() {
    if (timer) return;
    const button = document.getElementById('check_api_health') as HTMLButtonElement | null;
    if (button) {
        button.disabled = true;
        button.addEventListener('click', () => { void checkIntegrationsNow(true); });
    }
    renderIntegrationHealth();
    timer = setInterval(() => { renderIntegrationHealth(); if (ready) void checkIntegrationsNow(); }, 1000);
    window.addEventListener('beforeunload', () => { if (timer) clearInterval(timer); });
}
