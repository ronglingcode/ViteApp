/**
 * Tracks large order (wall) state across Bookmap orderbook snapshots.
 * Detects when new large orders appear or existing ones disappear,
 * returning the diff for logging and notification purposes.
 *
 * Tracks state independently per symbol.
 * Orders more than 3 ATRs away from the current price are ignored.
 */

export type LargeOrder = { price: number; size: number; side: "bid" | "ask" };

const ATR_DISTANCE_LIMIT = 3;

// Per-symbol previous snapshot state
const previousOrdersBySymbol: Map<string, Map<number, LargeOrder>> = new Map();

const isWithinRange = (orderPrice: number, currentPrice: number, atr: number): boolean => {
    if (currentPrice <= 0 || atr <= 0) return true; // no filtering if data unavailable
    return Math.abs(orderPrice - currentPrice) <= ATR_DISTANCE_LIMIT * atr;
};

/**
 * Compare the incoming orderbook snapshot against the previous one for the same symbol.
 * Returns lists of orders that appeared (new walls) and disappeared (consumed/pulled walls).
 * Size changes at an existing price level are intentionally ignored to reduce noise.
 * Orders more than 3 ATRs from currentPrice are excluded.
 */
export const processOrderbookSnapshot = (data: {
    symbol: string;
    largeBids: [number, number][];
    largeAsks: [number, number][];
    bestBid?: number;
    bestAsk?: number;
}, atr: number): { appeared: LargeOrder[]; disappeared: LargeOrder[] } => {
    const symbol = data.symbol;
    const previousOrders = previousOrdersBySymbol.get(symbol) ?? new Map();

    // Use unfiltered best bid/ask sent by the plugin (not derived from filtered large-order arrays)
    const bestBid = data.bestBid ?? 0;
    const bestAsk = data.bestAsk ?? 0;
    const currentPrice = (bestBid > 0 && bestAsk > 0) ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;

    const currentOrders = new Map<number, LargeOrder>();

    for (const [price, size] of data.largeBids) {
        if (isWithinRange(price, currentPrice, atr)) {
            currentOrders.set(price, { price, size, side: "bid" });
        }
    }
    for (const [price, size] of data.largeAsks) {
        if (isWithinRange(price, currentPrice, atr)) {
            currentOrders.set(price, { price, size, side: "ask" });
        }
    }

    const appeared: LargeOrder[] = [];
    const disappeared: LargeOrder[] = [];

    // New large orders: in current but not in previous
    for (const [price, order] of currentOrders) {
        if (!previousOrders.has(price)) {
            appeared.push(order);
        }
    }

    // Removed large orders: in previous but not in current
    for (const [price, order] of previousOrders) {
        if (!currentOrders.has(price)) {
            disappeared.push(order);
        }
    }

    previousOrdersBySymbol.set(symbol, currentOrders);
    return { appeared, disappeared };
};
