import * as Helper from '../utils/helper';
import type * as Models from '../models/models';

// Mirrors StreamingHandler.conditionsNotUpdateLastPrice / *Numbers. Kept local so this
// module stays worker-safe (StreamingHandler pulls in DB/charts/broker, which cannot run
// in a worker). These are stable trade-condition constants.
export const conditionsNotUpdateLastPrice = [
    'W', 'C', 'T', 'U', 'M', 'Q', 'N', 'H', 'I', 'V', '7',
];

export const conditionsNotUpdateLastPriceNumbers = [
    2, 7, 12, 13, 15, 16, 20, 21, 37, 52, 53,
];

export interface ParsedTimeSale {
    record: Models.TimeSale;
    shouldFilter: boolean;
}

/** Worker-safe port of AlpacaStreaming.createTimeSale. */
export const createAlpacaTimeSale = (c: any): ParsedTimeSale => {
    let has_non_update = false;
    let tradeTime = Helper.numberToDate(c['t']);
    if (Helper.isRegularMarketSessionTime(tradeTime) && c['c']) {
        for (let i = 0; i < c['c'].length; i++) {
            if (conditionsNotUpdateLastPrice.includes(c['c'][i])) {
                has_non_update = true;
                break;
            }
        }
    }

    let record: Models.TimeSale = {
        symbol: c['S'],
        receivedTime: new Date(),
        conditions: [],
        timestamp: 0,
    };
    if (c['t'] != null) {
        record.tradeTime = c['t'];
    }
    if (c['p'] != null) {
        record.lastPrice = c['p'];
    }
    if (c['s'] != null) {
        record.lastSize = c['s'];
    }
    if (c['i'] != null) {
        record.tradeID = c['i'];
    }
    record.rawTimestamp = '';
    if (c['t'] != null) {
        let nanoTime = new Date(c['t']);
        let timeStr = nanoTime.getHours() + ':' + nanoTime.getMinutes() + ':' + nanoTime.getSeconds() + '.' + nanoTime.getMilliseconds();
        record.rawTimestamp = `${timeStr} ${nanoTime.getTime()}`;
        record.timestamp = nanoTime.getTime();
    }
    if (c['c'] != null) {
        record.conditions = c['c'];
    }
    return { record, shouldFilter: has_non_update };
};

/** Worker-safe port of MassiveStreaming.createTimeSale. */
export const createMassiveTimeSale = (c: any): ParsedTimeSale => {
    let has_non_update = false;
    let tradeTime = Helper.numberToDate(c.t);
    if (Helper.isRegularMarketSessionTime(tradeTime) && c.c) {
        for (let i = 0; i < c.c.length; i++) {
            if (conditionsNotUpdateLastPriceNumbers.includes(c.c[i])) {
                has_non_update = true;
                break;
            }
        }
    }

    let symbol = c.sym;
    let record: Models.TimeSale = {
        symbol: symbol,
        receivedTime: new Date(),
        conditions: [],
        timestamp: 0,
    };
    if (c.t != null) {
        record.tradeTime = c.t;
    }
    if (c.p != null) {
        record.lastPrice = c.p;
    }
    if (c.s != null) {
        record.lastSize = c.s;
    }
    if (c.q != null) {
        record.seq = c.q;
    }
    if (c.i != null) {
        record.tradeID = Number(c.i);
    }
    record.rawTimestamp = '';
    if (c.t != null) {
        let nanoTime = new Date(c.t);
        let timeStr = nanoTime.getHours() + ':' + nanoTime.getMinutes() + ':' + nanoTime.getSeconds() + '.' + nanoTime.getMilliseconds();
        record.rawTimestamp = `${timeStr} ${c.t}`;
        record.timestamp = c.t;
    }
    if (c.c != null) {
        for (let i = 0; i < c.c.length; i++) {
            record.conditions.push(`${c.c[i]}`);
        }
    }
    return { record, shouldFilter: has_non_update };
};
