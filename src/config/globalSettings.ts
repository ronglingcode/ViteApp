export const advancedLevelOneQuoteFeaturesEnabled: boolean = false;
export const localhostWithPort: string = "http://localhost:3000";
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
export const enableBookmap: boolean = false;
export const enableBookmapHeatmap: boolean = enableBookmap && true;
export const bookmapWidth: number = 150;
export const enableDatabentoBookData: boolean = enableBookmap && false;
export const databentoDataset: string = "XNAS.ITCH";
export const databentoSchema: string = "mbo"; // "mbo" for full depth, "mbp-10" for top 10 levels
export const enableBookmapSocket: boolean = true;