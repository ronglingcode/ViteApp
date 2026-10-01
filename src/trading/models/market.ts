/** Domain timestamps are Unix milliseconds; chart time conversion belongs to the UI. */
export interface Candle {
    symbol: string;
    datetime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    vwap: number;
}

export interface PremarketPerDayData { day: string; data: number }
export interface Trade {
    symbol: string;
    timestamp: number;
    price: number;
    size: number;
    sequence?: string;
    id?: string;
    exchange?: number;
    conditions: number[];
}
export interface PremarketDollarCollection {
    previousDaysDollar: PremarketPerDayData[];
    previousDaysDollarAverage: number;
    previousDaysDollarMedian: number;
    lastDayDollar: number;
    previousDaysShares: PremarketPerDayData[];
    lastDayShares: number;
    previousDaysSharesAverage: number;
    rvol: number;
}
