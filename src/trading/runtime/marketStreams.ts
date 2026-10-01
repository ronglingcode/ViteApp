import { ManagedSocket } from './managedSocket.ts';
import type { SocketPort, SchedulerPort } from '../ports/socket.ts';
import type { Trade } from '../models/market.ts';
import * as Massive from '../libraries/massive/streamingProtocol.ts';
import * as Schwab from '../libraries/broker/schwab/streamingProtocol.ts';

export interface MarketStreamEvents {
    trade(trade: Trade): void; quote(quote: Schwab.Quote): void; activity(contents: Record<string, any>[]): void;
    ready(source: string): void; status(source: string, status: string): void;
}
export class MarketStreams {
    private readonly massive: ManagedSocket;
    private readonly schwab: ManagedSocket;
    constructor(sockets: SocketPort, scheduler: SchedulerPort, symbols: string[], key: () => string,
        credentials: () => Promise<{ info: Schwab.StreamerInfo; token: string }>, events: MarketStreamEvents) {
        this.massive = new ManagedSocket(sockets, scheduler, async () => ({
            url: Massive.streamUrl,
            opened: socket => socket.send(JSON.stringify(Massive.loginRequest(key()))),
            message: (socket, data) => {
                const parsed = Massive.parseStreamMessage(JSON.parse(data));
                if (parsed.login === 'failed') { events.status('massive', 'authentication failed'); this.massive.reconnect(); return; }
                if (parsed.login === 'success') { this.massive.ready(); events.ready('massive'); socket.send(JSON.stringify(Massive.subscribeRequest(symbols))); }
                parsed.trades.forEach(trade => events.trade(trade));
            },
        }), status => events.status('massive', status));
        this.schwab = new ManagedSocket(sockets, scheduler, async () => {
            const { info, token } = await credentials();
            return { url: info.streamerSocketUrl,
                opened: socket => socket.send(JSON.stringify(Schwab.loginRequest(info, token))),
                message: (socket, data) => {
                    const parsed = Schwab.parseStreamMessage(JSON.parse(data));
                    if (parsed.login === 'failed') { events.status('schwab', 'authentication failed'); this.schwab.reconnect(); return; }
                    if (parsed.login === 'success') {
                        this.schwab.ready(); events.ready('schwab');
                        socket.send(JSON.stringify(Schwab.quoteSubscribeRequest(info, symbols))); socket.send(JSON.stringify(Schwab.activitySubscribeRequest(info)));
                    }
                    parsed.quotes.forEach(quote => events.quote(quote)); if (parsed.activities.length) events.activity(parsed.activities);
                },
            };
        }, status => events.status('schwab', status));
    }
    start() { this.massive.start(); this.schwab.start(); }
    close() { this.massive.close(); this.schwab.close(); }
}
