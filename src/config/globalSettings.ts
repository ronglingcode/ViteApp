export const advancedLevelOneQuoteFeaturesEnabled: boolean = false;
export const losthostWithPort: string = "http://localhost:3000";
export const batchCount: number = 10;
export const marketDataSource: string = "massive"; // alpaca, massive
export const impliedMarketCapThresholdInBillions: number = 0.9;
export const premarketVolumeThresholdInMillions: number = 0.9;
export const competeForTimeAndSales: boolean = true;
export const allowLiveStats: boolean = true;
export const enableLeftPaneFeatures: boolean = false;
export const enableAiAgent: boolean = enableLeftPaneFeatures && true;
export const showBestPlans: boolean = enableLeftPaneFeatures && true;
export const showTradebooksForPosition: boolean = enableLeftPaneFeatures && true;
export const showDataFeedsBar: boolean = false;
export const checkMaxEntryThreshold: boolean = false;
export const tradesPerSecondRollingWindowSeconds: number = 10; // Rolling window for tracking average trades per second

// Bookmap features
export const enableBookmap: boolean = true;
export const enableBookmapHeatmap: boolean = false;  // enable after book data format is known
export const enableBookDataLogging: boolean = true;   // Phase 1: log raw Schwab book data
export const bookmapWidth: number = 150;