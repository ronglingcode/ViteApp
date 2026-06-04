export const localhostWithPort: string = "http://localhost:3000";
export const batchCount: number = 10;
export const marketDataSource: string = "massive"; // alpaca, massive
export const impliedMarketCapThresholdInBillions: number = 0.9;
export const premarketVolumeThresholdInMillions: number = 0.9;
export const competeForTimeAndSales: boolean = true;
// true: offload time & sales socket receipt + parsing to a Web Worker (main app).
export const useMarketDataWorker: boolean = true;
export const competeForTimeAndSalesWindowSeconds: number = 2 * 60;
// false: late T&S records still flow into chart/state updates.
export const skipLateTimeAndSalesChartUpdates: boolean = false;
export const allowLiveStats: boolean = true;
export const enableLeftPaneFeatures: boolean = true;
export const showBestPlans: boolean = enableLeftPaneFeatures && false;
export const showTradebooksForPosition: boolean = enableLeftPaneFeatures && false;
export const checkMaxEntryThreshold: boolean = false;
export const m15ChartEnabledAfterSeconds: number = 15 * 60;
export const enableBookmapSocket: boolean = true;
// Track and use the pre-breakout swing pullback low/high for Bookmap wall breaks.
export const enableBookmapWallBreakSwingPullback: boolean = false;
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
