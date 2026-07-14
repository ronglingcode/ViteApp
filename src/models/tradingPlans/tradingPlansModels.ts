export interface TradingSettings {
    useSingleOrderForEntry: boolean,
    /**
     * snap to the high/low of the closed candle for moving stops
     */
    snapMode: boolean,
}

export interface Analysis {
    gap: Gap,
    singleMomentumKeyLevel: LevelArea[],
    /**
     * 1: use premarket high, -1: use premarket low, 0: not use premarket levels
     */
    usePremarketKeyLevel: number,
    zoneNearEdge: ZoneNearEdge,
    dualMomentumKeyLevels: number[],
    watchAreas: number[],
    noTradeZones: LevelArea[],
    /** Default risk level labels for chooseRiskLevel (moved from BasePlan). */
    defaultRiskLevels: string[],
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
    isFutures?: boolean,
    vwapCorrection: VwapCorrection,
    atr: AverageTrueRange,
    marketCapInMillions: number,
    fixedQuantity?: number,
    keyLevels: keyLevels,
    defaultConfigs: PlanConfigs,
    tradebooksConfig: TradebooksConfig,
    rangeBoundReversalPlan?: RangeBoundReversalPlan,
    long: SingleDirectionPlans,
    short: SingleDirectionPlans,
};
export interface TradebookCommonConfig {
    enabled?: number,
}
export interface VwapBounceFailConfig extends TradebookCommonConfig {
    waitForClose: boolean,
}
export interface TradebooksConfig {
    level_open_vwap: LevelOpenVwapConfig,
    open_level_vwap: OpenLevelVwapConfig,
    vwap_level_open: VwapLevelOpenConfig,
    vwap_open_level: VwapOpenLevelConfig,
}
export interface VwapLevelOpenConfig {
    shortOpenDrive: TradebookCommonConfig,
    longVwapPushdownFail: VwapBounceFailConfig,
}
export interface VwapOpenLevelConfig {
    longVwapPushdownFail: VwapBounceFailConfig,
}
export interface LevelOpenVwapConfig {
    shortVwapBounceFail: VwapBounceFailConfig,
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
    vwapBounceFailPlan?: VwapBounceFailPlan,
    allTimeHighVwapContinuationPlan?: AllTimeHighVwapContinuationPlan,
    gapAndCrapPlan?: GapAndCrapPlan,
    gapAndGoPlan?: GapAndGoPlan,
    gapGiveAndGoPlan?: GapGiveAndGoPlan,
    gapDownAndGoDownPlan?: GapDownAndGoDownPlan,
    gapDownAndGoUpPlan?: GapDownAndGoUpPlan,
    bookmapBigWallBreakdownFailLongPlan?: BookmapBigWallBreakdownFailLongPlan,
    /* used strategies end */

};

export interface VwapBounceFailPlan extends BasePlan { }
export interface AllTimeHighVwapContinuationPlan extends BasePlan {
    allTimeHigh: number,
}
export interface KeyLevel {
    price: number,
    label: string,
}
export interface KeyZone {
    high: number,
    low: number,
    label: string,
    color: string,
}
export interface keyLevels {
    otherLevels?: KeyLevel[];
    zones: KeyZone[];
};

export interface BasePlan {
    planConfigs: PlanConfigs,
    timeframe?: number,
    entryMethod?: string,
    coreTarget: number,
    coreCount: number,
    runnerCount: number,
    runnerTriggerCondition: string,
};
export interface RangeBoundReversalPlan extends BasePlan {
    /** Support zone for long Bookmap bid reversals. */
    support: LevelArea,
    /** Resistance zone for short Bookmap offer rejections. */
    resistance: LevelArea,
}
export interface PlanConfigs {
    size: number,
    sizingCount?: number,
    requireReversal: boolean,
}
export interface LevelMomentumPlan extends BasePlan {
}
export interface PremarketPlan extends BasePlan { }
export interface GapGiveAndGoPlan extends BasePlan {
    /** the min support on daily chart, below it, we cannot long */
    support: LevelArea,
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
export interface GapAndGoPlan extends BasePlan {
    /** the min support on daily chart, below it, we cannot long */
    support: LevelArea,
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
    waitForPullback: boolean,
    enableOfferBreakout: boolean,
    enableBidReversal: boolean,
}
export interface GapAndCrapPlan extends BasePlan {
    /** the max resistance on daily chart, above it, we cannot short. -1: no limit when it's not based on resistance, but more due to extended rally */
    resistance: LevelArea,
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
    nearBelowPreviousEventKeyLevel?: string,
    waitForPullback: boolean,
}
export interface GapDownAndGoDownPlan extends BasePlan {
    nearBelowConsolidationRange?: LevelArea,
    nearBelowConsolidationRangeTop?: number,
    buyersTrappedBelowThisLevel?: number,
    resistance: LevelArea,
    /** the low of last 2 days */
    previousInsideDay?: number,
    waitForPullback: boolean,
}
export interface GapDownAndGoUpPlan extends BasePlan {
    support: LevelArea,
    nearAboveSupport?: LevelArea,
    nearAboveKeyEventLevel?: number,
    waitForPullback: boolean,
}
export interface BookmapBigWallBreakdownFailLongPlan extends BasePlan {
    bigWallLevel: number,
}
export interface AlgoPlan extends BasePlan {
    expirationInSeconds: number,
    allowPremarket: boolean,
}
export interface LevelBreakoutPlan extends BasePlan {
    entryPrice: number,
}
export interface FirstRetracementPlan extends BasePlan { }
export interface FirstBreakoutPlan extends BasePlan {

}

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

export enum PremarketVolumeScore {
    Zero_Low_Or_Normal = 0,
    One_Higher_Than_Normal = 1,
    Two_Extremely_High = 2,
    Unknown = -1,
}
