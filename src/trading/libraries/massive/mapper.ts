import type { Candle } from '../../models/market.ts';

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
