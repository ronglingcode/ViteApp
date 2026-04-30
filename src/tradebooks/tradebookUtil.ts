import * as Helper from '../utils/helper';
import * as Models from '../models/models';

export const getTightStopLevelsForTrend = (symbol: string, isLong: boolean) => {
    let tightStopLevels: Models.DisplayLevel[] = [];
    let seconds = Helper.getSecondsSinceMarketOpen(new Date());
    let candles = Models.getUndefinedCandlesSinceOpen(symbol);
    if (seconds < 0) {
        return tightStopLevels;
    } else if (seconds <= 60) {
        let firstCandle = candles[0];
        if (firstCandle) {
            let bodyHigh = Math.max(firstCandle.open, firstCandle.close);
            let bodyLow = Math.min(firstCandle.open, firstCandle.close);
            let tightStop = isLong ? bodyLow : bodyHigh;
            tightStopLevels.push({ level: tightStop, title: `tight stop, re-entry after shakeout` });
        }
    } else if (seconds <= 2 * 60) {
        let firstCandle = candles[0];
        if (firstCandle) {
            let bodyHigh = Math.max(firstCandle.open, firstCandle.close);
            let bodyLow = Math.min(firstCandle.open, firstCandle.close);
            let tightStop = isLong ? bodyLow : bodyHigh;
            let betterStop = isLong ? firstCandle.low : firstCandle.high;
            tightStopLevels.push({ level: tightStop, title: `tight stop 50%, re-entry after shakeout` });
            tightStopLevels.push({ level: betterStop, title: `better stop` });
        }
    } else if (seconds <= 5 * 60) {
        let previousClosedCandle = candles[candles.length - 2];
        if (previousClosedCandle) {
            let tightStop = isLong ? previousClosedCandle.low : previousClosedCandle.high;
            let text = isLong ? 'first new low' : 'first new high';
            tightStopLevels.push({ level: tightStop, title: `tight stop ${text}, re-entry after shakeout` });
        }
    }
    return tightStopLevels;
};

export const setButtonStatus = (button: HTMLElement, status: string): void => {
    button.classList.remove("active");
    button.classList.remove("inactive");
    button.classList.remove("degraded");
    button.classList.add(status);
};
