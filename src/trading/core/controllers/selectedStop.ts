/** A human-selected stop is a five-second, single-use opening permission. */
export interface StopClaim {
    readonly symbol: string;
    readonly price: number;
    validate(isLong: boolean, entryPrice: number): void;
    submit(isLong: boolean, entryPrice: number, stopPrice: number): void;
}
export class SelectedStop {
    static readonly lifetimeMs = 5000;
    private selection?: { symbol: string; price: number; time: number };
    private changed?: (selection?: { symbol: string; price: number }) => void;
    private timer?: ReturnType<typeof setTimeout>;
    private readonly clock: () => number;
    constructor(clock = () => performance.now()) { this.clock = clock; }
    onChange(listener: (selection?: { symbol: string; price: number }) => void) { this.changed = listener; }
    select(symbol: string, price: number) {
        if (!symbol || !Number.isFinite(price) || price <= 0) throw new Error('Select stop: hover + Z');
        this.clear();
        this.selection = { symbol, price: Math.round(price * 100) / 100, time: this.clock() };
        if (this.selection.price <= 0) { this.clear(); throw new Error('Invalid stop price'); }
        this.changed?.(this.selection);
        this.timer = setTimeout(() => this.clear(), SelectedStop.lifetimeMs);
        (this.timer as unknown as { unref?: () => void }).unref?.();
    }
    clear() {
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.timer = undefined;
        const hadSelection = this.selection !== undefined;
        this.selection = undefined;
        if (hadSelection) this.changed?.();
    }
    peek(symbol: string) {
        if (this.selection && (this.clock() - this.selection.time < 0 || this.clock() - this.selection.time >= SelectedStop.lifetimeMs)) this.clear();
        return this.selection?.symbol === symbol ? this.selection.price : undefined;
    }
    consume(symbol: string): StopClaim {
        const price = this.peek(symbol), selection = this.selection;
        this.clear();
        if (price === undefined || !selection) throw new Error('Select stop: hover + Z (valid for 5 seconds, one entry)');
        let submitted = false;
        const validate = (isLong: boolean, entry: number) => {
            const age = this.clock() - selection.time;
            if (submitted || age < 0 || age >= SelectedStop.lifetimeMs) throw new Error('Selected stop used or expired; hover + Z again');
            if (!Number.isFinite(entry) || entry <= 0 || !(isLong ? price < entry : price > entry))
                throw new Error('Stop must be below long entry / above short entry; select stop again with Z');
        };
        return { symbol, price, validate, submit: (isLong, entry, stop) => {
            validate(isLong, entry);
            if (stop !== price) throw new Error('Entry must use the selected stop price');
            submitted = true;
        } };
    }
}

/** The action key connects preparation, sizing and submission without persisting a permission. */
export class StopClaims {
    private readonly claims = new WeakMap<object, StopClaim>();
    readonly selection: SelectedStop;
    constructor(selection: SelectedStop) { this.selection = selection; }
    prepare(action: object, symbol: string, isLong: boolean, entry: number) {
        let claim = this.claims.get(action);
        if (!claim) { claim = this.selection.consume(symbol); this.claims.set(action, claim); }
        if (claim.symbol !== symbol) throw new Error('Selected stop belongs to another symbol');
        claim.validate(isLong, entry);
        return claim;
    }
    submit(action: object, symbol: string, isLong: boolean, entry: number, stop: number) {
        const claim = this.claims.get(action);
        if (!claim || claim.symbol !== symbol) throw new Error('Select stop: hover + Z');
        claim.submit(isLong, entry, stop);
    }
}
