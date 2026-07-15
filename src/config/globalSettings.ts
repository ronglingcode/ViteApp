export const localhostWithPort: string = "http://localhost:3000";
export const batchCount: number = 10;
export const impliedMarketCapThresholdInBillions: number = 0.9;
export const premarketVolumeThresholdInMillions: number = 0.9;
export const premarketVolumeThresholdWhitelist: string[] = ['AVAV', 'AEHR'];
// true: offload time & sales socket receipt + parsing to a Web Worker (main app).
export const useMarketDataWorker: boolean = true;
// false: late T&S records still flow into chart/state updates.
export const skipLateTimeAndSalesChartUpdates: boolean = false;
export const allowLiveStats: boolean = true;
export const enableLeftPaneFeatures: boolean = true;
export const showBestPlans: boolean = enableLeftPaneFeatures && false;
export const showTradebooksForPosition: boolean = enableLeftPaneFeatures && false;
export const checkMaxEntryThreshold: boolean = false;
export const m15ChartEnabledAfterSeconds: number = 15 * 60;
export const enableBookmapSocket: boolean = true;
// true: Lite app renders the simple Lightweight Chart with order price lines.
// false: Lite app skips chart creation/updates and shows only the minimal trading UI.
export const showSimpleChart: boolean = false;
// Track and use the pre-breakout swing pullback low/high for Bookmap wall breaks.
export const enableBookmapWallBreakSwingPullback: boolean = false;
// false: remind only. true: block core/runner exit adjustments until coreInvalidationLevel is set.
export const blockExitAdjustmentsWithoutCoreInvalidationLevel: boolean = false;
// false: do not block. true: block exit adjustments until the active trade management card is committed.
export let blockExitAdjustmentsWithoutCommittedTradeManagementCard: boolean = false;

export const toggleBlockExitAdjustmentsWithoutCommittedTradeManagementCard = (): boolean => {
    blockExitAdjustmentsWithoutCommittedTradeManagementCard = !blockExitAdjustmentsWithoutCommittedTradeManagementCard;
    return blockExitAdjustmentsWithoutCommittedTradeManagementCard;
};

/** use custom risk level on top of stop loss level */
export const enableRiskLevel: boolean = false;
