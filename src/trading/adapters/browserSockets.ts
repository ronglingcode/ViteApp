import type { SocketPort, SchedulerPort } from '../ports/socket.ts';
export const browserSockets: SocketPort = {
    open(url, handlers) {
        const socket = new WebSocket(url);
        const connection = { send: (data: string) => socket.send(data), close: () => socket.close() };
        socket.onopen = () => handlers.opened(connection);
        socket.onmessage = event => handlers.message(connection, String(event.data));
        socket.onclose = () => handlers.closed(); socket.onerror = () => handlers.failed();
        return connection;
    },
};
export const browserScheduler: SchedulerPort = { after(delay, task) { const timer = setTimeout(task, delay); return () => clearTimeout(timer); } };
