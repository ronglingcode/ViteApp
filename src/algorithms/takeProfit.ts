import * as Helper from '../utils/helper';
import * as Models from '../models/models';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as TradingState from '../models/tradingState';
import * as Firestore from '../firestore';
import * as MinimumTarget from './minimumTarget';
import * as GlobalSettings from '../config/globalSettings';
export interface ProfitTargetByPercentage {
    price: number,
    percentage: number,
}

export const BatchCount = GlobalSettings.batchCount;
export const SizePerBatch = 1 / BatchCount;

export const getTargetPriceByRiskReward = (symbol: string, isLong: boolean,
    basePrice: number, stopOut: number, ratio: number) => {
    let risk = Math.abs(basePrice - stopOut);
    let target = isLong ? basePrice + ratio * risk : basePrice - ratio * risk;
    return Helper.roundPrice(symbol, target);
}

export const getInitialProfitTargets = (symbol: string, totalShares: number, basePrice: number, stopOut: number,
    exitTargets: TradingPlansModels.ExitTargetsSet, logTags: Models.LogTags) => {
    let isLong = basePrice > stopOut;
    let atr = Models.getAtr(symbol);

    let initialTargets = MinimumTarget.getProfitTargetsListFromConfig(
        symbol, isLong, basePrice, stopOut, BatchCount, atr, false, exitTargets, "initial profit", logTags,
    );
    let minTarget = getTargetPriceByRiskReward(symbol, isLong, basePrice, stopOut, 0.5);
    let profitTargets: ProfitTargetByPercentage[] = [];
    initialTargets.forEach(t => {
        let finalTarget = isLong ? Math.max(t, minTarget) : Math.min(t, minTarget);
        profitTargets.push({
            price: finalTarget,
            percentage: SizePerBatch,
        });
    });

    return applyProfitStrategyByPercentage(symbol, totalShares, basePrice, stopOut, profitTargets);
};

// split into 3. all use about 3R because it's meant for trading breaking news with large range.
// meant to be adjusted manually after the trade entry without restrictions
export const getProfitTargetsForFixedQuantity = (
    symbol: string, totalShares: number, entryPrice: number, stopOutPrice: number,
    exitTargets: TradingPlansModels.ExitTargets) => {
    let rrr = [2.5, 3.0, 3.5];
    let percentage = [0.34, 0.33, 0.33];
    let risk = entryPrice - stopOutPrice;
    let profitTargetByPercentage: ProfitTargetByPercentage[] = [];

    for (let i = 0; i < rrr.length; i++) {
        let target = entryPrice + risk * rrr[i];
        target = Helper.roundPrice(symbol, target);
        profitTargetByPercentage.push({
            price: target,
            percentage: percentage[i]
        })
    }
    return applyProfitStrategyByPercentage(symbol, totalShares, entryPrice, stopOutPrice, profitTargetByPercentage);
};

export const applyProfitStrategyByPercentage = (
    symbol: string, totalShares: number, basePrice: number, stopOut: number, profitTargets: ProfitTargetByPercentage[]) => {
    console.log(`total shares ${totalShares}`);
    console.log(profitTargets);
    let totalPercentages = 0.0;
    let results: Models.ProfitTarget[] = [];
    let sum = 0;
    for (let i = 0; i < profitTargets.length; i++) {
        let target = profitTargets[i].price;
        let percent = profitTargets[i].percentage;
        totalPercentages += percent;
        let shares = Math.floor(totalShares * percent);
        if (shares <= 0) {
            if (i == 0)
                shares = 1;
            else
                continue;
        }
        if (sum + shares > totalShares) {
            continue;
        }
        results.push({
            target: target,
            quantity: shares
        });
        sum += shares;
    }

    let leftOver = totalShares - sum;
    let pos = 0;
    while (leftOver > 0) {
        results[pos].quantity++;
        pos = (pos + 1) % results.length;
        leftOver--;
    }

    return results;
};

export const isCurrentTradeFirstSignal = (symbol: string, isLong: boolean) => {
    let currentTrade = Models.getCurrentOpenTrade(symbol);
    if (!currentTrade || currentTrade.entries.length == 0) {
        return false;
    }
    let entryTime = currentTrade.entries[0].time;
    let firstEntry = currentTrade.entries[0];
    for (let i = 1; i < currentTrade.entries.length; i++) {
        let newTime = currentTrade.entries[i].time;
        if (newTime < entryTime) {
            entryTime = newTime;
            firstEntry = currentTrade.entries[i];
        }
    }
    let secondsSinceOpen = Helper.getSecondsSinceMarketOpen(entryTime);
    if (secondsSinceOpen < 60) {
        return true;
    }

    let state = TradingState.getSymbolState(symbol);
    if (state.activeBasePlan?.planType == TradingPlansModels.PlanType.FirstNewHigh) {
        return true;
    }
    if (state.activeBasePlan?.planType == TradingPlansModels.PlanType.RedToGreen && secondsSinceOpen < 120) {
        let candles = Models.getUndefinedCandlesSinceOpen(symbol);
        if (candles.length > 0) {
            let openCandle = candles[0];
            let openPrice = openCandle.open;
            let closePrice = openCandle.close;
            if ((isLong && openPrice > closePrice) ||
                (!isLong && openPrice < closePrice)) {
                return true;
            }
        }
    }
    return false;
}
