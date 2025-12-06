export const long = `
If you saw price is now trending above moving average on 1-minute candles for 5 or more candles, 
you can suggest the trader hold the long position towards targets until it lose the moving average trend.
Conditions to fail the moving average trend can be:
- Candle closes below moving average
- Death cross:5-period moving average crosses below 9-period moving average.
`.trim();

export const short = `
If you saw price is now trending below moving average on 1-minute candles for 5 or more candles, 
you can suggest the trader hold the short position towards targets until it lose the moving average trend.
Conditions to fail the moving average trend can be:
- Candle closes above moving average
- Golden cross:5-period moving average crosses above 9-period moving average.
`.trim();