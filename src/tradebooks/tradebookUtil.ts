import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as Helper from '../utils/helper';
import * as Models from '../models/models';

export const buildTradeManagementInstructions = (
    isLong: boolean, instructions: Map<string, string[]>,
    exitsForLong: string[], exitsForShort: string[],
    profitTakingForLong: string[], profitTakingForShort: string[],
) => {
    if (isLong) {
        instructions.set('Conditions to Exit', exitsForLong);
        instructions.set('Profit Taking', profitTakingForLong);
    } else {
        instructions.set('Conditions to Exit', exitsForShort);
        instructions.set('Profit Taking', profitTakingForShort);
    }
}

export const addTradeManagementInstructions = (
    title: string, isLong: boolean, instructions: Map<string, string[]>,
    contentForLong: string[], contentForShort: string[],
) => {
    if (isLong) {
        instructions.set(title, contentForLong);
    } else {
        instructions.set(title, contentForShort);
    }
}
export const setlevelToAddInstructions = (
    symbol: string, isLong: boolean, instructions: Map<string, string[]>,
) => {
    let topPlan = TradingPlans.getTradingPlans(symbol);
    let directionalPlan = isLong ? topPlan.long : topPlan.short;

    let levelToAdd = directionalPlan.firstTargetToAdd;
    if (levelToAdd > 0) {
        let sectionKey = "add or re-entry";
        let section = instructions.get(sectionKey);
        if (section) {
            section.push(levelToAdd.toString());
        } else {
            instructions.set(sectionKey, [levelToAdd.toString()]);
        }
    }
}

export const setFinalTargetInstructions = (
    symbol: string, isLong: boolean, instructions: Map<string, string[]>,
) => {
    let topPlan = TradingPlans.getTradingPlans(symbol);
    let directionalPlan = isLong ? topPlan.long : topPlan.short;
    let finalTargets = directionalPlan.finalTargets;
    instructions.set('Final Target', finalTargets.map(target => target.text));
}

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
}

export const setButtonStatus = (button: HTMLElement, status: string): void => {
    button.classList.remove("active");
    button.classList.remove("inactive");
    button.classList.remove("degraded");
    button.classList.add(status);
};