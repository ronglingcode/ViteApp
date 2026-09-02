export const localhostWithPort: string = "http://localhost:3000";
export const batchCount: number = 10;
export const impliedMarketCapThresholdInBillions: number = 0.9;
export const premarketVolumeThresholdInMillions: number = 0.9;
export const premarketVolumeThresholdWhitelist: string[] = [];
// Block trading when the watchlist contains more than this many stocks.
export const maxTradableStocksCount: number = 2; // do not change, trade management requires full attention
// true: offload time & sales socket receipt + parsing to a Web Worker (main app).
export const useMarketDataWorker: boolean = true;
// Capture the worker-to-main market-data batches to local ProxyServer for replay.
export const enableReplayCapture: boolean = true;
// false: late T&S records still flow into chart/state updates.
export const skipLateTimeAndSalesChartUpdates: boolean = false;
export const allowLiveStats: boolean = true;
export const enableLeftPaneFeatures: boolean = true;
export const showBestPlans: boolean = enableLeftPaneFeatures && false;
export const showTradebooksForPosition: boolean = enableLeftPaneFeatures && false;
export const checkMaxEntryThreshold: boolean = false;
export const m15ChartEnabledAfterSeconds: number = 15 * 60;
export const enableBookmapSocket: boolean = true;
export const enableCamPivots: boolean = true;
// Controls only candlestick rendering; one-minute candles are still collected and processed.
export const showCandles: boolean = true;
// true: Lite app renders the simple Lightweight Chart with order price lines.
// false: Lite app skips chart creation/updates and shows only the minimal trading UI.
export const showSimpleChart: boolean = false;
export const notificationSettings = {
    enabled: true,
    soundEnabled: true,
    speechEnabled: true,
    firstTouchToVwap: {
        enabled: true,
    },
};
// Track and use the pre-breakout swing pullback low/high for Bookmap wall breaks.
export const enableBookmapWallBreakSwingPullback: boolean = false;
// Master switch for protected exit-partial price enforcement and the Bookmap exit-plan threshold popup/update flow.
export const enableCoreTargetExitFeature: boolean = false;
/** use custom risk level on top of stop loss level */
export const enableRiskLevel: boolean = false;
