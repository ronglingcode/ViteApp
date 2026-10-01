import type { SocketConnection, SocketHandlers, SocketPort, SchedulerPort } from '../ports/socket.ts';
export interface SocketSetup { url: string; opened(socket: SocketConnection): void; message(socket: SocketConnection, data: string): void }

/** One vendor connection, bounded reconnect delay, canceled timers on teardown. */
export class ManagedSocket {
    private readonly sockets: SocketPort;
    private readonly scheduler: SchedulerPort;
    private readonly setup: () => Promise<SocketSetup>;
    private readonly status: (value: string) => void;
    private socket?: SocketConnection;
    private cancelRetry?: () => void;
    private dispose?: () => void;
    private stopped = true;
    private closed = false;
    private attempts = 0;
    constructor(sockets: SocketPort, scheduler: SchedulerPort, setup: () => Promise<SocketSetup>, status: (value: string) => void) {
        this.sockets = sockets; this.scheduler = scheduler; this.setup = setup; this.status = status;
    }
    start() { if (this.closed || !this.stopped) return; this.stopped = false; void this.connect(); }
    ready() { this.attempts = 0; this.status('connected'); }
    reconnect() { this.dispose?.(); this.retry(); }
    private retry() {
        if (this.stopped || this.cancelRetry) return;
        const delay = Math.min(30000, 1000 * 2 ** Math.min(this.attempts++, 5));
        this.status(`reconnecting in ${delay}ms`);
        this.cancelRetry = this.scheduler.after(delay, () => { this.cancelRetry = undefined; void this.connect(); });
    }
    private async connect() {
        if (this.stopped) return;
        try {
            const setup = await this.setup(); if (this.stopped) return;
            let active = true;
            const handlers: SocketHandlers = {
                opened: socket => { if (active && !this.stopped) { try { setup.opened(socket); } catch { this.reconnect(); } } },
                message: (socket, data) => { if (active && !this.stopped) { try { setup.message(socket, data); } catch { this.status('invalid stream message'); this.reconnect(); } } },
                closed: () => { if (active) { active = false; this.retry(); } },
                failed: () => { if (active) { this.dispose?.(); this.retry(); } },
            };
            this.dispose = () => { active = false; this.socket?.close(); this.socket = undefined; };
            this.socket = this.sockets.open(setup.url, handlers);
        } catch { this.status('connection setup failed'); this.retry(); }
    }
    close() { this.closed = true; this.stopped = true; this.cancelRetry?.(); this.cancelRetry = undefined; this.dispose?.(); }
}
