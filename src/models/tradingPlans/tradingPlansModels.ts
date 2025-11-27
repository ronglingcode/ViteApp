
export interface TradingSettings {
    useSingleOrderForEntry: boolean,
    /**
     * snap to the high/low of the closed candle for moving stops
     */
    snapMode: boolean,
}

export interface Analysis {
    isFreshNews: boolean,
    /**
     * 0: low or normal, 1: higher than normal, 2: extremely high
     */
    premarketVolumeScore: PremarketVolumeScore,
    dailyChartStory: number,
    gap: Gap,
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
    profitTargetsForLong: ProfitTargets,
    profitTargetsForShort: ProfitTargets,
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
    enabled: number,
}
export interface LevelVwapOpenConfig {
    shortVwapContinuation: TradebookCommonConfig,
    longEmergingStrengthBreakout: TradebookCommonConfig,
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
    longVwapPushdownFail: TradebookCommonConfig,
}
export interface VwapOpenLevelConfig {
    shortBelowWaterBreakout: TradebookCommonConfig,
    longVwapPushdownFail: TradebookCommonConfig,
}
export interface OpenVwapLevelConfig {
    longVwapContinuation: TradebookCommonConfig,
    shortEmergingWeaknessBreakdown: TradebookCommonConfig,
}
export interface LevelOpenVwapConfig {
    shortVwapBounceFail: TradebookCommonConfig,
    longAboveWaterBreakout: TradebookCommonConfig,
    shortOpenFlush: TradebookCommonConfig,
    longVwapScalp: TradebookCommonConfig,
}
export interface OpenLevelVwapConfig {
    shortVwapBounceFail: TradebookCommonConfig,
    longOpenDrive: TradebookCommonConfig,
}
export interface AverageTrueRange {
    average: number,
    mutiplier: number,
    minimumMultipler: number,
    maxRisk: number
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
    openProfitTakingPlan?: OpenProfitTakingPlan,
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
export interface OpenProfitTakingPlan extends BasePlan {
    defaultRiskLevel: number,
    mustOpenWithin: number,
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
