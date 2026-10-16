type Stop = { orderID: string; quantity: number; price?: number; isBuy: boolean; rawOrder?: { status?: string } };
type Pair = { STOP?: Stop };
export interface ProtectionObservation { symbol: string; netQuantity: number; pairs: Pair[] }

/** Call only with successful broker observations, never advance a deadline from cached data. */
export class StopLossMonitor {
    private readonly exposed = new Map<string, { since: number; isLong: boolean; closing: boolean }>();
    get monitoring() { return this.exposed.size > 0; }
    observe(positions: ProtectionObservation[], now: number) {
        const warnings: { symbol: string; uncovered: number }[] = [], close: string[] = [];
        const seen = new Set<string>();
        for (const { symbol, netQuantity, pairs } of positions) {
            seen.add(symbol);
            const ids = new Set<string>();
            let covered = 0;
            for (const { STOP: stop } of pairs) {
                if (!stop || !stop.orderID || ids.has(stop.orderID) || stop.isBuy !== (netQuantity < 0)
                    || !Number.isFinite(stop.quantity) || stop.quantity <= 0 || !((stop.price ?? 0) > 0)
                    || ['AWAITING_PARENT_ORDER', 'CANCELED', 'REPLACED', 'REJECTED', 'EXPIRED', 'FILLED'].includes(stop.rawOrder?.status ?? '')) continue;
                ids.add(stop.orderID); covered += stop.quantity;
            }
            const uncovered = Math.abs(netQuantity) - covered;
            if (!Number.isFinite(netQuantity) || netQuantity === 0 || uncovered <= 0) { this.exposed.delete(symbol); continue; }
            let exposure = this.exposed.get(symbol);
            if (!exposure || exposure.isLong !== (netQuantity > 0)) {
                exposure = { since: now, isLong: netQuantity > 0, closing: false };
                this.exposed.set(symbol, exposure); warnings.push({ symbol, uncovered });
            }
            if (!exposure.closing && now - exposure.since > 10_000) {
                exposure.closing = true; close.push(symbol);
            }
        }
        for (const symbol of this.exposed.keys()) if (!seen.has(symbol)) this.exposed.delete(symbol);
        return { warnings, close };
    }
}
