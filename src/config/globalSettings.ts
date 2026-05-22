export const advancedLevelOneQuoteFeaturesEnabled: boolean = false;
export const localhostWithPort: string = "http://localhost:3000";
export const batchCount: number = 10;
export const marketDataSource: string = "massive"; // alpaca, massive
export const impliedMarketCapThresholdInBillions: number = 0.9;
export const premarketVolumeThresholdInMillions: number = 0.9;
export const competeForTimeAndSales: boolean = true;
export const competeForTimeAndSalesWindowSeconds: number = 2 * 60;
export const allowLiveStats: boolean = true;
export const enableLeftPaneFeatures: boolean = true;
export const enableAiAgent: boolean = enableLeftPaneFeatures && false;
export const showBestPlans: boolean = enableLeftPaneFeatures && false;
export const showTradebooksForPosition: boolean = enableLeftPaneFeatures && false;
export const showDataFeedsBar: boolean = false;
export const checkMaxEntryThreshold: boolean = false;
export const tradesPerSecondRollingWindowSeconds: number = 10; // Rolling window for tracking average trades per second
export const enableBookmapSocket: boolean = true;
// false: remind only. true: block core/runner exit adjustments until coreInvalidationLevel is set.
export const blockExitAdjustmentsWithoutCoreInvalidationLevel: boolean = false;
// false: do not block. true: block exit adjustments until the active trade management card is committed.
export let blockExitAdjustmentsWithoutCommittedTradeManagementCard: boolean = true;

export const toggleBlockExitAdjustmentsWithoutCommittedTradeManagementCard = (): boolean => {
    blockExitAdjustmentsWithoutCommittedTradeManagementCard = !blockExitAdjustmentsWithoutCommittedTradeManagementCard;
    return blockExitAdjustmentsWithoutCommittedTradeManagementCard;
};

/** use custom risk level on top of stop loss level */
export const enableRiskLevel: boolean = false;
