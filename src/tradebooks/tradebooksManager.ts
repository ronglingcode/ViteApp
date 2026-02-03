import * as Models from "../models/models";
import * as TradingPlans from "../models/tradingPlans/tradingPlans";
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import type { Tradebook } from "./baseTradebook";
import { OpenFlush } from "./singleKeyLevel/openFlush";
import { OpenDrive } from "./singleKeyLevel/openDrive";
import { AboveWaterBreakout } from "./singleKeyLevel/aboveWaterBreakout";
import { EmergingStrengthBreakout } from "./singleKeyLevel/emergingStrengthBreakout";
import { VwapContinuation } from "./singleKeyLevel/vwapContinuation"
import { VwapContinuationFailed } from "./singleKeyLevel/vwapContinuationFailed";
import * as TradingState from "../models/tradingState";
import { VwapScalp } from "./vwapScalp";
import { BreakoutReversal } from "./breakoutReversal";
import { AllTimeHighVwapContinuation } from "./allTimeHighVwapContinuation";
import { GapAndCrapAcceleration } from "./gapAndCrapAcceleration";
import * as Helper from "../utils/helper";
import * as Firestore from "../firestore";
import { GapAndCrap } from "./gapAndCrap";
import { GapAndGo } from "./gapAndGo";

export const createAllTradebooks = (symbol: string) => {
    let plan = TradingPlans.getTradingPlans(symbol);
    let keyLevel = TradingPlans.getSingleMomentumLevel(plan);
    let longPlan = plan.long.levelMomentumPlan;
    let shortPlan = plan.short.levelMomentumPlan;

    let tradebooksMap = new Map<string, Tradebook>();
    if (longPlan) {
        let longOpenDrive = new OpenDrive(symbol, true, keyLevel, longPlan);
        tradebooksMap.set(longOpenDrive.getID(), longOpenDrive);

        let longAboveWaterBreakout = new AboveWaterBreakout(symbol, true, keyLevel, longPlan);
        tradebooksMap.set(longAboveWaterBreakout.getID(), longAboveWaterBreakout);


        let longEmergingStrengthBreakout = new EmergingStrengthBreakout(symbol, true, keyLevel, longPlan);
        tradebooksMap.set(longEmergingStrengthBreakout.getID(), longEmergingStrengthBreakout);

        let longVwapContinuation = new VwapContinuation(symbol, true, keyLevel, longPlan);
        tradebooksMap.set(longVwapContinuation.getID(), longVwapContinuation);

        let longVwapPushdownFailed = new VwapContinuationFailed(symbol, true, keyLevel, longPlan);
        tradebooksMap.set(longVwapPushdownFailed.getID(), longVwapPushdownFailed);
    }
    if (shortPlan) {
        let shortOpenDrive = new OpenDrive(symbol, false, keyLevel, shortPlan);
        tradebooksMap.set(shortOpenDrive.getID(), shortOpenDrive);

        let shortBelowWaterBreakdown = new AboveWaterBreakout(symbol, false, keyLevel, shortPlan);
        tradebooksMap.set(shortBelowWaterBreakdown.getID(), shortBelowWaterBreakdown);

        let shortEmergingWeaknessBreakdown = new EmergingStrengthBreakout(symbol, false, keyLevel, shortPlan);
        tradebooksMap.set(shortEmergingWeaknessBreakdown.getID(), shortEmergingWeaknessBreakdown);

        let shortVwapContinuation = new VwapContinuation(symbol, false, keyLevel, shortPlan);
        tradebooksMap.set(shortVwapContinuation.getID(), shortVwapContinuation);

        let shortVwapPushdownFailed = new VwapContinuationFailed(symbol, false, keyLevel, shortPlan);
        tradebooksMap.set(shortVwapPushdownFailed.getID(), shortVwapPushdownFailed);

        let openFlush = new OpenFlush(symbol, false, keyLevel, shortPlan);
        tradebooksMap.set(openFlush.getID(), openFlush);
    }
    if (plan.long.vwapScalpPlan) {
        let vwapScalp = new VwapScalp(symbol, true, plan.long.vwapScalpPlan);
        tradebooksMap.set(vwapScalp.getID(), vwapScalp);
    }
    if (plan.short.vwapScalpPlan) {
        let vwapScalp = new VwapScalp(symbol, false, plan.short.vwapScalpPlan);
        tradebooksMap.set(vwapScalp.getID(), vwapScalp);
    }
    if (plan.long.reversalPlan) {
        let reversal = new BreakoutReversal(symbol, true, plan.long.reversalPlan);
        tradebooksMap.set(reversal.getID(), reversal);
    }
    if (plan.short.reversalPlan) {
        let reversal = new BreakoutReversal(symbol, false, plan.short.reversalPlan);
        tradebooksMap.set(reversal.getID(), reversal);
    }
    if (plan.long.allTimeHighVwapContinuationPlan) {
        let allTimeHighVwapContinuation = new AllTimeHighVwapContinuation(symbol, true, plan.long.allTimeHighVwapContinuationPlan);
        tradebooksMap.set(allTimeHighVwapContinuation.getID(), allTimeHighVwapContinuation);
    }
    if (plan.short.gapAndCrapAccelerationPlan) {
        let gapAndCrapAcceleration = new GapAndCrapAcceleration(symbol, false, plan.short.gapAndCrapAccelerationPlan);
        tradebooksMap.set(gapAndCrapAcceleration.getID(), gapAndCrapAcceleration);
    }
    if (plan.short.gapAndCrapPlan) {
        let gapAndCrap = new GapAndCrap(symbol, false, plan.short.gapAndCrapPlan);
        tradebooksMap.set(gapAndCrap.getID(), gapAndCrap);
    }
    if (plan.long.gapAndGoPlan) {
        let gapAndGo = new GapAndGo(symbol, true, plan.long.gapAndGoPlan);
        tradebooksMap.set(gapAndGo.getID(), gapAndGo);
    }
    return tradebooksMap;
}

export const enableTradebook = (isDirectionEnabled: boolean, tradebookMap: Map<string, Tradebook>, tradebookId: string,
    specificTradebooksMaps: Map<string, boolean>, tradebookConfigs: TradingPlansModels.TradebooksConfig
) => {
    if (!isDirectionEnabled) {
        return;
    }
    if (specificTradebooksMaps.size == 0 || specificTradebooksMaps.has(tradebookId)) {
        let tradebook = tradebookMap.get(tradebookId);
        if (tradebook) {
            tradebook.enable();
            tradebook.updateConfig(tradebookConfigs);
        }
    }
}
export const enableBreakoutTradebook = (isDirectionEnabled: boolean, tradebookMap: Map<string, Tradebook>, tradebookId: string,
    specificTradebooksMaps: Map<string, boolean>, waitForClose: boolean
) => {
    if (!isDirectionEnabled) {
        return;
    }
    if (specificTradebooksMaps.size == 0 || specificTradebooksMaps.has(tradebookId)) {
        let tradebook = tradebookMap.get(tradebookId);
        if (tradebook) {
            tradebook.enable();
        }
    }
}

export const updateTradebooksStatusHighLevelCall = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (widget) {
        let openPriceToUse = Models.getCurrentPrice(symbol);;
        let vwapToUse = Models.getCurrentVwap(symbol);
        let seconds = Helper.getSecondsSinceMarketOpen(new Date());
        if (seconds > 0) {
            let openPrice = Models.getOpenPrice(symbol);
            if (openPrice && openPrice > 0) {
                openPriceToUse = openPrice;
            }
            let lastVwapBeforeOpen = Models.getLastVwapBeforeOpen(symbol);
            vwapToUse = lastVwapBeforeOpen;
        }
        updateTradebooksStatus(symbol, widget.tradebooks, openPriceToUse, vwapToUse);
    }
}

export const updateTradebooksStatus = (symbol: string, tradebooksMap: Map<string, Tradebook>, openPrice: number, lastVwapBeforeOpen: number) => {
    let currentVwap = Models.getCurrentVwap(symbol);
    let plan = TradingPlans.getTradingPlans(symbol);
    if (!TradingPlans.hasSingleMomentumLevel(plan)) {
        return;
    }
    let tradebookConfig = plan.tradebooksConfig;


    let keyLevelArea = TradingPlans.getSingleMomentumLevel(plan);
    let keyLevel = keyLevelArea.high;
    // Disable all tradebooks by default except for the ones that are enabled by default
    tradebooksMap.forEach(tradebook => {
        if (tradebook.enableByDefault) {
            tradebook.enable();
        } else {
            tradebook.disable();
        }
    });

    let isLongEnabled = plan.long.enabled;
    let isShortEnabled = plan.short.enabled;

    // Disable AllTimeHighVwapContinuation if open is below VWAP or all-time high
    if (plan.long.allTimeHighVwapContinuationPlan) {
        let athVwapContTradebook = tradebooksMap.get(AllTimeHighVwapContinuation.allTimeHighVwapContinuationLong);
        if (athVwapContTradebook) {
            let allTimeHigh = plan.long.allTimeHighVwapContinuationPlan.allTimeHigh;
            if (openPrice < lastVwapBeforeOpen || openPrice < allTimeHigh) {
                athVwapContTradebook.disable();
                Firestore.logInfo(`${symbol} disabling ATH VWAP Cont: open ${openPrice} is below VWAP ${lastVwapBeforeOpen} or ATH ${allTimeHigh}`);
            }
        }
    }

    let specificTradebooks: Map<string, boolean> = new Map();

    if (plan.tradebooksConfig.level_vwap_open.shortVwapContinuation.enabled == 1) {
        //todo
    }
    /* #region Key level is equal to vwap */
    if (keyLevel == lastVwapBeforeOpen) {
        if (openPrice > keyLevel) {
            enableTradebook(isLongEnabled, tradebooksMap, OpenDrive.openDriveLong, specificTradebooks, tradebookConfig);
            enableTradebook(isShortEnabled, tradebooksMap, AboveWaterBreakout.belowWaterBreakdown, specificTradebooks, tradebookConfig);
        } else if (openPrice < keyLevel) {
            enableTradebook(isLongEnabled, tradebooksMap, AboveWaterBreakout.aboveWaterBreakout, specificTradebooks, tradebookConfig);
            enableTradebook(isShortEnabled, tradebooksMap, OpenDrive.openDriveShort, specificTradebooks, tradebookConfig);
        } else {
            enableTradebook(isLongEnabled, tradebooksMap, OpenDrive.openDriveLong, specificTradebooks, tradebookConfig);
            enableTradebook(isShortEnabled, tradebooksMap, OpenDrive.openDriveShort, specificTradebooks, tradebookConfig);
        }
        return;
    }
    /* #endregion */

    /* #region Key level is above vwap */
    if (openPrice >= keyLevel && keyLevel > lastVwapBeforeOpen) {
        let currentConfig = tradebookConfig.open_level_vwap;
        if (currentConfig.longOpenDrive.enabled == 1) {
            enableTradebook(isLongEnabled, tradebooksMap, OpenDrive.openDriveLong, specificTradebooks, tradebookConfig);
        }
        if (currentConfig.shortVwapBounceFail.enabled == 1) {
            enableTradebook(isShortEnabled, tradebooksMap, VwapContinuationFailed.shortVwapBounceFailed, specificTradebooks, tradebookConfig);
        }
    }
    if (keyLevel > openPrice && openPrice > lastVwapBeforeOpen) {
        let currentConfig = tradebookConfig.level_open_vwap;
        // long
        if (currentConfig.longAboveWaterBreakout.enabled == 1) {
            enableTradebook(isLongEnabled, tradebooksMap, AboveWaterBreakout.aboveWaterBreakout, specificTradebooks, tradebookConfig);
        }
        if (currentConfig.longVwapScalp.enabled == 1) {
            enableTradebook(isLongEnabled, tradebooksMap, VwapScalp.vwapScalpLong, specificTradebooks, tradebookConfig);
        }
        // short
        if (currentConfig.shortVwapBounceFail.enabled == 1) {
            enableTradebook(isShortEnabled, tradebooksMap, VwapContinuationFailed.shortVwapBounceFailed, specificTradebooks, tradebookConfig);
        }
        if (currentConfig.shortOpenFlush.enabled == 1) {
            enableTradebook(isShortEnabled, tradebooksMap, OpenFlush.openFlushShort, specificTradebooks, tradebookConfig);
        }
    }
    if (keyLevel > lastVwapBeforeOpen && lastVwapBeforeOpen >= openPrice) {
        let currentConfig = tradebookConfig.level_vwap_open;
        // long
        if (currentConfig.longEmergingStrengthBreakout.enabled == 1) {
            enableTradebook(isLongEnabled, tradebooksMap, EmergingStrengthBreakout.emergingStrengthBreakoutLong, specificTradebooks, tradebookConfig);
        }
        // short
        if (currentConfig.shortVwapContinuation.enabled == 1) {
            enableTradebook(isShortEnabled, tradebooksMap, VwapContinuation.vwapContinuationShort, specificTradebooks, tradebookConfig);
        }
        if (keyLevel < currentVwap) {
            enableTradebook(isShortEnabled, tradebooksMap, AboveWaterBreakout.belowWaterBreakdown, specificTradebooks, tradebookConfig);
        }
    }
    /* #endregion */
    /* #region Key level is below vwap */
    if (openPrice >= lastVwapBeforeOpen && lastVwapBeforeOpen > keyLevel) {
        let currentConfig = tradebookConfig.open_vwap_level;
        // long
        if (currentConfig.longVwapContinuation.enabled == 1) {
            enableTradebook(isLongEnabled, tradebooksMap, VwapContinuation.vwapContinuationLong, specificTradebooks, tradebookConfig);
        }
        if (keyLevel > currentVwap) {
            enableTradebook(isLongEnabled, tradebooksMap, AboveWaterBreakout.aboveWaterBreakout, specificTradebooks, tradebookConfig);
        }
        // short
        if (currentConfig.shortEmergingWeaknessBreakdown.enabled == 1) {
            enableTradebook(isShortEnabled, tradebooksMap, EmergingStrengthBreakout.emergingWeaknessBreakdownShort, specificTradebooks, tradebookConfig);
        }
    }
    if (lastVwapBeforeOpen > openPrice && openPrice > keyLevel) {
        let currentConfig = tradebookConfig.vwap_open_level;
        // long
        if (currentConfig.longVwapPushdownFail.enabled == 1) {
            enableTradebook(isLongEnabled, tradebooksMap, VwapContinuationFailed.longVwapPushDownFailed, specificTradebooks, tradebookConfig);
        }
        // short
        if (currentConfig.shortBelowWaterBreakout.enabled == 1) {
            enableTradebook(isShortEnabled, tradebooksMap, AboveWaterBreakout.belowWaterBreakdown, specificTradebooks, tradebookConfig);
        }
    }
    if (lastVwapBeforeOpen > keyLevel && keyLevel >= openPrice) {
        let currentConfig = tradebookConfig.vwap_level_open;
        // long
        if (currentConfig.longVwapPushdownFail.enabled == 1) {
            enableTradebook(isLongEnabled, tradebooksMap, VwapContinuationFailed.longVwapPushDownFailed, specificTradebooks, tradebookConfig);
        }
        // short
        if (currentConfig.shortOpenDrive.enabled == 1) {
            enableTradebook(isShortEnabled, tradebooksMap, OpenDrive.openDriveShort, specificTradebooks, tradebookConfig);
        }
    }
}

export const createTradebooksFromOpenPrice = (symbol: string) => {
    let openPrice = Models.getOpenPrice(symbol);
    if (!openPrice) {
        return [];
    }
    let plan = TradingPlans.getTradingPlans(symbol);
    if (!TradingPlans.hasSingleMomentumLevel(plan)) {
        return [];
    }
    let tradebooks: Tradebook[] = [];
    let lastVwap = Models.getLastVwapBeforeOpen(symbol);
    let keyLevel = TradingPlans.getSingleMomentumLevel(plan);
    let topPlan = TradingPlans.getTradingPlans(symbol);
    let longPlan = topPlan.long.levelMomentumPlan;
    let shortPlan = topPlan.short.levelMomentumPlan;

    /* #region Key level is equal to vwap */
    if (keyLevel.high == lastVwap) {
        if (openPrice > keyLevel.high) {
            if (longPlan) {
                tradebooks.push(new OpenDrive(symbol, true, keyLevel, longPlan));
            }
            if (shortPlan) {
                tradebooks.push(new AboveWaterBreakout(symbol, false, keyLevel, shortPlan));
            }
        } else if (openPrice < keyLevel.high) {
            if (longPlan) {
                tradebooks.push(new AboveWaterBreakout(symbol, true, keyLevel, longPlan));
            }
            if (shortPlan) {
                tradebooks.push(new OpenDrive(symbol, false, keyLevel, shortPlan));
            }
        } else {
            if (longPlan) {
                tradebooks.push(new OpenDrive(symbol, true, keyLevel, longPlan));
            }
            if (shortPlan) {
                tradebooks.push(new OpenDrive(symbol, false, keyLevel, shortPlan));
            }
        }
        return tradebooks;
    }
    /* #endregion */

    /* #region Key level is above vwap */
    if (openPrice >= keyLevel.high && keyLevel.high > lastVwap) {
        if (longPlan) {
            tradebooks.push(new OpenDrive(symbol, true, keyLevel, longPlan));
        }
        if (shortPlan) {
            tradebooks.push(new VwapContinuationFailed(symbol, false, keyLevel, shortPlan));
        }
    }
    if (keyLevel.high > openPrice && openPrice > lastVwap) {
        if (longPlan) {
            tradebooks.push(new AboveWaterBreakout(symbol, true, keyLevel, longPlan));
        }
        if (shortPlan) {
            tradebooks.push(new VwapContinuationFailed(symbol, false, keyLevel, shortPlan));
            tradebooks.push(new OpenFlush(symbol, false, keyLevel, shortPlan));

        }
    }
    if (keyLevel.high > lastVwap && lastVwap >= openPrice) {
        if (longPlan) {
            tradebooks.push(new EmergingStrengthBreakout(symbol, true, keyLevel, longPlan));
        }
        if (shortPlan) {
            tradebooks.push(new VwapContinuation(symbol, false, keyLevel, shortPlan));
        }
    }
    /* #endregion */

    /* #region Key level is below vwap */
    if (openPrice >= lastVwap && lastVwap > keyLevel.high) {
        if (longPlan) {
            tradebooks.push(new VwapContinuation(symbol, true, keyLevel, longPlan));
        }
        if (shortPlan) {
            tradebooks.push(new EmergingStrengthBreakout(symbol, false, keyLevel, shortPlan));
        }
    }
    if (lastVwap > openPrice && openPrice > keyLevel.high) {
        if (longPlan) {
            tradebooks.push(new VwapContinuationFailed(symbol, true, keyLevel, longPlan));
        }
        if (shortPlan) {
            tradebooks.push(new AboveWaterBreakout(symbol, false, keyLevel, shortPlan));
        }
    }
    if (lastVwap > keyLevel.high && keyLevel.high >= openPrice) {
        if (longPlan) {
            tradebooks.push(new VwapContinuationFailed(symbol, true, keyLevel, longPlan));
        }
        if (shortPlan) {
            tradebooks.push(new OpenDrive(symbol, false, keyLevel, shortPlan));
        }
    }
    /* #endregion */

    return tradebooks;
}
export const refreshTradebooksStatus = () => {
    let wl = Models.getWatchlist();
    for (let i = 0; i < wl.length; i++) {
        refreshTradebooksStatusForSymbol(wl[i].symbol);
    }
}
export const refreshTradebooksStatusForSymbol = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    let tradebooksMap = widget.tradebooks;
    tradebooksMap.forEach(tradebook => {
        tradebook.refreshLiveStats();
        tradebook.refreshState();
    });
}

export const getTradebookByID = (symbol: string, tradebookID: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return null;
    }
    let tradebooksMap = widget.tradebooks;
    return tradebooksMap.get(tradebookID);
}
export const onNewTimeAndSalesDataForSymbol = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    let tradebooksMap = widget.tradebooks;
    tradebooksMap.forEach(tradebook => {
        tradebook.onNewTimeSalesData();
    });
}
export const onNewCandleCloseForSymbol = (symbol: string) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    let tradebooksMap = widget.tradebooks;
    tradebooksMap.forEach(tradebook => {
        tradebook.onNewCandleClose();
    });
}
