import type * as Models from '../models/models';
import { mapWebSocketTrade, shouldFilterTrade } from '../trading/libraries/massive/mapper.ts';
export { conditionsNotUpdateLastPriceNumbers } from '../trading/libraries/massive/mapper.ts';
export const conditionsNotUpdateLastPrice = ['W', 'C', 'T', 'U', 'M', 'Q', 'N', 'H', 'I', 'V', '7'];
export interface ParsedTimeSale { record: Models.TimeSale; shouldFilter: boolean }

/** Adapter from the headless vendor mapper to the existing chart/worker message. */
export const createMassiveTimeSale = (value: any): ParsedTimeSale => {
    const trade = mapWebSocketTrade(value);
    if (!trade) return { record: { symbol: String(value.sym ?? ''), receivedTime: new Date(), conditions: [], timestamp: 0 }, shouldFilter: true };
    const time = new Date(trade.timestamp);
    return { record: {
        symbol: trade.symbol, receivedTime: new Date(), tradeTime: trade.timestamp, timestamp: trade.timestamp,
        lastPrice: trade.price, lastSize: trade.size, conditions: trade.conditions.map(String),
        seq: trade.sequence === undefined ? undefined : Number(trade.sequence),
        tradeID: trade.id === undefined ? undefined : Number(trade.id),
        rawTimestamp: `${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}.${time.getMilliseconds()} ${trade.timestamp}`,
    }, shouldFilter: shouldFilterTrade(trade) };
};
