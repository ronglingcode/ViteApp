import type { Tradebook } from './baseTradebook';
import * as Firestore from '../firestore';
import * as Models from '../models/models';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as GapAndCrapAlgo from '../algorithms/gapAndCrapAlgo';

/** Shared short entry path: gap-and-crap rules + global sizing + breakout entry submit. Not a tradebook. */
export function runGapAndCrapBookmapShortEntryPipeline(
    tradebook: Tradebook,
    symbol: string,
    basePlan: TradingPlansModels.BasePlan,
    dryRun: boolean,
    useMarketOrder: boolean,
    entryPrice: number,
    stopOutPrice: number,
    riskMultipler: number,
    logTags: Models.LogTags
): number {
    let riskLevelPrice = stopOutPrice;
    if (!GapAndCrapAlgo.allowEntryRulesForGapAndCrap(symbol, entryPrice, logTags)) {
        return 0;
    }
    let allowedSize = EntryRulesChecker.checkBasicGlobalEntryRules(
        symbol,
        false,
        entryPrice,
        stopOutPrice,
        useMarketOrder,
        basePlan,
        false,
        logTags
    );

    if (allowedSize === 0) {
        Firestore.logError(`${symbol} not allowed entry`, logTags);
        return 0;
    }
    allowedSize = allowedSize * riskMultipler;
    let planCopy = JSON.parse(JSON.stringify(basePlan)) as TradingPlansModels.BasePlan;
    tradebook.submitEntryOrdersBase(
        dryRun,
        useMarketOrder,
        entryPrice,
        stopOutPrice,
        riskLevelPrice,
        allowedSize,
        planCopy,
        logTags
    );

    return allowedSize;
}
