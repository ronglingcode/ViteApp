import type { OrderBookLevel, OrderBookSnapshot } from '../../bookmap/bookmapModels';

/**
 * Reconstructs a full-depth order book from Databento MBO (Market by Order) events.
 *
 * MBO gives individual order events (Add, Cancel, Modify, Trade, Fill, Clear)
 * at ALL price levels. We maintain a running state of every order and aggregate
 * by price level to produce OrderBookSnapshot objects for the bookmap heatmap.
 *
 * Order lifecycle: Add → [Modify...] → Cancel/Fill
 */

// ============================================
// Types
// ============================================

interface TrackedOrder {
    price: number;
    size: number;
    side: 'B' | 'A'; // Bid or Ask
}

// ============================================
// Reconstructor
// ============================================

export class OrderBookReconstructor {
    /** order_id → TrackedOrder */
    private orders: Map<string, TrackedOrder> = new Map();

    /** Aggregated bid levels: price → total size */
    private bidLevels: Map<number, number> = new Map();

    /** Aggregated ask levels: price → total size */
    private askLevels: Map<number, number> = new Map();

    private lastTimestamp: number = 0;

    /**
     * Process a single MBO event and update the book state.
     * Returns true if the book was modified (caller should emit a snapshot).
     */
    processEvent(
        orderId: string,
        action: string,
        side: string,
        price: number,
        size: number,
        timestampMs: number
    ): boolean {
        this.lastTimestamp = timestampMs;

        switch (action) {
            case 'A': return this.handleAdd(orderId, side, price, size);
            case 'C': return this.handleCancel(orderId, size);
            case 'M': return this.handleModify(orderId, side, price, size);
            case 'R': return this.handleClear();
            // Trade and Fill don't affect the book directly
            case 'T':
            case 'F':
            case 'N':
                return false;
            default:
                return false;
        }
    }

    /** Build an OrderBookSnapshot from current state. */
    toSnapshot(): OrderBookSnapshot {
        let bids: OrderBookLevel[] = [];
        let asks: OrderBookLevel[] = [];

        this.bidLevels.forEach((size, price) => {
            if (size > 0) {
                bids.push({ price, size, lastUpdate: this.lastTimestamp });
            }
        });

        this.askLevels.forEach((size, price) => {
            if (size > 0) {
                asks.push({ price, size, lastUpdate: this.lastTimestamp });
            }
        });

        // Sort bids descending, asks ascending (standard book order)
        bids.sort((a, b) => b.price - a.price);
        asks.sort((a, b) => a.price - b.price);

        return { bids, asks, lastUpdate: this.lastTimestamp };
    }

    /** Reset all state. */
    clear(): void {
        this.orders.clear();
        this.bidLevels.clear();
        this.askLevels.clear();
        this.lastTimestamp = 0;
    }

    get orderCount(): number {
        return this.orders.size;
    }

    get bidLevelCount(): number {
        return this.bidLevels.size;
    }

    get askLevelCount(): number {
        return this.askLevels.size;
    }

    // ============================================
    // Event Handlers
    // ============================================

    private handleAdd(orderId: string, side: string, price: number, size: number): boolean {
        if (side !== 'B' && side !== 'A') return false;
        if (price <= 0 || price > 1e6 || size <= 0) return false;

        // If order already exists (shouldn't happen, but be defensive), remove it first
        if (this.orders.has(orderId)) {
            this.removeOrder(orderId);
        }

        this.orders.set(orderId, { price, size, side });
        let levels = side === 'B' ? this.bidLevels : this.askLevels;
        levels.set(price, (levels.get(price) || 0) + size);
        return true;
    }

    private handleCancel(orderId: string, cancelSize: number): boolean {
        let order = this.orders.get(orderId);
        if (!order) return false;

        let levels = order.side === 'B' ? this.bidLevels : this.askLevels;

        if (cancelSize >= order.size || cancelSize === 0) {
            // Full cancel — remove entire order
            let remaining = (levels.get(order.price) || 0) - order.size;
            if (remaining <= 0) {
                levels.delete(order.price);
            } else {
                levels.set(order.price, remaining);
            }
            this.orders.delete(orderId);
        } else {
            // Partial cancel — reduce size
            let remaining = (levels.get(order.price) || 0) - cancelSize;
            if (remaining <= 0) {
                levels.delete(order.price);
            } else {
                levels.set(order.price, remaining);
            }
            order.size -= cancelSize;
        }

        return true;
    }

    private handleModify(orderId: string, side: string, newPrice: number, newSize: number): boolean {
        if (newPrice <= 0 || newPrice > 1e6 || newSize <= 0) return false;

        let order = this.orders.get(orderId);
        if (order) {
            // Remove old contribution
            let oldLevels = order.side === 'B' ? this.bidLevels : this.askLevels;
            let remaining = (oldLevels.get(order.price) || 0) - order.size;
            if (remaining <= 0) {
                oldLevels.delete(order.price);
            } else {
                oldLevels.set(order.price, remaining);
            }
        }

        // Add with new price/size
        let resolvedSide = (side === 'B' || side === 'A') ? side : (order?.side || 'B');
        let newOrder: TrackedOrder = { price: newPrice, size: newSize, side: resolvedSide };
        this.orders.set(orderId, newOrder);

        let newLevels = resolvedSide === 'B' ? this.bidLevels : this.askLevels;
        newLevels.set(newPrice, (newLevels.get(newPrice) || 0) + newSize);

        return true;
    }

    private handleClear(): boolean {
        this.orders.clear();
        this.bidLevels.clear();
        this.askLevels.clear();
        return true;
    }

    private removeOrder(orderId: string): void {
        let order = this.orders.get(orderId);
        if (!order) return;

        let levels = order.side === 'B' ? this.bidLevels : this.askLevels;
        let remaining = (levels.get(order.price) || 0) - order.size;
        if (remaining <= 0) {
            levels.delete(order.price);
        } else {
            levels.set(order.price, remaining);
        }
        this.orders.delete(orderId);
    }
}
