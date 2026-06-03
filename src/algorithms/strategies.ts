import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';

const R2Target: TradingPlansModels.ExitTargets = {
    initialTargets: {
        priceLevels: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        rrr: [0.9, 0.95, 1.5, 1.8, 1.85, 1.9, 1.95, 2, 2.5, 3],
        dailyRanges: [1, 1, 10, 10, 10, 10, 10, 10, 10, 10],
    },
};
export const overrideTradingPlans = (plan: TradingPlansModels.BasePlan,
    planType: TradingPlansModels.PlanType) => {
    plan.planType = planType;
    // https://sunrisetrading.atlassian.net/browse/TPS-393
    // be consistent with sizing to keep it simple
    //plan.planConfigs.size = 0.27;
    /*
    plan.planConfigs.alwaysAllowStopOutOrFlatten = false;
    
    for (let i = 5; i < plan.targets.initialTargets.dailyRanges.length; i++) {
        plan.targets.initialTargets.dailyRanges[i] = 2;
        plan.targets.initialTargets.rrr[i] = 1.9;
    }
        */
}
