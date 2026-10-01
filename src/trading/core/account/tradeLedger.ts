import type { AccountFill } from '../../models/account.ts';
export interface TradeExecution { symbol: string; entries: AccountFill[]; exits: AccountFill[]; realizedPnL: number; isLong: boolean; isClosed: boolean }

export function groupTradeExecutions(symbol: string, fills: AccountFill[]): TradeExecution[] {
    const trades: TradeExecution[] = []; let net = 0;
    for (const fill of [...fills].sort((a, b) => a.timestamp - b.timestamp)) {
        let quantity = fill.quantity;
        if (net && (net > 0) !== fill.isBuy) {
            const closing = Math.min(quantity, Math.abs(net));
            trades.at(-1)!.exits.push({ ...fill, quantity: closing, positionEffectIsOpen: false });
            net += fill.isBuy ? closing : -closing; quantity -= closing;
        }
        if (quantity > 0) {
            const entry = { ...fill, quantity, positionEffectIsOpen: true };
            if (!net) trades.push({ symbol, entries: [], exits: [], realizedPnL: 0, isLong: fill.isBuy, isClosed: false });
            trades.at(-1)!.entries.push(entry); net += fill.isBuy ? quantity : -quantity;
        }
    }
    for (const trade of trades) {
        const quantity = trade.entries.reduce((sum, fill) => sum + fill.quantity, 0);
        const average = trade.entries.reduce((sum, fill) => sum + fill.quantity * fill.price, 0) / quantity;
        trade.realizedPnL = trade.exits.reduce((sum, fill) => sum + (trade.isLong ? fill.price - average : average - fill.price) * fill.quantity, 0);
        trade.isClosed = quantity === trade.exits.reduce((sum, fill) => sum + fill.quantity, 0);
        // Preserve the browser's per-minute aggregation for entry/add-stack semantics.
        const minutes = new Map<number, AccountFill[]>();
        for (const entry of trade.entries) { const key = Math.floor(entry.timestamp / 60000); (minutes.get(key) ?? (minutes.set(key, []), minutes.get(key)!)).push(entry); }
        trade.entries = [...minutes.values()].map(entries => {
            const quantity = entries.reduce((sum, fill) => sum + fill.quantity, 0);
            return { ...entries[0], quantity, price: entries.reduce((sum, fill) => sum + fill.quantity * fill.price, 0) / quantity };
        });
    }
    return trades;
}
export function projectTradeLedger(executions: Record<string, AccountFill[]>, dailyMaxLoss = 4000) {
    const trades: Record<string, TradeExecution[]> = {}; let tradesCount = 0, nonBreakevenTradesCount = 0, realizedPnL = 0;
    for (const [symbol, fills] of Object.entries(executions)) {
        trades[symbol] = groupTradeExecutions(symbol, fills);
        for (const trade of trades[symbol]) { tradesCount++; realizedPnL += trade.realizedPnL; if (Math.abs(trade.realizedPnL) > dailyMaxLoss * 0.05) nonBreakevenTradesCount++; }
    }
    return { trades, tradesCount, nonBreakevenTradesCount, realizedPnL };
}
export function addedPartialStack(trade: TradeExecution | undefined, initialQuantity: number) {
    const stack: number[] = []; let quantity = 0, hasExit = false;
    for (const fill of [...(trade?.entries ?? []), ...(trade?.exits ?? [])].sort((a, b) => a.timestamp - b.timestamp)) {
        if (fill.positionEffectIsOpen) { quantity += fill.quantity; if (quantity > initialQuantity || hasExit) stack.push(fill.price); }
        else { hasExit = true; quantity -= fill.quantity; if (stack.length) stack.pop(); }
    }
    return stack;
}
