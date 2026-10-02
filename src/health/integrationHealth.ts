export type HealthColor = 'healthy' | 'warning' | 'failed' | 'unknown';
export interface ReadHealth {
    lastSuccess?: number;
    lastAttempt?: number;
    pending: number;
    detail: string;
    error?: string;
    empty?: boolean;
}
export interface TradeReceipt { symbol: string; timestamp: number; receivedAt: number }
export type StreamPhase = 'connecting' | 'authenticating' | 'subscribing' | 'subscribed' | 'disconnected' | 'failed';
export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Request failed')
    .replace(/https?:\/\/\S+/gi, '[request URL]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 240);
export const ageText = (timestamp: number | undefined, now = Date.now()) => timestamp === undefined
    ? 'never' : `${Math.max(0, (now - timestamp) / 1000).toFixed(1)}s ago`;
export const maskedBalance = (balance: number) => `${balance < 0 ? '-' : ''}…${Math.abs(balance).toFixed(2).slice(-6)}`;

/** Observation only: this state never controls trading or modifies AccountCache. */
export class IntegrationHealth {
    account: ReadHealth = { pending: 0, detail: 'Not checked' };
    history: ReadHealth = { pending: 0, detail: 'Not checked' };
    balance?: number;
    cash?: number;
    positionCount?: number;
    historyLoads = new Map<string, string>();
    stream: { phase: StreamPhase; since: number; error?: string; symbols: string[]; trades: Map<string, TradeReceipt> } = {
        phase: 'disconnected', since: 0, symbols: [], trades: new Map(),
    };
    begin(read: ReadHealth, now = Date.now()) { read.pending++; read.lastAttempt = now; }
    success(read: ReadHealth, detail: string, empty = false, now = Date.now()) {
        read.pending = Math.max(0, read.pending - 1); read.lastSuccess = now;
        read.detail = detail; read.empty = empty; read.error = undefined;
    }
    fail(read: ReadHealth, error: unknown) {
        read.pending = Math.max(0, read.pending - 1); read.error = errorMessage(error);
    }
    accountSuccess(account: Record<string, any>, now = Date.now()) {
        const balances = account.currentBalances;
        const cash = balances?.cashBalance ?? balances?.cashAvailableForTrading;
        if (typeof balances?.liquidationValue !== 'number' || !Number.isFinite(balances.liquidationValue)
            || typeof cash !== 'number' || !Number.isFinite(cash)
            || (account.positions !== undefined && !Array.isArray(account.positions)))
            throw new Error('Schwab account missing valid balances or positions');
        const positions = account.positions ?? [];
        if (positions.some((p: any) => !p || typeof p.instrument?.symbol !== 'string'))
            throw new Error('Schwab account returned invalid positions');
        const equityCount = positions.filter((p: any) => p.instrument.assetType === undefined || p.instrument.assetType === 'EQUITY').length;
        this.balance = balances.liquidationValue; this.cash = cash; this.positionCount = equityCount;
        this.success(this.account, `${equityCount} positions`, false, now);
    }
    startStream(symbols: string[], now = Date.now()) {
        this.stream = { phase: 'connecting', since: now, symbols: [...symbols], trades: new Map() };
    }
    streamPhase(phase: StreamPhase, error?: string, now = Date.now()) {
        this.stream.phase = phase; this.stream.since = now; this.stream.error = error;
    }
    receiveTrades(trades: TradeReceipt[]) {
        if (this.stream.phase === 'disconnected') return;
        for (const trade of trades) {
            if (!this.stream.symbols.includes(trade.symbol) || !Number.isFinite(trade.timestamp) || trade.timestamp <= 0
                || !Number.isFinite(trade.receivedAt)) continue;
            // A new receipt can prove recovery; queued receipts from before a failure cannot.
            if (this.stream.phase === 'failed' && trade.receivedAt <= this.stream.since) continue;
            const previous = this.stream.trades.get(trade.symbol);
            // Retain the newest event time: a late/duplicate print cannot make an old feed look fresh.
            this.stream.trades.set(trade.symbol, {
                ...trade, timestamp: Math.max(previous?.timestamp ?? 0, trade.timestamp),
                receivedAt: Math.max(previous?.receivedAt ?? 0, trade.receivedAt),
            });
            this.stream.phase = 'subscribed'; this.stream.error = undefined;
        }
    }
    readView(read: ReadHealth, staleMs: number, now = Date.now()): { color: HealthColor; text: string } {
        if (read.error) return { color: 'failed', text: 'Failed' };
        if (read.lastSuccess === undefined) return { color: read.pending ? 'warning' : 'unknown', text: read.pending ? 'Checking' : 'Not checked' };
        if (now - read.lastSuccess > staleMs) return { color: 'warning', text: 'Stale' };
        if (read.empty) return { color: 'warning', text: 'No bars returned' };
        return { color: 'healthy', text: 'Connected' };
    }
    streamView(now = Date.now()): { color: HealthColor; text: string } {
        const stream = this.stream;
        if (stream.phase === 'failed') return { color: 'failed', text: 'Failed' };
        if (stream.phase === 'disconnected') return { color: 'failed', text: 'Disconnected' };
        if (!stream.symbols.length) return { color: 'warning', text: 'No symbols subscribed' };
        if (stream.phase !== 'subscribed') return { color: 'warning', text: `${stream.phase}${now - stream.since > 15000 ? ' (waiting)' : ''}` };
        const latest = [...stream.trades.values()].sort((a, b) => b.receivedAt - a.receivedAt)[0];
        if (!latest) return { color: 'warning', text: 'Waiting for trades' };
        if (now - latest.receivedAt > 15000) return { color: 'warning', text: 'No recent trades' };
        const newestTimestamp = Math.max(...[...stream.trades.values()].map(t => t.timestamp));
        if (now - newestTimestamp > 15000)
            return { color: 'warning', text: 'Delayed trades' };
        if (newestTimestamp - now > 5000) return { color: 'warning', text: 'Check local clock' };
        return { color: 'healthy', text: 'Receiving trades' };
    }
}
export const integrationHealth = new IntegrationHealth();
