import type * as Models from '../models/models';

/** Worker-safe port of SchwabStreaming.createLevelOneQuote. */
export const createSchwabLevelOneQuote = (c: any): Models.Quote => {
    let record: Models.Quote = {
        symbol: c['key'],
    };
    if (c['1'] != null) {
        record.bidPrice = c['1'];
    }
    if (c['2'] != null) {
        record.askPrice = c['2'];
    }
    if (c['4'] != null) {
        record.bidSize = c['4'];
    }
    if (c['5'] != null) {
        record.askSize = c['5'];
    }
    return record;
};
