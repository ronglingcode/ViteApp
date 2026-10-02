import type { Candle, Trade } from '../../models/market.ts';
import { marketTime } from '../../core/marketdata/marketClock.ts';

export const conditionsNotUpdateLastPriceNumbers = [2, 7, 12, 13, 15, 16, 20, 21, 37, 52, 53];

export function shouldFilterTrade(trade: Trade): boolean {
    return marketTime(trade.timestamp).isRegularSession && trade.conditions.some(condition => conditionsNotUpdateLastPriceNumbers.includes(condition));
}

export function mapWebSocketTrade(value: Record<string, any>): Trade | null {
    const size = tradeSize(value.ds, value.s);
    if (value.ev !== 'T' || typeof value.sym !== 'string' || !valid(value.t) || !valid(value.p) || value.p <= 0 || size === null) return null;
    return {
        symbol: value.sym, timestamp: value.t, price: value.p, size,
        ...(value.q == null ? {} : { sequence: String(value.q) }),
        ...(value.i == null ? {} : { id: String(value.i) }),
        ...(valid(value.x) ? { exchange: value.x } : {}),
        conditions: Array.isArray(value.c) ? value.c.filter(valid) : [],
    };
}

export function mapRestTrade(symbol: string, value: Record<string, any>): Trade {
    const timestamp = Number(BigInt(String(value.sip_timestamp)) / 1000000n);
    const size = tradeSize(value.decimal_size, value.size);
    if (!valid(value.price) || value.price <= 0 || size === null) throw new Error('Massive trade missing price/size');
    return {
        symbol, timestamp, price: value.price, size,
        ...(value.sequence_number == null ? {} : { sequence: String(value.sequence_number) }),
        ...(value.id == null ? {} : { id: String(value.id) }),
        ...(valid(value.exchange) ? { exchange: value.exchange } : {}),
        conditions: Array.isArray(value.conditions) ? value.conditions.filter(valid) : [],
    };
}
function valid(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }

function tradeSize(decimalSize: unknown, wholeSize: unknown): number | null {
    // Fractional prints report zero in the legacy integer field.
    const exact = typeof decimalSize === 'string' && decimalSize.trim() !== '' ? Number(decimalSize) : NaN;
    if (Number.isFinite(exact) && exact > 0) return exact;
    return valid(wholeSize) && wholeSize > 0 ? wholeSize : null;
}

export function mapAggregate(symbol: string, value: Record<string, unknown>): Candle {
    const number = (name: string): number => {
        const result = value[name];
        if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error(`Massive aggregate missing ${name}`);
        return result;
    };
    return {
        symbol, datetime: number('t'), open: number('o'), high: number('h'), low: number('l'),
        close: number('c'), volume: number('v'), vwap: typeof value.vw === 'number' && Number.isFinite(value.vw) ? value.vw : 0,
    };
}
