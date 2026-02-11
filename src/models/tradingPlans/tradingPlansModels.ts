
export enum DailySetup {
    'Unknown',
    'TwoWayOpen',
    'LevelNearAboveRange',
    'LevelNearBelowRange',
}
export interface TradingSettings {
    useSingleOrderForEntry: boolean,
    /**
     * snap to the high/low of the closed candle for moving stops
     */
    snapMode: boolean,
}

export interface Analysis {
    dailyChartStory: number,
    gap: Gap,
    dailySetup: DailySetup,
    /**
     * 0: no defer, 1: defer 1 second after open, -1: invalid value.
     */
    deferTradingInSeconds: number,
    /**
     * 0: no stop, 1: stop 1 second after open, -1: invalid value.
     */
    stopTradingAfterSeconds: number,

    singleMomentumKeyLevel: LevelArea[],
    /**
     * 1: use premarket high, -1: use premarket low, 0: not use premarket levels
     */
    usePremarketKeyLevel: number,
    zoneNearEdge: ZoneNearEdge,
    dualMomentumKeyLevels: number[],
    watchAreas: number[],
    noTradeZones: LevelArea[],
}
export interface ZoneNearEdge {
    zoneIsFar: boolean,
    high: number,
    low: number,
}
export interface Gap {
    pdc: number,
}
export interface TradingPlans {
    symbol: string,
    analysis: Analysis,
    autoFlip: boolean,
    isFutures?: boolean,
    vwapCorrection: VwapCorrection,
    atr: AverageTrueRange,
    marketCapInMillions: number,
    fixedQuantity?: number,
    keyLevels: keyLevels,
    defaultTargets: ExitTargets,
    defaultConfigs: PlanConfigs,
    tradebooksConfig: TradebooksConfig,
    long: SingleDirectionPlans,
    short: SingleDirectionPlans,
};
export interface TradebookCommonConfig {
    enabled?: number,
}
export interface VwapBounceFailConfig extends TradebookCommonConfig {
    waitForClose: boolean,
}
export interface BreakoutTradebookConfig extends TradebookCommonConfig {
    waitForClose: boolean,
    allowCloseWithin: boolean,
}
export interface LevelVwapOpenConfig {
    shortVwapContinuation: TradebookCommonConfig,
    longEmergingStrengthBreakout: BreakoutTradebookConfig,
}
export interface TradebooksConfig {
    level_vwap_open: LevelVwapOpenConfig,
    level_open_vwap: LevelOpenVwapConfig,
    open_level_vwap: OpenLevelVwapConfig,
    vwap_level_open: VwapLevelOpenConfig,
    vwap_open_level: VwapOpenLevelConfig,
    open_vwap_level: OpenVwapLevelConfig,
}
export interface VwapLevelOpenConfig {
    shortOpenDrive: TradebookCommonConfig,
    longVwapPushdownFail: VwapBounceFailConfig,
}
export interface VwapOpenLevelConfig {
    shortBelowWaterBreakout: BreakoutTradebookConfig,
    longVwapPushdownFail: VwapBounceFailConfig,
}
export interface OpenVwapLevelConfig {
    longVwapContinuation: TradebookCommonConfig,
    shortEmergingWeaknessBreakdown: BreakoutTradebookConfig,
}
export interface LevelOpenVwapConfig {
    shortVwapBounceFail: VwapBounceFailConfig,
    longAboveWaterBreakout: BreakoutTradebookConfig,
    shortOpenFlush: TradebookCommonConfig,
    longVwapScalp: TradebookCommonConfig,
}
export interface OpenLevelVwapConfig {
    shortVwapBounceFail: VwapBounceFailConfig,
    longOpenDrive: TradebookCommonConfig,
}
export interface AverageTrueRange {
    average: number,
    mutiplier: number,
    minimumMultipler: number,
    maxRisk: number,
    maxQuantity: number,
}
export interface VwapCorrection {
    volumeSum: number,
    tradingSum: number,
    open: number,
}

export interface SingleDirectionPlans {
    enabled: boolean,
    firstTargetToAdd: number,
    finalTargets: SingleExitTarget[],
    /* used strategies begin */
    levelMomentumPlan?: LevelMomentumPlan,
    reversalPlan?: ReversalPlan,
    vwapBounceFailPlan?: VwapBounceFailPlan,
    vwapScalpPlan?: VwapScalpPlan,
    allTimeHighVwapContinuationPlan?: AllTimeHighVwapContinuationPlan,
    gapAndCrapAccelerationPlan?: GapAndCrapAccelerationPlan,
    gapAndCrapPlan?: GapAndCrapPlan,
    gapAndGoPlan?: GapAndGoPlan,
    gapDownAndGoDownPlan?: GapDownAndGoDownPlan,
    gapDownAndGoUpPlan?: GapDownAndGoUpPlan,
    /* used strategies end */

    profitTakingFade60Plan?: ProfitTakingFade60Plan,
    openDriveContinuation60Plan?: OpenDriveContinuation60Plan,
    retracement?: RetracementPlan,

    breakoutAlgo?: BreakoutAlgo,
    levelBreakout?: LevelBreakoutPlan,

    deferredBreakoutPlan?: DeferredBreakoutPlan,
    redtoGreenPlan?: RedToGreenPlan,
    firstBreakoutPlan?: FirstBreakoutPlan,
    firstNewHighPlan?: FirstNewHighPlan,
    premarketPlan?: PremarketPlan,

};

export interface VwapBounceFailPlan extends BasePlan { }
export interface VwapScalpPlan extends BasePlan {
    threshold: number,
    originalKeyLevel: number,
    strongReasonToUseThisLevel: string,
}
export interface AllTimeHighVwapContinuationPlan extends BasePlan {
    allTimeHigh: number,
}
export interface GapAndCrapAccelerationPlan extends BasePlan {
    accelerationLevel: number,
    defaultRiskLevel: number,
}
export interface keyLevels {
    otherLevels?: number[];
    momentumStartForLong: number,
    momentumStartForShort: number,
};
export enum PlanType {
    LevelMomentum = 'LevelMomentum',
    ProfitTakingFade60 = 'ProfitTakingFade60',
    OpenDriveContinuation60 = 'OpenDriveContinuation60',
    OpenChase = 'OpenChase',
    Retracement = 'Retracement',
    NewsBreakout = 'NewsBreakout',
    RedToGreen = 'RedToGreen',
    FirstNewHigh = 'FirstNewHigh',
    BreakoutAlgo = 'BreakoutAlgo',
    LevelBreakout = 'LevelBreakout',
    DeferredBreakout = 'DeferredBreakout',
    VwapBounceFail = 'VwapBounceFail',
    VwapCrossSuccess = 'VwapCrossSuccess',
};
export interface BasePlan {
    targets: ExitTargets,
    planConfigs: PlanConfigs,
    planType?: PlanType,
    timeframe?: number,
    entryMethod?: string,
    defaultRiskLevel?: number,
};
export interface PlanConfigs {
    size: number,
    sizingCount?: number,
    /**
     * 0: no defer, 1: defer 1 second after open, -1: invalid value.
     */
    deferTradingInSeconds: number,
    /**
     * 0: no stop, 1: stop 1 second after open, -1: invalid value.
     */
    stopTradingAfterSeconds: number,
    requireReversal: boolean,
    alwaysAllowFlatten: boolean,
    alwaysAllowMoveStop: boolean,
    setupQuality: SetupQuality,
}
export interface LevelMomentumPlan extends BasePlan {
    enableAutoTrigger: boolean,
}
export interface PremarketPlan extends BasePlan { }
export interface ProfitTakingFade60Plan extends BasePlan {
    enableAutoTrigger: boolean,
    onlyIfOpenBelow: number,
}
export interface GapAndGoPlan extends BasePlan {
    /** the min support on daily chart, below it, we cannot long */
    minDailySupport: number,
    /** the high from recent pullback */
    recentPullback?: number,
    /** number of days of the condition and its edge price */
    nearAboveConsolidationRange?: string,
    /** number of days of the condition and its edge price */
    nearBelowConsolidationRangeTop?: string,
    /** the description of the previous key event */
    nearPreviousKeyEventLevel?: string,
    /** breakout price of inside bar  */
    previousInsideDay?: number,
    /** price of all time high */
    allTimeHigh?: number,
}
export interface GapAndCrapPlan extends BasePlan {
    /** the max resistance on daily chart, above it, we cannot short */
    resistance: LevelArea[],
    /** the number of days in a row that form this heavy supply zone */
    heavySupplyZoneDays?: number,
    /** the length of such recent rally */
    recentRallyWithoutPullback?: string,
    /** the extended gap up in ATR */
    extendedGapUpInAtr?: number,
    earnings?: string,
    /** the price of the top edge of current range */
    topEdgeOfCurrentRange?: number,
    /** description of the previous event */
    nearBelowPreviousEventKeyLevel?: string
}
export interface GapDownAndGoDownPlan extends BasePlan {
}
export interface GapDownAndGoUpPlan extends BasePlan {
    support: LevelArea[],
}
export interface OpenDriveContinuation60Plan extends BasePlan {
    disableIfOpenWorseThanPrice: number,
    requireOpenBetterThanVwap: boolean,
}

export interface AlgoPlan extends BasePlan {
    expirationInSeconds: number,
    allowPremarket: boolean,
}
export interface BreakoutAlgo extends AlgoPlan {
    entryPrice: number,
    useHighLowOfDay: boolean,
}
export interface ReversalPlan extends BasePlan {
    keyLevel: number,
    requireLevelTouch: boolean,
}
export interface RetracementPlan {
    entryAreas: RetracementArea[];
    lastDefense: number,
    vwapArea?: RetracementArea,
    openPriceArea?: RetracementArea,
};
export interface RetracementArea extends BasePlan {
    priceArea: PriceArea,
    stopPrice: number,
}
export interface LevelBreakoutPlan extends BasePlan {
    entryPrice: number,
}
export interface FirstRetracementPlan extends BasePlan { }
export interface RedToGreenPlan extends BasePlan {
    strictMode: boolean,
    considerCurrentCandleAfterOneMinute: boolean,
}
export interface FirstBreakoutPlan extends BasePlan {

}
export interface FirstNewHighPlan extends BasePlan {
    enableAutoTrigger: boolean,
}
export interface DeferredBreakoutPlan extends BasePlan { }
export interface ProfitTargets {
    targets: number[],
    /**
     * Probability from 0 to 1 (100%) of how likely it will blow past those levels
     */
    willBlowPastThoseLevels: number,
    summary: string,
}
export interface ExitTargets {
    initialTargets: ExitTargetsSet,
    minimumTargets?: ExitTargetsSet,
    trail5Count: number,
    trail15Count: number,
}
export interface SingleExitTarget {
    partialCount: number,
    rrr: number,
    atr: number,
    level: number,
    text: string,
    label?: string,
}
export interface ExitTargetsSet {
    priceLevels: number[],
    rrr: number[],
    dailyRanges: number[],
}
export interface PriceArea {
    priceLevel: number,
    upperRoom: number,
    lowerRoom: number,
}
export interface LevelArea {
    high: number,
    low: number,
}

export enum SetupQuality {
    Unknown = "Unknown",
    /**
     * Half out at 1R and scale out into 2R
     */
    Scalp = "Scalp",
    /**
     * 2-leg push
     */
    Move2Move = "Move2Move",

    /**
     * Get in on 1-minute chart and get out on 5-minute chart
     */
    HigherTimeFrameTrend = "HigherTimeFrameTrend",
    HoldToDayClose = "HoldToDayClose",
    /**
     * Hold last few for swing or too extended intraday move
     */
    SwingHold = "SwingHold",
};

export enum PremarketVolumeScore {
    Zero_Low_Or_Normal = 0,
    One_Higher_Than_Normal = 1,
    Two_Extremely_High = 2,
    Unknown = -1,
}
