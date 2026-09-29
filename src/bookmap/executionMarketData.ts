/** Small synchronous bridge: market-data handlers never wait for account refreshes. */
export interface ExecutionMarketData {
    symbol: string;
    currentPrice: number;
    bid: number;
    ask: number;
    highOfDay: number;
    lowOfDay: number;
}

let publisher: ((data: ExecutionMarketData) => void) | undefined;
export const registerExecutionMarketDataPublisher = (publish: (data: ExecutionMarketData) => void) => {
    publisher = publish;
};
export const publishExecutionMarketData = (symbol: string, currentPrice: number, data: {
    bidPrice: number; askPrice: number; highOfDay: number; lowOfDay: number;
}) => {
    publisher?.({ symbol, currentPrice, bid: data.bidPrice, ask: data.askPrice,
        highOfDay: data.highOfDay, lowOfDay: data.lowOfDay });
};
