import * as TrendMovingAverage from './trendMovingAverage';
export const tradebookText = `
# Setup

The idea behind this setup is profit taking. We expect big players will take profit right at the open and they don’t even care what will happen for intraday, just putting market order immediately at the open. We will use those reasons be the requirement of this setup. It needs to have both of the following reasons

1. bag holders from the past, any of the following
    1. the long term trend of the stock is going down
    2. recent trend of the stock is going down
    3. gap up into a heavy resistance on the daily chart
2. big gain in short amount of time
    1. gap up is 2+ ATR for small cap and 1+ ATR for large cap

# A+ Conditions

- A large gap up of multiple ATR
- rally in premarket
    - the breakout trend that I was looking for after open already rallied during premarket
    - a new premarket high in the last 5 minutes before open
    - opened extended above vwap. 1 ATR for small cap and 0.5 ATR for large cap

# Entry Patterns

Entry needs to happen in the first 5 minutes. Usually in the first 1-2 minutes.

There are multiple ways to enter short. Meet any of the condition, we will allow 25% size. If meet multiple, max at 50% size

### Entry 1: false premarket high breakout

[Green to Red < 60 False Level Breakout]

Once price open and get above premarket high, sell stop at low of the day

### Entry 2: extended from vwap

Risk 40%

Open price must be high above last vwap before open. 

- small cap, more than 1 ATR above
- large cap, more than 0.5 ATR above
1. If open with a pop, sell stop order at low of the day
2. if open with a pause, market open in or sell stop order at lower of the day

If both meet the conditions for entry 1 and 2, risk 80%.

### Entry 3: VWAP push down

Risk 50%

1. open price is above vwap and the 1st 1-minute candle closed below vwap, enter short in the 2nd minute.

Entry 3 is TBD, need more examples, and consider whether this can just be vwap bounce fail

Bonus points for entry 1 and 2, double original risk if:

1. make fresh premarket high in the last 5 minutes before open

## Stop Loss

The higher price of 

- high of day
- news high level/premarket high

# Trade Management

Partial 50% to vwap. Hold the rest for vwap bounce fail. If vwap bounce fail confirmed, add back some previous partials.
- ${TrendMovingAverage.short}
`.trim();