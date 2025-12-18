import type * as TradingPlansModels from '../../models/tradingPlans/tradingPlansModels'
import * as AutoLevelMomentum from '../../algorithms/autoLevelMomentum';
import * as Firestore from '../../firestore';
import * as Models from '../../models/models';
import * as EntryRulesChecker from '../../controllers/entryRulesChecker';

export const validateCommonEntryRules = (symbol: string, isLong: boolean,
    entryPrice: number, stopOutPrice: number,
    useMarketOrder: boolean,
    keyLevel: TradingPlansModels.LevelArea,
    basePlan: TradingPlansModels.BasePlan,
    shouldCheckEntryDistance: boolean,
    shouldCheckVwap: boolean,
    logTags: Models.LogTags) => {
    // 1. entry price is outside key level
    if (!AutoLevelMomentum.isPriceOutsideKeyLevel(isLong, keyLevel, entryPrice)) {
        Firestore.logError(`${symbol} entry price ${entryPrice} is not outside key level`, logTags);
        return 0;
    };
    let initialSize = EntryRulesChecker.checkBasicGlobalEntryRules(
        symbol, isLong, entryPrice, stopOutPrice, useMarketOrder, basePlan, shouldCheckEntryDistance, logTags);
    let finalSize = initialSize;

    // VWAP check
    if (shouldCheckVwap) {
        let currentVwap = Models.getCurrentVwap(symbol);
        if ((isLong && entryPrice < currentVwap) || (!isLong && entryPrice > currentVwap)) {
            Firestore.logError(`checkRule: entry price ${entryPrice} is against vwap`, logTags);
            return 0;
        }
    }

    return finalSize;
}
