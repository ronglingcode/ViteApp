import type { HttpPort } from '../ports/http.ts';
import type { CredentialPort } from '../ports/credentials.ts';
import type { SocketPort, SchedulerPort } from '../ports/socket.ts';
import { SchwabOAuth } from '../libraries/broker/schwab/oauth.ts';
import { SchwabReadApi } from '../libraries/broker/schwab/readApi.ts';
import { projectAccount } from '../libraries/broker/schwab/accountProjection.ts';
import { FirestoreApi } from '../libraries/firestore/api.ts';
import { MassiveApi } from '../libraries/massive/api.ts';
import { readTradingConfig } from '../core/configuration/tradingConfig.ts';
import { TradeState, type StateObject } from '../core/state/tradeState.ts';
import { projectTradeLedger } from '../core/account/tradeLedger.ts';
import { marketTime } from '../core/marketdata/marketClock.ts';
import { startupEligibility } from '../core/marketdata/startupEligibility.ts';
import { createExecutionInputs, defaultTradingPolicy, type ManualInputs } from '../core/controllers/executionInputs.ts';
import { MarketLoader } from './marketLoader.ts';
import { MarketStreams } from './marketStreams.ts';
import type { StreamerInfo } from '../libraries/broker/schwab/streamingProtocol.ts';

export interface ExecutionPort { receive(message: StateObject): void; route(action: StateObject): boolean; close(): void }
export interface RuntimeEvents { message(message: StateObject): void; log(symbol: string, message: string): void; notify(symbol: string, message: string): void }
/** Mirrored standalone orchestration; browser rendering and Java Bookmap integration stay in adapters. */
export class TradingRuntime {
    private readonly oauth: SchwabOAuth;
    private readonly reads: SchwabReadApi;
    private readonly firestore: FirestoreApi;
    private readonly massive: MassiveApi;
    private readonly market: MarketLoader;
    private readonly key: string;
    private readonly credentials: CredentialPort;
    private readonly sockets: SocketPort;
    private readonly scheduler: SchedulerPort;
    private readonly execution: ExecutionPort;
    private readonly events: RuntimeEvents;
    private readonly now: () => number;
    private config?: ReturnType<typeof readTradingConfig>;
    private account?: ReturnType<typeof projectAccount>;
    private ledger?: ReturnType<typeof projectTradeLedger>;
    private state?: TradeState;
    private streams?: MarketStreams;
    private readonly quotes: Record<string, StateObject> = {};
    private readonly manual: Record<string, ManualInputs> = {};
    private readonly histories: Record<string, StateObject> = {};
    private readonly eligibility: Record<string, string> = {};
    private readonly dirty = new Set<string>();
    private readonly timers = new Set<() => void>();
    private stopped = false;
    private revision = 0;
    private accountReading = false;
    private accountAgain = false;
    private configReading = false;
    private tokenReading = false;
    private persistence = Promise.resolve();
    readonly policy = { ...defaultTradingPolicy };
    constructor(http: HttpPort, credentials: CredentialPort, sections: StateObject, sockets: SocketPort,
        scheduler: SchedulerPort, execution: ExecutionPort, events: RuntimeEvents,
        encodeBasic: (value: string) => string, now = Date.now) {
        this.credentials = credentials; this.sockets = sockets; this.scheduler = scheduler; this.execution = execution; this.events = events; this.now = now;
        this.oauth = new SchwabOAuth(http, credentials, encodeBasic, undefined, now);
        const authenticatedReads: HttpPort = { request: async (url, method, headers, body) => {
            let response = await http.request(url, method, headers, body);
            if (method === 'GET' && response.status === 401) response = await http.request(url, method,
                { ...headers, Authorization: `Bearer ${await this.oauth.accessToken(true)}` }, body);
            return response;
        } };
        this.reads = new SchwabReadApi(authenticatedReads);
        this.firestore = new FirestoreApi(http, sections.firebaseConfig.projectId, () => sections.firebaseConfig.apiKey ?? '');
        this.key = sections.massive?.apiKey ?? '';
        this.massive = new MassiveApi(http, () => this.key); this.market = new MarketLoader(this.massive, now);
    }
    async start() {
        try {
            if (!this.key) throw new Error('Massive API key missing from local secrets');
            const config = readTradingConfig(await this.firestore.fetchConfigData()); this.validateProfile(config.profile);
            const token = await this.oauth.accessToken(), date = marketTime(this.now()).date;
            const raw = await this.reads.getAccount(token), orders = await this.reads.getOrders(this.accountHash(), token, date);
            const account = projectAccount(raw, orders, date, symbol => this.price(symbol));
            const restored = await this.firestore.getTradingState(config.profile);
            if (this.stopped) return;
            this.config = config; this.account = account; this.ledger = projectTradeLedger(account.executions, this.policy.dailyMaxLoss);
            this.state = new TradeState(date, account.currentBalance, this.now(), restored);
            this.publishToken(); this.startStreamsAndHistory(); this.publishAccount();
            this.repeat(30000, () => { void this.refreshToken(); }); this.repeat(15000, () => { void this.refreshAccount(); });
            this.repeat(60000, () => { void this.refreshConfig(); }); this.repeat(100, () => this.publishDirty());
            this.events.log('', 'Native trading runtime started; local credentials, Firestore, Massive and Schwab');
        } catch (error) { this.failure('', 'Native startup', error); throw error; }
    }
    private validateProfile(profile: string) { if (!['schwab', 'momentumSimple'].includes(profile)) throw new Error('Native equity runtime requires schwab or momentumSimple profile'); }
    private accountHash() { const account = this.credentials.loadSchwab().accountHashValue; if (!account) throw new Error('Schwab accountHashValue missing from local secrets'); return account; }
    private price(symbol: string) { return this.market.getState(symbol)?.metrics().currentPrice ?? 0; }
    private publishToken() { if (!this.stopped) { const value = this.credentials.loadSchwab(); this.execution.receive({ type: 'execution_token', version: 3, accountHash: this.accountHash(), accessToken: value.access_token, expiresAt: value.expires_at }); } }
    async refreshToken() { if (this.stopped || this.tokenReading) return; this.tokenReading = true;
        try { await this.oauth.accessToken(); this.publishToken(); } catch (error) { this.failure('', 'Token refresh', error); } finally { this.tokenReading = false; } }
    async exchangeAuthorizationCode(callbackUrl: string) { try { await this.oauth.exchangeAuthorizationCode(callbackUrl); this.publishToken(); this.streams?.close(); this.startStreamsAndHistory(); void this.refreshAccount(); }
        catch (error) { this.failure('', 'Schwab authorization', error); } }
    private startStreamsAndHistory() {
        if (this.stopped || !this.config) return;
        const symbols = [...this.config.symbols]; symbols.forEach(symbol => { void this.loadMarket(symbol); }); let massiveReady = false;
        this.streams = new MarketStreams(this.sockets, this.scheduler, symbols, () => this.key,
            async () => { const token = await this.oauth.accessToken(); this.publishToken(); return { token, info: await this.reads.getStreamerInfo(token) as unknown as StreamerInfo }; }, {
                trade: trade => { if (this.market.acceptTrade(trade)) this.dirty.add(trade.symbol); },
                quote: quote => { Object.assign(this.quotes[quote.symbol] ??= {}, quote); this.dirty.add(quote.symbol); },
                activity: () => { void this.refreshAccount(); },
                ready: source => { if (source === 'massive') { if (massiveReady) symbols.forEach(symbol => { void this.loadMarket(symbol); }); massiveReady = true; } else void this.refreshAccount(); },
                status: (source, status) => { if (!this.stopped) this.events.log('', `${source}: ${status}`); },
            }); this.streams.start();
    }
    private async loadMarket(symbol: string) {
        const plan = this.config?.plans.find(plan => plan.symbol === symbol); if (this.stopped || !plan) return;
        this.eligibility[symbol] = 'startup eligibility pending';
        try {
            const loaded = await this.market.load(symbol, marketTime(this.now()).date, plan.marketCapInMillions, plan.vwapCorrection);
            if (this.stopped) return;
            let shares = 0; try { shares = await this.massive.getSharesOutstanding(symbol); } catch (error) { this.failure(symbol, 'Shares reference (using zero fallback)', error); }
            if (this.stopped) return;
            this.histories[symbol] = loaded.history;
            const reason = startupEligibility(plan, loaded.state.metrics().currentPrice, shares, loaded.history.premarketDollarCollection, loaded.history.dailyBars);
            this.eligibility[symbol] = reason; this.dirty.add(symbol); if (reason) this.events.notify(symbol, `Entry blocked: ${reason}`);
            this.publishInputs(symbol); this.events.message(this.view(symbol, 'market_ready'));
        } catch (error) { this.failure(symbol, 'Market history', error); }
    }
    async refreshAccount() {
        if (this.stopped) return; if (this.accountReading) { this.accountAgain = true; return; } this.accountReading = true;
        try {
            const token = await this.oauth.accessToken(), date = marketTime(this.now()).date;
            const raw = await this.reads.getAccount(token), orders = await this.reads.getOrders(this.accountHash(), token, date);
            const account = projectAccount(raw, orders, date, symbol => this.price(symbol));
            if (this.stopped) return; this.account = account; this.ledger = projectTradeLedger(account.executions, this.policy.dailyMaxLoss); this.publishToken(); this.publishAccount();
        } catch (error) { this.failure('', 'Account refresh', error); }
        finally { this.accountReading = false; if (this.accountAgain) { this.accountAgain = false; void this.refreshAccount(); } }
    }
    async refreshConfig() { if (this.stopped || this.configReading) return; this.configReading = true;
        try {
            const loaded = readTradingConfig(await this.firestore.fetchConfigData()); this.validateProfile(loaded.profile); if (this.stopped) return;
            if (loaded.profile !== this.config?.profile) throw new Error('Profile changed; restart native runtime to load its trade state');
            const restart = JSON.stringify(loaded.symbols) !== JSON.stringify(this.config.symbols); this.config = loaded;
            if (restart) { this.streams?.close(); this.startStreamsAndHistory(); } this.publishAccount();
        } catch (error) { this.failure('', 'Config refresh', error); } finally { this.configReading = false; } }
    private publishAccount() { if (!this.config || this.stopped) return; new Set([...this.config.symbols, ...Object.keys(this.account?.positions ?? {})]).forEach(symbol => { this.publishInputs(symbol); this.events.message(this.view(symbol, 'account_ready')); }); }
    private publishDirty() { const symbols = [...this.dirty]; this.dirty.clear(); if (!this.stopped) symbols.forEach(symbol => { this.publishInputs(symbol); this.events.message(this.view(symbol, 'market_update')); }); }
    view(symbol: string, type: string): StateObject { if (type === 'market_update') return { type, symbol, timestamp: this.now(), priceUnit: 'real', market: this.market.getState(symbol)?.metrics() }; return structuredClone({ type, symbol, timestamp: this.now(), priceUnit: 'real',
        plan: this.config?.plans.find(plan => plan.symbol === symbol), tradingSettings: this.config?.tradingSettings,
        account: this.account, ledger: this.ledger, state: this.state?.snapshot(), history: this.histories[symbol], market: this.market.getState(symbol)?.snapshot() }); }
    private publishInputs(symbol: string) {
        const market = this.market.getState(symbol), plan = this.config?.plans.find(plan => plan.symbol === symbol);
        if (this.stopped || !market || !plan || !this.config || !this.account || !this.ledger || !this.state) return;
        const inputs = createExecutionInputs(symbol, plan, market.snapshot(), this.quotes[symbol] ?? {}, this.account, this.ledger, this.state, this.config.symbols,
            Object.fromEntries(this.config.symbols.map(stock => [stock, { currentPrice: this.price(stock) }])), this.manual[symbol] ?? {}, this.now(), ++this.revision, this.policy);
        const reason = this.eligibility[symbol] ?? 'startup eligibility pending'; if (reason) inputs.entryContext.watchlistBlockReason = reason;
        this.execution.receive({ type: 'execution_state', version: 3, symbols: [inputs] });
    }
    dispatch(action: StateObject) { if (this.stopped) return false; this.publishInputs(action.symbol?.trim() ?? ''); return this.execution.route(action); }
    executionEvent(result: StateObject) {
        const symbol = result.symbol ?? '', plan = this.config?.plans.find(plan => plan.symbol === symbol);
        if (result.entry && this.state?.acceptEntry(symbol, result.entry, plan?.atr ?? {}, this.now())) this.persistState();
        this.events.message(structuredClone(result)); if (result.type === 'execution_result') { this.publishInputs(symbol); void this.refreshAccount(); }
    }
    persistState() { if (this.stopped || !this.state || !this.config) return; const saved = this.state.snapshot(), profile = this.config.profile;
        this.persistence = this.persistence.catch(() => {}).then(() => this.firestore.setTradingState(profile, saved)).catch(error => this.failure('', 'State persistence', error)); }
    pendingPersistence() { return this.persistence; }
    private repeat(delay: number, task: () => void) { if (this.stopped) return; const cancel = this.scheduler.after(delay, () => { this.timers.delete(cancel); if (this.stopped) return; task(); this.repeat(delay, task); }); this.timers.add(cancel); }
    private failure(symbol: string, operation: string, error: unknown) { if (this.stopped) return; const value = this.credentials.loadSchwab(); let reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        for (const secret of [value.access_token, value.refresh_token, value.accountHashValue, this.key]) if (secret) reason = reason.split(secret).join('[redacted]'); this.events.log(symbol, `${operation} failed: ${reason}`); }
    close() { this.stopped = true; this.timers.forEach(cancel => cancel()); this.timers.clear(); this.streams?.close(); this.market.close(); this.execution.close(); }
}
