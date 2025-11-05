import type * as Models from './models';

export const updateQuoteIfNotEmpty = (quoteData: Models.LevelOneQuote, quote: Models.Quote) => {
    if (quote.bidPrice) {
        quoteData.bidPrice = quote.bidPrice;
    }
    if (quote.askPrice) {
        quoteData.askPrice = quote.askPrice;
    }
    if (quote.bidSize) {
        quoteData.bidSize = quote.bidSize;
    }
    if (quote.askSize) {
        quoteData.askSize = quote.askSize;
    }
}