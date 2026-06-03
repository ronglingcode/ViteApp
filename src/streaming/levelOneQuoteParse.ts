import type * as Models from '../models/models';

/** Worker-safe port of AlpacaStreaming.createLevelOneQuote. */
export const createAlpacaLevelOneQuote = (c: any): Models.Quote => {
    let record: Models.Quote = {
        symbol: c['S'],
    };
    if (c['bp'] != null) {
        record.bidPrice = c['bp'];
    }
    if (c['ap'] != null) {
        record.askPrice = c['ap'];
    }
    if (c['bs'] != null) {
        record.bidSize = c['bs'];
    }
    if (c['as'] != null) {
        record.askSize = c['as'];
    }
    return record;
};

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
