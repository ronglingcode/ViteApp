import type { WallOutSnapshot } from '../trading/core/controllers/wallOut.ts';

interface SnapshotSocket { readyState: number; send(message: string): void }

/** Only requests depth; the browser's existing broker path executes the exit adjustment. */
export class WallOutSnapshotClient {
    private nextId = 0;
    private pending = new Map<string, {
        symbol: string;
        resolve(value: WallOutSnapshot): void;
        reject(error: Error): void;
        timer: ReturnType<typeof setTimeout>;
    }>();

    request(symbol: string, socket: SnapshotSocket | null): Promise<WallOutSnapshot> {
        if (socket?.readyState !== 1) return Promise.reject(new Error('Connect Bookmap before using Wall Out'));
        return new Promise((resolve, reject) => {
            const requestId = String(++this.nextId);
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error('Bookmap did not return wall-out depth'));
            }, 5_000);
            this.pending.set(requestId, { symbol, resolve, reject, timer });
            try { socket.send(JSON.stringify({ type: 'wall_out_snapshot_request', symbol, requestId })); }
            catch (error) {
                clearTimeout(timer); this.pending.delete(requestId);
                reject(error);
            }
        });
    }

    receive(message: { type?: string; requestId?: string; symbol?: string; orderbook?: WallOutSnapshot }) {
        if (message.type !== 'wall_out_snapshot') return false;
        const request = this.pending.get(message.requestId ?? '');
        if (!request || request.symbol !== message.symbol) return true;
        clearTimeout(request.timer); this.pending.delete(message.requestId!);
        if (!message.orderbook) request.reject(new Error('Bookmap order book is not ready'));
        else request.resolve(message.orderbook);
        return true;
    }

    disconnect() {
        for (const request of this.pending.values()) {
            clearTimeout(request.timer);
            request.reject(new Error('Bookmap disconnected before returning depth'));
        }
        this.pending.clear();
    }
}
