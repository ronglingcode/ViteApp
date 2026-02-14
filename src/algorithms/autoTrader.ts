import * as Helper from '../utils/helper';
import * as Rules from './rules';
import * as Chart from '../ui/chart';
import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as TradingState from '../models/tradingState';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as EntryHandler from '../controllers/entryHandler';
import * as Handler from '../controllers/handler';
import * as Broker from '../api/broker';
import * as MarketData from '../api/marketData';
import * as Vwap from '../algorithms/vwap';
import * as Patterns from '../algorithms/patterns';
import * as AutoFirstNewHigh from './autoFirstNewHigh';
import * as AutoRedToGreen60 from './autoRedToGreen60';
import * as AutoLevelMomentum from './autoLevelMomentum';
import * as OrderFlow from '../controllers/orderFlow';
import * as EntryRulesChecker from '../controllers/entryRulesChecker';
import * as TradebooksManager from '../tradebooks/tradebooksManager';
import * as VwapPatterns from './vwapPatterns';
import * as Agent from '../ai/agent';
import { VwapContinuationFailed } from '../tradebooks/singleKeyLevel/vwapContinuationFailed';

declare let window: Models.MyWindow;

let refreshInprogress: Map<string, boolean> = new Map<string, boolean>();
let higherVolumeAlerts: Map<string, Set<number>> = new Map<string, Set<number>>();
export const checkVolumeOnCandleClose = (symbol: string, newlyClosedCandle: Models.CandlePlus) => {
    let seconds = Helper.getSecondsSinceMarketOpen(new Date());
    if (seconds < 100) {
        return;
    }
    let currentTime = newlyClosedCandle.time;
    let volumes = Models.getVolumesSinceOpen(symbol);
    if (volumes.length < 2) {
        return;
    }

    if (Models.isCandleAnEntryCandle(symbol, newlyClosedCandle)) {
        for (let i = 1; i < volumes.length; i++) {
            let currentVolumeBar = volumes[i];
            let previousVolumeBar = volumes[i - 1];
            if (currentVolumeBar.time == currentTime) {
                // found current volume bar
                if (currentVolumeBar.value > previousVolumeBar.value) {
                    Firestore.logInfo(`${symbol} higher volume on entry candle`);
                    Helper.speak(`${symbol} higher volume on entry candle`);
                } else {
                    Firestore.logInfo(`${symbol} lower volume on entry candle`);
                    Helper.speak(`${symbol} lower volume on entry candle`);
                }
            }
        }
    } else {
        //Firestore.logInfo(`${symbol} check volume on close for non-entry candle`);
    }
}
export const alertHigherVolume = (symbol: string) => {
    let now = new Date();
    let seconds = Helper.getSecondsSinceMarketOpen(now);
    if (seconds <= 61) {
        return;
    }
    let symbolData = Models.getSymbolData(symbol);
    let volumes = symbolData.volumes;
    if (volumes.length < 2) {
        return;
    }
    let currentVolume = volumes[volumes.length - 1].value;
    let previousVolume = volumes[volumes.length - 2].value;
    let currentTime = Helper.getMinutesSinceMarketOpen(now);
    let currentMinuteBucket = Math.floor(currentTime);
    if (!higherVolumeAlerts.has(symbol)) {
        higherVolumeAlerts.set(symbol, new Set<number>());
    }
    let alertedTimes = higherVolumeAlerts.get(symbol);
    if (!alertedTimes) {
        // should not happen, but just in case
        Firestore.logError(`${symbol} no alerted times set`);
        return;
    }
    if (!alertedTimes.has(currentMinuteBucket)) {
        if (currentVolume > previousVolume) {
            alertedTimes.add(currentMinuteBucket);
            //Firestore.logInfo(`${symbol} volume alert ${currentVolume} > ${previousVolume}, ${currentMinuteBucket}`);
            if (Models.isNowInTheSameMinuteAsEntry(symbol)) {
                Helper.speak(`${symbol} volume alert, entry volume higher than previous`);
            } else {
                if (seconds < 15 * 60) {
                    Helper.speak(`${symbol} volume alert`);
                }
            }
            let netQuantity = Models.getPositionNetQuantity(symbol);
            if (netQuantity != 0) {
                let isLong = netQuantity > 0;
                let c = Models.getCurrentCandle(symbol);
                if (isLong && Patterns.isGreenBar(c) || !isLong && Patterns.isRedBar(c)) {
                    let holdMessage = `higher volume in favor, consider holding. no tighter limit, only tighter stop`;
                    Firestore.logInfo(holdMessage);
                    Helper.speak(holdMessage);
                } else if (isLong && Patterns.isRedBar(c) || !isLong && Patterns.isGreenBar(c)) {
                    let warningMessage = `higher volume against position`;
                    Firestore.logInfo(warningMessage);
                    Helper.speak(warningMessage);
                }
            }
        }
    }
}
export const getTimeFrameToUse = () => {
    let seconds = Helper.getSecondsSinceMarketOpen(new Date());
    let timeframe = 1;

    if (seconds > (60 * 10)) {
        timeframe = 5;
    }
    if (seconds > (60 * 30)) {
        timeframe = 15;
    }
    if (seconds > (60 * 60)) {
        timeframe = 30;
    }
    return timeframe
}
export const scheduleEvents = () => {
    let now = new Date();
    scheduleMarketPreOpenEvent(now);
    scheduleMarketOpenEvent(now);
    schedule5MinutePreCheckEvent(now);
    schedule5MinutePostCheckEvent(now);
    scheduleFirstMinuteCloseEvent(now);
    scheduleHigherTimeFrameRefreshEvent(now);
    setInterval(refreshAlgoPeriodically, 2 * 1000);
    setInterval(() => {
        Chart.updateAccountUIStatus([], 'every 5 seconds');
        Patterns.checkWave(false);
    }, 5000);
    setInterval(() => {
        TradebooksManager.refreshTradebooksStatus();
    }, 1000);
    // run on each reload 
    setTimeout(() => {

    }, 3000);
    setInterval(() => {
        // every minute, update the chart to use the right time frame
        updateChartTimeFrame();
    }, 60 * 1000);
};
export const updateChartTimeFrame = () => {
    let timeframe = getTimeFrameToUse();
    let watchlist = Models.getWatchlist();
    watchlist.forEach(item => {
        let symbol = item.symbol;
        Chart.showChartForTimeframe(symbol, timeframe);
    });
}

const schedule5MinutePreCheckEvent = (now: Date) => {
    let targetTime = new Date();
    targetTime.setHours(6);
    targetTime.setMinutes(29);
    targetTime.setSeconds(50);
    for (let i = 1; i <= 5; i++) {
        targetTime.setMinutes(targetTime.getMinutes() + 5);
        let waitTime = targetTime.getTime() - now.getTime();
        if (waitTime > 0) {
            setTimeout(() => {
                Helper.speak('five minute check for new high or low');
                Firestore.logInfo(`five minute check`);
            }, waitTime);
        }
    }
}

const schedule5MinutePostCheckEvent = (now: Date) => {
    let targetTime = new Date();
    targetTime.setHours(6);
    targetTime.setMinutes(30);
    targetTime.setSeconds(5);
    for (let i = 1; i <= 5; i++) {
        targetTime.setMinutes(targetTime.getMinutes() + 5);
        let waitTime = targetTime.getTime() - now.getTime();
        if (waitTime > 0) {
            setTimeout(() => {
                run5MinutePostCheck();
            }, waitTime);
        }
    }
}

const run5MinutePostCheck = () => {
    let positions = Models.getOpenPositions();
    if (positions.length > 0) {
        Helper.speak('consider trail on 5 minute');
        Firestore.logInfo(`consider trail on 5 minute`);
    }
}

const scheduleMarketPreOpenEvent = (now: Date) => {
    let marketOpenTime = new Date();
    marketOpenTime.setHours(6);
    marketOpenTime.setMinutes(29);
    marketOpenTime.setSeconds(45);
    let waitTime = marketOpenTime.getTime() - now.getTime();
    if (waitTime > 0) {
        console.log(`schedule market open event in ${waitTime / 1000}`);
        setTimeout(() => {
            beforeMarketOpen();
        }, waitTime);
    }
}
const beforeMarketOpen = () => {
    //Helper.speak('focus on stocks open in momentum area');
}
const scheduleMarketOpenEvent = (now: Date) => {
    let marketOpenTime = new Date();
    marketOpenTime.setHours(6);
    marketOpenTime.setMinutes(30);
    marketOpenTime.setSeconds(2);

    let waitTime = marketOpenTime.getTime() - now.getTime();
    if (waitTime > 0) {
        console.log(`schedule market open event in ${waitTime / 1000}`);
        setTimeout(() => {
            onMarketJustOpened();
        }, waitTime);
    } else {
        onMarketAlreadyOpen();
    }
};
const scheduleFirstMinuteCloseEvent = (now: Date) => {
    let rightBeforeFirstMinuteClose = new Date();
    rightBeforeFirstMinuteClose.setHours(6);
    rightBeforeFirstMinuteClose.setMinutes(30);
    rightBeforeFirstMinuteClose.setSeconds(50);
    let waitTime = rightBeforeFirstMinuteClose.getTime() - now.getTime();
    if (waitTime > 0) {
        setTimeout(() => {
            Helper.speak("Check all stocks for first minute close");
        }, waitTime);
    }
}
const scheduleRefresh = (now: Date, hour: number, minute: number, second: number) => {
    let targetTime = new Date();
    targetTime.setHours(hour);
    targetTime.setMinutes(minute);
    targetTime.setSeconds(second);
    let waitTime = targetTime.getTime() - now.getTime();
    if (waitTime > 0) {
        setTimeout(() => {
            //window.location.reload();
        }, waitTime);
    }
}
const scheduleHigherTimeFrameRefreshEvent = (now: Date) => {
    // 10 seconds after 6:40
    scheduleRefresh(now, 6, 40, 10);
    // 10 seconds after 7:00
    scheduleRefresh(now, 7, 0, 10);
}

const scheduleSecondMinuteCloseEvent = (now: Date) => {
    let rightBeforeFirstMinuteClose = new Date();
    rightBeforeFirstMinuteClose.setHours(6);
    rightBeforeFirstMinuteClose.setMinutes(30);
    rightBeforeFirstMinuteClose.setSeconds(50);
    let waitTime = rightBeforeFirstMinuteClose.getTime() - now.getTime();
    if (waitTime > 0) {
        setTimeout(() => {
            Helper.speak("Check all stocks for first minute close");
        }, waitTime);
    }
}

export const onMarketJustOpened = () => {
    /*
    setInterval(() => {
        refreshEntryStopLoss();
    }, 1000);*/

    autoTriggerRedToGreen60();
}
export const onMarketAlreadyOpen = () => {
    setTimeout(() => {
        // wait 2 seconds for data to load
        updateUIBasedOnOpenZone();
    }, 2000);
}

export const updateUIBasedOnOpenZoneForSymbol = (symbol: string, openPrice: number) => {

}
export const updateUIBasedOnOpenZone = () => {
    let watchlist = Models.getWatchlist();
    watchlist.forEach(item => {
        let symbol = item.symbol;
        let openPrice = Models.getOpenPrice(symbol);
        if (!openPrice) {
            Firestore.logError(`${symbol} no open price`);
            return;
        }

        updateUIBasedOnOpenZoneForSymbol(symbol, openPrice);
    });
}
export const autoTriggerRedToGreen60 = () => {
    // RedToGreen60 plans (ProfitTakingFade60, OpenDriveContinuation60) removed
}
export const onMarketOpen = (symbol: string) => {
    // handle when market opens
    if (!symbol) {
    }
};


export const onMinuteClosed = (
    symbol: string, newlyClosedCandle: Models.CandlePlus,
    isRealtime: boolean, symbolData: Models.SymbolData) => {
    let seconds = Helper.getSecondsSinceMarketOpen(new Date());
    if (isRealtime) {
        AutoFirstNewHigh.onMinuteClosed(symbol);


        checkVolumeOnCandleClose(symbol, newlyClosedCandle);
        if (120 <= seconds && seconds <= 180) {
            Firestore.logInfo(`2nd candle just closed, minutes since open ${newlyClosedCandle.minutesSinceMarketOpen}`);
            AutoFirstNewHigh.TryAutoTrigger(symbol);
        }
        if (seconds < 0) {
            let openPositions = Models.getOpenPositions();
            if (openPositions.length > 0) {
                Helper.speak('only trade in premarket on fresh news released in premarket');
            }

        }
        getBreakoutEntryClosePercentage(symbol, newlyClosedCandle);
        if (seconds > 0) {
            Agent.testTradeAnalysis(symbol);
        }
    }
    if (seconds > 10) {
        AutoLevelMomentum.checkMomentumLevelOnClose(symbol, newlyClosedCandle, symbolData);
        TradebooksManager.onNewCandleCloseForSymbol(symbol);
    }
    if (seconds < -10 || seconds > 10) {
        // each minute close except for the last minute close before open, it will be handle by on market open
        let widget = Models.getChartWidget(symbol);
        if (widget) {
            let currentVwap = Models.getCurrentVwap(symbol);
            let vwapToUse = currentVwap;
            if (seconds > 10) {
                vwapToUse = Models.getLastVwapBeforeOpen(symbol);
            }
            let openPriceToUse = Models.getOpenPrice(symbol);
            if (!openPriceToUse) {
                openPriceToUse = newlyClosedCandle.close;
            }
            TradebooksManager.updateTradebooksStatus(symbol, widget.tradebooks, openPriceToUse, vwapToUse);
        }
    }
    let widget = Models.getChartWidget(symbol);
    if (widget && widget.tradebooks && seconds > 50) {
        // Check for vwap bounce fail tradebook and call status function
        let tradebooks = widget.tradebooks;
        for (let tradebookMapEntryPair of tradebooks) {
            let tradebook = tradebookMapEntryPair[1];
            if (tradebook.getID() === VwapContinuationFailed.shortVwapBounceFailed && tradebook.isEnabled()) {
                let status = VwapPatterns.getStatusForVwapBounceFail(symbol);
                Firestore.logInfo(`${symbol} vwap bounce fail status: ${status}`);
                break;
            }
        }
    }
}
/**
 * If the newly closed candle is a breakout entry candle
 * calculate its percentage of the close price
 * 
 */
export const getBreakoutEntryClosePercentage = (symbol: string,
    newlyClosedCandle: Models.CandlePlus) => {
    let position = Models.getPosition(symbol);
    if (!position || position.netQuantity == 0) {
        return;
    }
    let isLong = position.netQuantity > 0;
    let closePrice = newlyClosedCandle.close;
    let breakoutState = TradingState.getBreakoutTradeState(symbol, isLong);
    if (breakoutState.closedOutsideRatio != -1) {
        // already had the breakout closed ratio
        return;
    }
    let entryPrice = breakoutState.entryPrice;
    let stopLossPrice = breakoutState.stopLossPrice;
    let risk = Math.abs(entryPrice - stopLossPrice);
    let breakoutGain = isLong ? (closePrice - entryPrice) : (entryPrice - closePrice);
    let percentRatio = breakoutGain / risk;
    percentRatio = Math.round(percentRatio * 100) / 100;
    breakoutState.closedOutsideRatio = percentRatio;
    TradingState.update();
    let percentage = `${percentRatio * 100}%`;
    if (percentRatio <= 0) {
        Firestore.logError(`${symbol} breakout closed inside, ${percentage}`);
        Helper.speak(`${symbol} breakout closed inside`);
    } else {
        Firestore.logInfo(`${symbol} breakout closed ${percentage}`);
        Helper.speak(`${symbol} breakout closed ${percentage}. prepare first pullback`);
    }
}

export const updateAllAlgo = (symbol: string) => {
    let netQuantity = Models.getPositionNetQuantity(symbol);
    if (netQuantity != 0) {
        // TODO: the opposition algo should keep
        clearExistingAlgos(symbol);
    }
}
export const clearExistingAlgos = (symbol: string) => {
    AutoFirstNewHigh.stopAlgo(symbol);
    AutoFirstNewHigh.stopAlgo(symbol);
    AutoRedToGreen60.stopAlgo(symbol);
}

export const refreshAlgoPeriodically = () => {
    let wl = window.HybridApp.Watchlist;
    if (!wl || wl.length == 0)
        return;

    let secondsSinceMarketOpen = Helper.getSecondsSinceMarketOpen(new Date());
    for (let i = 0; i < wl.length; i++) {
        let symbol = wl[i].symbol;
        refreshAlgoPeriodicallyForSymbol(symbol, secondsSinceMarketOpen);
    }
}
const refreshAlgoPeriodicallyForSymbol = (symbol: string, secondsSinceMarketOpen: number) => {
    if (secondsSinceMarketOpen > 60) {
        //AutoFirstNewHigh.refreshPeriodically(symbol);
    }
}

export const pauseAlgo = (symbol: string) => {
    clearExistingAlgos(symbol);
}
export const refreshEntryStopLoss = () => {
    let items = Models.getWatchlist();
    items.forEach(item => {
        if (!Helper.isFutures(item.symbol)) {
            let logTags: Models.LogTags = {
                symbol: item.symbol,
                logSessionName: 'refresh-entry-stop-loss'
            };
            refreshEntryStopLossForSymbol(item.symbol, logTags);
        }
    });
}
export const refreshEntryStopLossForSymbol = (symbol: string, logTags: Models.LogTags) => {
    if (hasRefreshInProgress(symbol)) {
        setTimeout(() => {
            refreshEntryStopLossForSymbol(symbol, logTags);
        }, 1000);
        return;
    }
    let exitOrders = Models.getExitOrdersPairs(symbol);
    if (exitOrders.length > 0) {
        // already filled entry, exiting algo
        return;
    }
    let entryOrders = Models.getEntryOrders(symbol);
    if (entryOrders.length == 0) {
        // no entry orders yet
        return;
    }
    let stopLoss = Models.getEntryOrderStopLossPrice(symbol);
    if (stopLoss == 0) {
        // no stop loss from entry orders, nothing to update
        return;
    }
    let entryPrice = entryOrders[0].price;
    if (!entryPrice) {
        // no entry price
        return;
    }
    let symbolData = Models.getSymbolData(symbol);
    let isLong = entryOrders[0].isBuy;
    let newStopLoss = isLong ? symbolData.lowOfDay : symbolData.highOfDay;
    if ((isLong && newStopLoss < stopLoss) || (
        !isLong && newStopLoss > stopLoss)) {
        Firestore.logInfo(`refresh with new stop ${newStopLoss}`, logTags);
        let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
        setRefreshInProgress(symbol, true);
        let useReplacement = true;
        if (useReplacement) {
            OrderFlow.replaceEntryWithNewStopByReplacement(
                symbol, isLong, entryPrice, newStopLoss,
                breakoutTradeState.sizeMultipler, breakoutTradeState.plan, breakoutTradeState.submitEntryResult.tradeBookID, logTags,
            );
        } else {
            OrderFlow.replaceEntryWithNewStopByCancelAndResubmit(
                symbol, isLong, entryPrice, newStopLoss,
                breakoutTradeState.sizeMultipler, breakoutTradeState.plan, breakoutTradeState.submitEntryResult.tradeBookID, logTags
            );
        }

        setTimeout(() => {
            setRefreshInProgress(symbol, false);
        }, 1500);
    }
};
export const hasRefreshInProgress = (symbol: string) => {
    let result = refreshInprogress.get(symbol);
    return result == true;
}
export const setRefreshInProgress = (symbol: string, isInProgress: boolean) => {
    refreshInprogress.set(symbol, isInProgress);
}

export const checkAlgoPendingCondition = (symbol: string) => {
    let seconds = Helper.getSecondsSinceMarketOpen(new Date());
    if (seconds > 60) {
        return;
    }
    AutoRedToGreen60.checkPendingCondition(symbol);
}
export const updatePullbackDepth = (symbol: string, newPrice: number) => {
    let netQuantity = Models.getPositionNetQuantity(symbol);
    if (netQuantity == 0) {
        return;
    }
    let isLong = netQuantity > 0;
    let state = TradingState.getBreakoutTradeState(symbol, isLong);
    if (!state.hasValue) {
        return;
    }
    let depth = Helper.getPullbackDepth(newPrice, state.entryPrice, state.stopLossPrice, isLong);
    if (depth != 0) {
        if (depth > state.maxPullbackReached) {
            state.maxPullbackReached = depth;
            /*
            if (!state.adjustedTargetDueToMaxPullback && is alredy larger than threshold) {
                state.adjustedTargetDueToMaxPullback = true;
                Firestore.logInfo(`auto breakeven after deep pullback`);
                Handler.adjustAllLimitExits(symbol, state.entryPrice);
            }
            if (depth > 0.75) {
                let pullbackWarning = "pullback too deep, use range trading";
                Firestore.logInfo(pullbackWarning);
                Helper.speak(pullbackWarning);
            }*/
        }
    }
}
export const onNewTimeAndSalesData = (symbol: string, newPrice: number, isNewCandleData: boolean) => {
    checkAlgoPendingCondition(symbol);
    updatePullbackDepth(symbol, newPrice);
    if (!isNewCandleData) {
        AutoLevelMomentum.checkMomentumLevelBeforeClose(symbol);
    }
    alertHigherVolume(symbol);
    saveRedToGreenState(symbol);
    TradebooksManager.onNewTimeAndSalesDataForSymbol(symbol);
    let status = getChartAnalysis(symbol);
    if (status) {
        Chart.updateToolTipPriceLine(symbol, status);
    }
    Chart.drawRiskLevels(symbol);
}
export const saveRedToGreenState = (symbol: string) => {
    let seconds = Helper.getSecondsSinceMarketOpen(new Date());
    if (seconds < 0) {
        // market not open yet
        return;
    }
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return;
    }
    let redToGreenState = widget.redToGreenState;
    if (!redToGreenState.hasReversalForLong) {
        let hasReversalMovementNow = EntryRulesChecker.conditionallyHasReversalBarSinceOpen(
            symbol, true, true, true);
        if (hasReversalMovementNow) {
            //Firestore.logInfo(`${symbol} has reversal movement for long`);
            redToGreenState.hasReversalForLong = true;
        }
    }
    if (!redToGreenState.hasReversalForShort) {
        let hasReversalMovementNow = EntryRulesChecker.conditionallyHasReversalBarSinceOpen(
            symbol, false, true, true);
        if (hasReversalMovementNow) {
            //Firestore.logInfo(`${symbol} has reversal movement for short`);
            redToGreenState.hasReversalForShort = true;
        }
    }
}
export const hasReversalMove = (symbol: string, isLong: boolean) => {
    let widget = Models.getChartWidget(symbol);
    if (!widget) {
        return false;
    }
    let redToGreenState = widget.redToGreenState;
    if (isLong) {
        return redToGreenState.hasReversalForLong;
    } else {
        return redToGreenState.hasReversalForShort;
    }
}

export const checkTimingForEntry = (symbol: string) => {
    let seconds = Helper.getSecondsSinceMarketOpen(new Date());
    if (seconds > 120) {
        return;
    }
    // no op for now
}

export const onFirstDataAfterMarketOpen = (symbol: string, price: number) => {
    updateUIBasedOnOpenZoneForSymbol(symbol, price);
    TradebooksManager.updateTradebooksStatusHighLevelCall(symbol);
}

export const onAccountDataRefresh = (symbol: string) => {
    updateAllAlgo(symbol);
    detectOverRisk(symbol);
}
export const detectOverRisk = (symbol: string) => {
    let chart = Models.getChartWidget(symbol);
    if (!chart) {
        return;
    }
    let risk = chart.entryOrderLabelRiskMultiple;
    if (!risk) {
        return;
    }
    if (risk > 1.5) {
        Helper.speak(`over risk for ${symbol}`);
        Firestore.logError(`over risk for ${symbol}`);
    }
}

export const getChartAnalysis = (symbol: string) => {
    let netQ = Models.getPositionNetQuantity(symbol);
    if (netQ == 0) {
        return "";
    }
    let openPrice = Models.getOpenPrice(symbol);
    if (!openPrice) {
        return "";
    }
    let isLong = netQ > 0;
    let plan = TradingPlans.getTradingPlans(symbol);
    let inflectionLevel = plan.analysis.singleMomentumKeyLevel[0].high;
    let openVwap = Models.getLastVwapBeforeOpen(symbol);
    let symbolData = Models.getSymbolData(symbol);
    if (symbolData.premktHigh >= openPrice && openPrice >= openVwap && openVwap >= inflectionLevel) {
        if (isLong) {
            return VwapPatterns.getStatusForVwapContinuationLongWithPremarketHigh(symbol, 0);
        }
    }
    return "";
}