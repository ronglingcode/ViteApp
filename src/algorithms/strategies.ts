import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';

const R2Target: TradingPlansModels.ExitTargets = {
    initialTargets: {
        priceLevels: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        rrr: [0.9, 0.95, 1.5, 1.8, 1.85, 1.9, 1.95, 2, 2.5, 3],
        dailyRanges: [1, 1, 10, 10, 10, 10, 10, 10, 10, 10],
    },
};
