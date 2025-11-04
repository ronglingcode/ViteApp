import type * as Models from '../models/models';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';

interface AlgoState {
    isLong: boolean,
    plan: TradingPlansModels.FirstBreakoutPlan,
    logTags: Models.LogTags,
}
export let algoStateBySymbol = new Map<string, AlgoState>();

export const stopAlgo = (symbol: string) => {
    algoStateBySymbol.delete(symbol);
}