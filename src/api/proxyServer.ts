import * as Helper from '../utils/helper';

export const saveLevelOneQuote = async (symbol: string,
    bidPrice: number, bidSize: number, askPrice: number, askSize: number) => {
    let milliseconds = Helper.getMillisecondsSinceMarketOpen(new Date());
    let data = {
        symbol: symbol,
        bidPrice: bidPrice,
        bidSize: bidSize,
        askPrice: askPrice,
        askSize: askSize,
        millisecondsSinceMarketOpen: milliseconds
    };

    try {
        const response = await fetch('http://localhost:5000/save/level1quote', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save quote');
        }

        return await response.json();
    } catch (error) {
        console.error('Error sending level 1 quote:', error);
        throw error;
    }
}