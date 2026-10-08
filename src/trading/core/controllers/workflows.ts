import type { StateObject } from '../state/tradeState.ts';

/** Domain decisions used by manual workflows and periodic jobs in both applications. */
export function profitResetTargets(targets: { quantity: number; target: number }[], remaining: number) {
    if (targets.length <= 1) throw new Error('Profit reset requires multiple captured targets');
    if (!(remaining > 0)) throw new Error('No position for profit reset');
    const result: { quantity: number; target: number }[] = [];
    // Preserve the legacy last-target-first order, clipping to actual remaining shares.
    for (const target of [...targets].reverse()) { if (remaining <= 0) break;
        if (!Number.isFinite(target.target) || target.target <= 0 || !Number.isFinite(target.quantity) || target.quantity <= 0) throw new Error('Invalid captured profit target');
        const quantity = Math.min(target.quantity, remaining); result.push({ ...target, quantity }); remaining -= quantity; }
    if (remaining > 0) throw new Error('Captured targets do not cover the current position');
    return result;
}
export function fallbackProfitReset(netQuantity: number, currentPrice: number, low: number, high: number, batchCount: number) {
    const isLong = netQuantity > 0, remaining = Math.abs(netQuantity);
    if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('No position for profit reset');
    const stopLoss = Math.round((isLong ? low : high) * 100) / 100;
    if (!Number.isFinite(currentPrice) || currentPrice <= 0 || !Number.isFinite(stopLoss) || stopLoss <= 0
        || (isLong ? stopLoss >= currentPrice : stopLoss <= currentPrice))
        throw new Error('Profit reset fallback requires current price and a day stop on the protective side');
    const target = Math.round((currentPrice + 2 * (currentPrice - stopLoss)) * 100) / 100;
    if (!Number.isFinite(target) || target <= 0 || (isLong ? target <= currentPrice : target >= currentPrice))
        throw new Error('Invalid profit reset fallback target');
    const count = Math.min(Math.max(1, Math.floor(remaining)), Number.isFinite(batchCount) && batchCount > 0 ? Math.floor(batchCount) || 1 : 10);
    const quantity = Math.floor(remaining / count);
    // Reverse order matches submitExitPairs, including the distribution of leftover shares.
    const targets = Array.from({ length: count }, (_, index) => ({ target, quantity: quantity + Math.min(1, Math.max(0, remaining - quantity * count - index)) }));
    return { stopLoss, targets };
}
export function stopDiscipline(phase: string, current: number, initial: number, isLong: boolean, pairs: StateObject[], low: number, high: number) {
    if (!(current > 0) || !(initial > 0)) return { phase: phase || 'idle', remind: false, neededShares: 0 };
    const required = Math.max(0, current - initial * .5);
    const tightened = pairs.reduce((sum, pair) => sum + (pair.STOP && (isLong ? pair.STOP.price > low : pair.STOP.price < high) ? pair.STOP.quantity : 0), 0);
    let next = phase || 'idle';
    if (next === 'done' && tightened < required || next === 'idle' && current < initial * .9) next = 'needs_tighten';
    else if (next === 'needs_tighten' && tightened >= required) next = 'done';
    const neededShares = Math.max(0, current - Math.floor(initial * .5));
    return { phase: next, remind: next === 'needs_tighten' && neededShares > 1, neededShares };
}
export function pendingStopRefresh(entries: StateObject[], pairCount: number, seconds: number, oldId: string, low: number, high: number) {
    if (seconds < 0 || seconds >= 300 || pairCount || entries.length !== 1) return null;
    const order = entries[0], stop = order.isBuy ? low : high;
    if (order.orderID === oldId || !(order.price > 0) || !(order.exitStopPrice > 0) || !(stop > 0)) return null;
    if (order.isBuy ? stop >= order.exitStopPrice : stop <= order.exitStopPrice) return null;
    return { orderID: order.orderID, stopPrice: stop, isLong: order.isBuy, entryPrice: order.price };
}
export function firstVwapTouch(previous: StateObject, position: StateObject | null, price: number, vwap: number) {
    if (!position) return { state: previous, persist: false, notify: false };
    const isNew = previous.positionKey !== position.positionKey, state = isNew ? { ...position } : { ...previous };
    const away = position.isLong ? position.entryPrice < position.entryVwap : position.entryPrice > position.entryVwap;
    const touched = vwap > 0 && (position.isLong ? price >= vwap : price <= vwap);
    const notify = away && touched && state.alertedPositionKey !== position.positionKey;
    if (notify) state.alertedPositionKey = position.positionKey;
    return { state, persist: isNew || notify, notify };
}
export function completedPartials(initial: number, exited: number, remainingPairs: number, count: number) {
    const fromPairs = Math.max(0, count - Math.min(count, Math.max(0, remainingPairs)));
    return initial > 0 ? Math.min(Math.max(0, Math.min(count, Math.round(exited / (initial / count)))), fromPairs) : fromPairs;
}
/** Same native policy in both apps: halve once, warn, leave the final rejection to the broker. */
export function buyingPowerTargets<T extends { quantity: number }>(targets: T[], entryPrice: number, available: number) {
    const original = targets.reduce((sum, target) => sum + target.quantity, 0), halved = available <= entryPrice * original;
    const sized = targets.map(target => ({ ...target, quantity: halved ? target.quantity / 2 : target.quantity })), totalQuantity = sized.reduce((sum, target) => sum + target.quantity, 0);
    return { targets: sized, totalQuantity, halved, insufficient: available <= entryPrice * totalQuantity };
}
