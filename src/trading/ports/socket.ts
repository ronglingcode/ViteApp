export interface SocketConnection { send(message: string): void; close(): void }
export interface SocketHandlers {
    opened(socket: SocketConnection): void; message(socket: SocketConnection, data: string): void;
    closed(): void; failed(): void;
}
export interface SocketPort { open(url: string, handlers: SocketHandlers): SocketConnection }
export interface SchedulerPort { after(delayMs: number, task: () => void): () => void }
