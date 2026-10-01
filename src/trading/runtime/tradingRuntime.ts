import type { HttpPort } from '../ports/http.ts';
import type { CredentialPort } from '../ports/credentials.ts';
import type { SocketPort, SchedulerPort } from '../ports/socket.ts';
import { SchwabOAuth } from '../libraries/broker/schwab/oauth.ts';
import { SchwabReadApi } from '../libraries/broker/schwab/readApi.ts';
import { projectAccount } from '../libraries/broker/schwab/accountProjection.ts';
import type { AccountOrder } from '../libraries/broker/schwab/accountProjection.ts';
import { FirestoreApi } from '../libraries/firestore/api.ts';
import { MassiveApi } from '../libraries/massive/api.ts';
import { readTradingConfig } from '../core/configuration/tradingConfig.ts';
import { TradeState, dateLabel, type StateObject } from '../core/state/tradeState.ts';
import { sortedExitPairs, positionRisk, nativeViews } from '../core/controllers/nativeViews.ts';
import { LogRepository } from '../libraries/firestore/logRepository.ts';
import { stopDiscipline, pendingStopRefresh, firstVwapTouch } from '../core/controllers/workflows.ts';
import { projectTradeLedger } from '../core/account/tradeLedger.ts';
import { marketTime } from '../core/marketdata/marketClock.ts';
import { startupEligibility } from '../core/marketdata/startupEligibility.ts';
import { createExecutionInputs, defaultTradingPolicy, type ManualInputs } from '../core/controllers/executionInputs.ts';
import { MarketLoader } from './marketLoader.ts';
import { MarketStreams } from './marketStreams.ts';
import type { StreamerInfo } from '../libraries/broker/schwab/streamingProtocol.ts';

export interface ExecutionPort { receive(message: StateObject): void; route(action: StateObject): boolean; unregister?(symbol: string): void; close(): void }
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
    private readonly sink: RuntimeEvents;
    private auditFailed = false;
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
    private readonly pendingReplacements: Record<string, string> = {};
    private readonly reminders: Record<string, number> = {};
    private readonly entryWarnings: Record<string, number> = {};
    private readonly dirty = new Set<string>();
    private readonly accountSymbols = new Set<string>();
    private readonly timers = new Set<() => void>();
    private stopped = false;
    private revision = 0;
    private accountReading = false;
    private accountAgain = false;
    private configReading = false;
    private tokenReading = false;
    private nextAccountRead = 0;
    private accountRetry?: () => void;
    private persistence = Promise.resolve();
    readonly policy = { ...defaultTradingPolicy };
    constructor(http: HttpPort, credentials: CredentialPort, sections: StateObject, sockets: SocketPort,
        scheduler: SchedulerPort, execution: ExecutionPort, events: RuntimeEvents,
        encodeBasic: (value: string) => string, now = Date.now) {
        this.credentials = credentials; this.sockets = sockets; this.scheduler = scheduler; this.execution = execution; this.now = now; this.sink = events;
        this.events = { message: value => events.message(value), log: (symbol, text) => { events.log(symbol, text); this.audit('log', symbol, text); }, notify: (symbol, text) => { events.notify(symbol, text); this.audit('notification', symbol, text); } };
        this.oauth = new SchwabOAuth(http, credentials, encodeBasic, undefined, now);
        const authenticatedReads: HttpPort = { request: async (url, method, headers, body) => {
            let response = await http.request(url, method, headers, body);
            if (method === 'GET' && response.status === 401) response = await http.request(url, method,
                { ...headers, Authorization: `Bearer ${await this.oauth.accessToken(true)}` }, body);
            if (method === 'GET' && response.status === 429) { const header = Object.entries(response.headers ?? {}).find(([key]) => key.toLowerCase() === 'retry-after')?.[1], seconds = Number(header);
                this.nextAccountRead = Math.max(this.nextAccountRead, this.now() + (header && Number.isFinite(seconds) ? Math.max(3000, seconds * 1000) : 60000)); }
            if (method !== 'GET' && new URL(url).pathname.includes('/orders')) this.audit('order', '', { method, status: response.status, ...(body ? { order: JSON.parse(body) } : {}) });
            return response;
        } };
        this.reads = new SchwabReadApi(authenticatedReads);
        this.firestore = new FirestoreApi(http, sections.firebaseConfig.projectId, () => sections.firebaseConfig.apiKey ?? '');
        this.key = sections.massive?.apiKey ?? '';
        this.massive = new MassiveApi(http, () => this.key); this.market = new MarketLoader(this.massive, now);
        if (typeof sections.tradingPolicy?.coreTargetEnabled === 'boolean') this.policy.coreTargetEnabled = sections.tradingPolicy.coreTargetEnabled;
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
            this.repeat(1000, () => this.pendingJobs()); this.repeat(20000, () => this.disciplineJobs());
            this.events.log('', 'Native trading runtime started; local credentials, Firestore, Massive and Schwab');
        } catch (error) { this.failure('', 'Native startup', error); throw error; }
    }
    private validateProfile(profile: string) { if (!['schwab', 'momentumSimple'].includes(profile)) throw new Error('Native equity runtime requires schwab or momentumSimple profile'); }
    private selectedPlan(symbol: string) { return this.config?.symbols.includes(symbol) ? this.config.plans.find(plan => plan.symbol === symbol) : undefined; }
    private accountHash() { const account = this.credentials.loadSchwab().accountHashValue; if (!account) throw new Error('Schwab accountHashValue missing from local secrets'); return account; }
    private price(symbol: string) { const price = this.market.getState(symbol)?.metrics().currentPrice ?? 0, quote = this.quotes[symbol] ?? {}; return price > 0 ? price : quote.bidPrice > 0 && quote.askPrice > 0 ? (quote.bidPrice + quote.askPrice) / 2 : Math.max(quote.bidPrice ?? 0, quote.askPrice ?? 0); }
    private publishToken() { if (!this.stopped) { const value = this.credentials.loadSchwab(); this.execution.receive({ type: 'execution_token', version: 3, accountHash: this.accountHash(), accessToken: value.access_token, expiresAt: value.expires_at }); } }
    async refreshToken() { if (this.stopped || this.tokenReading) return; this.tokenReading = true;
        try { await this.oauth.accessToken(); this.publishToken(); } catch (error) { this.failure('', 'Token refresh', error); } finally { this.tokenReading = false; } }
    async exchangeAuthorizationCode(callbackUrl: string) { if (this.stopped) return; try { await this.oauth.exchangeAuthorizationCode(callbackUrl); if (this.stopped) return; this.events.log('', 'Schwab authorization saved locally'); if (!this.config || !this.state) { await this.start(); return; } this.publishToken(); this.streams?.close(); this.startStreamsAndHistory(); void this.refreshAccount(); }
        catch (error) { this.failure('', 'Schwab authorization', error); } }
    authorizationUrl() { return this.oauth.authorizationUrl(); }
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
        const plan = this.selectedPlan(symbol); if (this.stopped || !plan) return;
        this.eligibility[symbol] = 'startup eligibility pending';
        try {
            const loaded = await this.market.load(symbol, marketTime(this.now()).date, plan.marketCapInMillions, plan.vwapCorrection);
            if (this.stopped) return;
            let shares = 0; try { shares = await this.massive.getSharesOutstanding(symbol); } catch (error) { this.failure(symbol, 'Shares reference (using zero fallback)', error); }
            if (this.stopped) return;
            if (!this.selectedPlan(symbol) || loaded.state.snapshot().date !== marketTime(this.now()).date) return;
            this.histories[symbol] = loaded.history;
            this.histories[symbol].sharesOutstanding = shares;
            const reason = startupEligibility(plan, loaded.state.metrics().currentPrice, shares, loaded.history.premarketDollarCollection, loaded.history.dailyBars);
            this.eligibility[symbol] = reason; this.dirty.add(symbol); if (reason) this.events.notify(symbol, `Entry blocked: ${reason}`);
            this.publishInputs(symbol); this.events.message(this.view(symbol, 'market_ready'));
        } catch (error) { this.failure(symbol, 'Market history', error); }
    }
    async refreshAccount() {
        if (this.stopped) return;
        const delay = this.nextAccountRead - this.now(); if (delay > 0) { this.accountRetry ??= this.scheduler.after(delay, () => { this.accountRetry = undefined; void this.refreshAccount(); }); return; }
        if (this.accountReading) { this.accountAgain = true; return; } this.accountReading = true; this.nextAccountRead = this.now() + 3000;
        try {
            const token = await this.oauth.accessToken(), date = marketTime(this.now()).date;
            const raw = await this.reads.getAccount(token), orders = await this.reads.getOrders(this.accountHash(), token, date);
            const account = projectAccount(raw, orders, date, symbol => this.price(symbol));
            if (this.stopped) return; this.account = account; this.ledger = projectTradeLedger(account.executions, this.policy.dailyMaxLoss); this.publishToken(); this.publishAccount(); this.disciplineJobs(); this.accountNotifications();
        } catch (error) { this.failure('', 'Account refresh', error); this.accountAgain = true; }
        finally { this.accountReading = false; if (this.accountAgain) { this.accountAgain = false; void this.refreshAccount(); } }
    }
    async refreshConfig() { if (this.stopped || this.configReading) return; this.configReading = true;
        try {
            const loaded = readTradingConfig(await this.firestore.fetchConfigData()); this.validateProfile(loaded.profile); if (this.stopped) return;
            if (loaded.profile !== this.config?.profile) throw new Error('Profile changed; restart native runtime to load its trade state');
            const date = marketTime(this.now()).date, rollover = ![date, dateLabel(date)].includes(this.state!.snapshot().date);
            const restored = rollover ? await this.firestore.getTradingState(loaded.profile) : null;
            if (this.stopped) return;
            const restart = rollover || JSON.stringify(loaded.symbols) !== JSON.stringify(this.config.symbols);
            const removed = this.config.symbols.filter(symbol => !loaded.symbols.includes(symbol)); this.config = loaded;
            if (rollover) for (const symbol of loaded.symbols) this.market.forget(symbol);
            for (const symbol of removed) { this.execution.unregister?.(symbol); this.market.forget(symbol); delete this.histories[symbol]; delete this.eligibility[symbol]; delete this.manual[symbol]; this.events.message(this.view(symbol, 'account_ready')); }
            if (rollover) { this.state = new TradeState(date, this.account!.currentBalance, this.now(), restored); for (const values of [this.histories, this.eligibility, this.pendingReplacements, this.reminders, this.entryWarnings]) for (const key of Object.keys(values)) delete values[key]; }
            for (const symbol of loaded.symbols) { const history = this.histories[symbol], plan = loaded.plans.find(plan => plan.symbol === symbol)!;
                if (history) this.eligibility[symbol] = startupEligibility(plan, this.price(symbol), history.sharesOutstanding, history.premarketDollarCollection, history.dailyBars); }
            if (restart) { this.streams?.close(); this.startStreamsAndHistory(); } this.publishAccount();
        } catch (error) { this.failure('', 'Config refresh', error); } finally { this.configReading = false; } }
    private publishAccount() { if (!this.config || this.stopped) return; this.config.symbols.forEach(symbol => this.accountSymbols.add(symbol)); for (const values of [this.account?.positions, this.account?.entryOrders, this.account?.exitPairs, this.account?.executions]) Object.keys(values ?? {}).forEach(symbol => this.accountSymbols.add(symbol)); this.accountSymbols.forEach(symbol => { this.publishInputs(symbol); this.events.message(this.view(symbol, 'account_ready')); }); }
    private publishDirty() { const symbols = [...this.dirty]; this.dirty.clear(); if (!this.stopped) symbols.forEach(symbol => { this.events.message(this.view(symbol, 'market_update')); this.priceNotifications(symbol); }); }
    view(symbol: string, type: string): StateObject { if (type === 'market_update') return { type, symbol, timestamp: this.now(), priceUnit: 'real', market: this.market.getState(symbol)?.metrics() }; return structuredClone({ type, symbol, timestamp: this.now(), priceUnit: 'real',
        plan: this.selectedPlan(symbol), tradingSettings: this.config?.tradingSettings,
        policy: this.policy, account: this.account, ledger: this.ledger, state: this.state?.snapshot(), history: this.histories[symbol], market: this.market.getState(symbol)?.snapshot() }); }
    private publishInputs(symbol: string) {
        const market = this.market.getState(symbol), plan = this.selectedPlan(symbol);
        if (this.stopped || !this.config || !this.account || !this.ledger || !this.state) return;
        if (!market || !plan) { this.execution.receive({ type: 'execution_state', version: 3, symbols: [this.exitInputs(symbol)] }); return; }
        const inputs = createExecutionInputs(symbol, plan, market.snapshot(), this.quotes[symbol] ?? {}, this.account, this.ledger, this.state, this.config.symbols,
            Object.fromEntries(this.config.symbols.map(stock => [stock, { currentPrice: this.price(stock) }])), this.manual[symbol] ?? {}, this.now(), ++this.revision, this.policy);
        const reason = this.eligibility[symbol] ?? 'startup eligibility pending'; if (reason) inputs.entryContext.watchlistBlockReason = reason;
        this.execution.receive({ type: 'execution_state', version: 3, symbols: [inputs] });
    }
    private exitInputs(symbol: string) { const position = this.account?.positions[symbol], net = position?.netQuantity ?? 0, active = this.state!.direction(symbol, net > 0);
        return { symbol, revision: ++this.revision, netQuantity: net, averagePrice: position?.averagePrice ?? 0, currentPrice: this.price(symbol), bid: this.quotes[symbol]?.bidPrice ?? 0, ask: this.quotes[symbol]?.askPrice ?? 0,
            batchCount: this.policy.batchCount, splitPartials: !active.submitEntryResult.isSingleOrder, hasPlan: active.hasValue, entryPrice: active.entryPrice,
            coreTarget: active.plan.coreTarget, coreCount: active.plan.coreCount, coreRuleEnabled: this.policy.coreTargetEnabled, rulesSupported: true, entries: this.account?.entryOrders[symbol] ?? [],
            pairs: sortedExitPairs(this.account?.exitPairs[symbol] ?? []).map((pair, index, pairs) => ({ ...pair, originalPartial: Math.max(0, this.policy.batchCount - pairs.length) + index + 1 })) }; }
    dispatch(action: StateObject) {
        if (this.stopped) return false; const symbol = action.symbol?.trim() ?? '', key = action.keyCode ?? action.key_code ?? '';
        try {
            if (action.type === 'core_plan_update') { for (const field of ['coreTarget', 'coreCount']) if (typeof action[field] !== 'number' || !Number.isFinite(action[field])) throw new Error(`Invalid core plan input: ${field}`); const net = this.account?.positions[symbol]?.netQuantity ?? 0; if (!this.policy.coreTargetEnabled || !net || !this.state) throw new Error('No active core plan');
                this.state.updateCorePlan(symbol, net > 0, Math.round(action.coreTarget * 100) / 100, action.coreCount); this.persistState(); this.events.message({ ...this.view(symbol, 'command_state'), requestId: action.requestId, updateStatus: 'success' }); return true; }
            if (action.type === 'manual_inputs' || key === 'KeyZ' || key === 'Space') {
                if (key === 'Space') { const value = this.manual[symbol] ?? {}; for (const field of ['customEntryPrice', 'customStopLong', 'customStopShort'] as const) delete value[field]; }
                else if (key === 'KeyZ') { if (!(action.price > 0)) throw new Error('Hover price unavailable for custom stop'); Object.assign(this.manual[symbol] ??= {}, { customStopLong: action.price, customStopShort: action.price });
                    const net = this.account?.positions[symbol]?.netQuantity ?? 0; if (net && this.state) { const market = this.market.getState(symbol)?.metrics(), extreme = net > 0 ? market?.lowOfDay : market?.highOfDay; this.state.direction(symbol, net > 0).coreInvalidationLevel = extreme && extreme > 0 ? net > 0 ? Math.min(extreme, action.price) : Math.max(extreme, action.price) : action.price; } }
                else for (const field of ['customEntryPrice', 'customStopLong', 'customStopShort', 'fixedQuantity'] as const) if (field in action) { if (typeof action[field] !== 'number' || !Number.isFinite(action[field]) || action[field] < 0) throw new Error(`Invalid manual input: ${field}`); (this.manual[symbol] ??= {})[field] = action[field]; }
                this.persistState(); this.events.message(this.view(symbol, 'command_state')); return true;
            }
            if (['KeyE', 'KeyR', 'KeyV'].includes(key)) { this.events.log(symbol, `${key} is disabled or has no active tradebook in the current browser profile`); return true; }
            if (action.retest_warning) this.events.notify(symbol, action.retest_warning);
            this.publishInputs(symbol); return this.execution.route(action);
        } catch (error) { this.failure(symbol, 'Native command', error); if (action.type === 'core_plan_update') this.events.message({ ...this.view(symbol, 'command_state'), requestId: action.requestId, updateStatus: 'error', error: error instanceof Error ? error.message : String(error) }); return true; }
    }
    manualInputs(symbol: string) { return structuredClone(this.manual[symbol] ?? {}); }
    executionEvent(result: StateObject) {
        const symbol = result.symbol ?? '', plan = this.selectedPlan(symbol);
        if (result.type === 'execution_result' && result.action === 'refresh_pending_entry' && !['accepted', 'unknown'].includes(result.outcome) || result.type === 'execution_blocked') delete this.pendingReplacements[symbol];
        if (result.entry && this.state?.acceptEntry(symbol, result.entry, plan?.atr ?? {}, this.now())) { this.persistState(); this.audit('breakout', symbol, this.state.symbol(symbol)); }
        this.events.message(structuredClone(result)); if (result.type === 'execution_result') { this.publishInputs(symbol); void this.refreshAccount(); }
    }
    persistState() { if (this.stopped || !this.state || !this.config) return; const saved = this.state.snapshot(), profile = this.config.profile;
        this.persistence = this.persistence.catch(() => {}).then(() => this.firestore.setTradingState(profile, saved)).catch(error => this.failure('', 'State persistence', error)); }
    pendingPersistence() { return this.persistence; }
    private pendingJobs() {
        if (this.stopped || !this.config || !this.account) return; const time = this.now(), seconds = marketTime(time).minutesSinceMarketOpen * 60;
        for (const symbol of this.config.symbols) { const market = this.market.getState(symbol)?.metrics(); if (!market) continue; const entries: AccountOrder[] = this.account.entryOrders[symbol] ?? [];
            const decision = pendingStopRefresh(entries, this.account.exitPairs[symbol]?.length ?? 0, seconds, this.pendingReplacements[symbol] ?? '', market.lowOfDay, market.highOfDay);
            if (decision) { this.pendingReplacements[symbol] = decision.orderID; this.dispatch({ type: 'native_job', symbol, keyCode: 'RefreshEntryStop' }); }
            const activeKeys = new Set<string>(); for (const order of entries) { const stop = order.exitStopPrice ?? 0, extreme = order.isBuy ? market.lowOfDay : market.highOfDay;
                if (stop <= 0 || extreme <= 0 || !(order.isBuy ? stop > extreme : stop < extreme)) continue; const key = `${symbol}:${order.orderID}:${stop}`; activeKeys.add(key); const last = this.entryWarnings[key];
                if (last === undefined || seconds >= 0 && seconds < 180 && time - last >= 60000) { this.entryWarnings[key] = time; this.events.notify(symbol, `Pending entry stop ${stop} is inside day extreme ${extreme}`); } }
            for (const key of Object.keys(this.entryWarnings)) if (key.startsWith(`${symbol}:`) && !activeKeys.has(key)) delete this.entryWarnings[key];
        }
    }
    private disciplineJobs() {
        if (this.stopped || !this.state || !this.account) return; let changed = false; const time = this.now();
        for (const [symbol, position] of Object.entries(this.account.positions)) { const net = position.netQuantity, market = this.market.getState(symbol)?.metrics(); if (!net || !market) continue; const active = this.state.direction(symbol, net > 0); if (!active.hasValue) continue;
            const decision = stopDiscipline(active.stopTightenPhase ?? 'idle', Math.abs(net), active.initialQuantity, net > 0, this.account.exitPairs[symbol] ?? [], market.lowOfDay, market.highOfDay);
            if (active.stopTightenPhase !== decision.phase) { active.stopTightenPhase = decision.phase; changed = true; }
            if (decision.remind && time - (this.reminders[symbol] ?? 0) >= 20000) { this.reminders[symbol] = time; this.events.notify(symbol, `TIGHTEN STOP using Bookmap levels for ${decision.neededShares} shares`); }
        } if (changed) this.persistState();
    }
    private priceNotifications(symbol: string) {
        const market = this.market.getState(symbol)?.snapshot(); if (this.stopped || !market || !this.state || !this.account || !this.ledger) return;
        const saved = this.state.symbol(symbol), net = this.account.positions[symbol]?.netQuantity ?? 0, active = this.state.direction(symbol, net > 0), trade = this.ledger.trades[symbol]?.find(trade => !trade.isClosed), time = this.now();
        if (net && trade?.entries.length) { const first = trade.entries[0], fillTime = first.timestamp;
            const entryVwap = market.vwaps.filter(vwap => vwap.datetime <= Math.floor(fillTime / 60000) * 60000).at(-1)?.value ?? 0;
            if (entryVwap > 0) { const position = { positionKey: `${net > 0 ? 'long' : 'short'}:${fillTime}:${first.price}:${first.quantity}`, entryPrice: active.entryPrice || first.price, entryVwap, isLong: net > 0 };
                const decision = firstVwapTouch(saved.firstVwapTouch ?? {}, position, market.currentPrice, market.vwap); if (decision.persist) { saved.firstVwapTouch = decision.state; this.persistState(); } if (decision.notify) this.events.notify(symbol, `First ${net > 0 ? 'pop' : 'dip'} to VWAP after entry away from VWAP; manage this level`); }
        }
        const regular = market.candles.filter(candle => marketTime(candle.datetime).isRegularSession), seconds = marketTime(time).minutesSinceMarketOpen * 60;
        if (regular.length >= 2 && seconds > 61) { const current = regular.at(-1)!, previous = regular.at(-2)!, key = `${symbol}:volume`;
            if (current.volume > previous.volume && this.reminders[key] !== current.datetime) { this.reminders[key] = current.datetime;
                if (seconds < 900 || trade?.entries.some(fill => Math.floor(fill.timestamp / 60000) * 60000 === current.datetime)) this.events.notify(symbol, 'Volume higher than the previous minute'); }
            if (current.volume > previous.volume && this.reminders[`${symbol}:volume-direction`] !== current.datetime && net) { this.reminders[`${symbol}:volume-direction`] = current.datetime;
                if (current.close !== current.open) this.events.notify(symbol, (net > 0) === (current.close > current.open) ? 'Higher volume in favor; consider holding, only tighten stop' : 'Higher volume against position'); }
            if (regular.length >= 3 && seconds >= 100) { const closedKey = `${symbol}:closed-volume`, seen = this.reminders[closedKey]; this.reminders[closedKey] = previous.datetime;
                if (seen !== undefined && seen !== previous.datetime && this.ledger.trades[symbol]?.some(t => t.entries.some(fill => Math.floor(fill.timestamp / 60000) * 60000 === previous.datetime))) this.events.notify(symbol, previous.volume > regular.at(-3)!.volume ? 'Higher volume on entry candle' : 'Lower volume on entry candle'); }
        }
    }
    private accountNotifications() {
        if (this.stopped || !this.config || !this.account || !this.state) return;
        for (const symbol of new Set([...this.config.symbols, ...Object.keys(this.account.positions)])) { const pos = this.account.positions[symbol], net = pos?.netQuantity ?? 0, market = this.market.getState(symbol)?.metrics(), pairs = this.account.exitPairs[symbol] ?? [];
            const risk = positionRisk(net, pos?.averagePrice ?? 0, pairs, market?.lowOfDay ?? 0, market?.highOfDay ?? 0), pending = (this.account.entryOrders[symbol] ?? []).reduce((sum, entry) => sum + ((entry.exitStopPrice ?? 0) > 0 ? Math.abs(entry.price - entry.exitStopPrice!) * entry.quantity : 0), 0);
            if (risk / this.policy.riskDollars > 1.2) this.events.notify(symbol, `Position risk exceeds 1.2 R: ${Math.round(risk / this.policy.riskDollars * 100) / 100} R`);
            if (pending / this.policy.riskDollars > 1.2) this.events.notify(symbol, `Pending entry risk exceeds 1.2 R: ${Math.round(pending / this.policy.riskDollars * 100) / 100} R`);
            const active = this.state.direction(symbol, net > 0); if (net && this.policy.coreTargetEnabled && active.hasValue && !active.coreTargetReminderShown) { const view = this.view(symbol, 'command_state'), core = nativeViews(view).find(value => value.type === 'core_plan_config');
                if (core && core.partialsTaken >= 3) { active.coreTargetReminderShown = true; this.persistState(); this.events.message({ ...view, reminderRequested: true }); this.events.notify(symbol, 'Three partials completed; review the core target plan'); } }
        }
    }
    private audit(type: string, symbol: string, payload: unknown) { if (this.stopped || !this.config) return; const profile = this.config.profile, timestamp = this.now(), captured = structuredClone(payload), logs = new LogRepository(this.firestore, () => profile, () => timestamp);
        const work = type === 'order' ? logs.logOrder(captured, { symbol }) : type === 'breakout' ? logs.logBreakoutTradeState(symbol, captured as StateObject) : logs.log(type, captured, { symbol }); void work.then(() => { this.auditFailed = false; }).catch(error => { if (!this.stopped && !this.auditFailed) { this.auditFailed = true; this.sink.log(symbol, `Firestore audit logging unavailable: ${error instanceof Error ? error.name : 'Error'}`); } }); }
    private repeat(delay: number, task: () => void) { if (this.stopped) return; const cancel = this.scheduler.after(delay, () => { this.timers.delete(cancel); if (this.stopped) return; task(); this.repeat(delay, task); }); this.timers.add(cancel); }
    private failure(symbol: string, operation: string, error: unknown) { if (this.stopped) return; const value = this.credentials.loadSchwab(); let reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        for (const secret of [value.access_token, value.refresh_token, value.accountHashValue, this.key]) if (secret) reason = reason.split(secret).join('[redacted]'); this.events.log(symbol, `${operation} failed: ${reason}`); }
    close() { this.stopped = true; this.accountRetry?.(); this.accountRetry = undefined; this.timers.forEach(cancel => cancel()); this.timers.clear(); this.streams?.close(); this.market.close(); this.execution.close(); }
}
