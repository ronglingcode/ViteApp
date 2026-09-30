import * as Models from '../models/models';
import * as Chart from '../ui/chart';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as Watchlist from '../algorithms/watchlist';
import * as Helper from '../utils/helper';
import * as RiskManager from '../algorithms/riskManager';
import * as Broker from '../api/broker';
import { allowEntry } from '../attendance/attendance';
import { BookmapWallReversal } from '../tradebooks/bookmapWallReversal';
import * as TradingState from '../models/tradingState';
import * as PartialStopDiscipline from '../controllers/partialStopDisciplineController';

const directionState = (symbol: string, isLong: boolean) => {
    const state = TradingState.getBreakoutTradeState(symbol, isLong);
    return {
        initialQuantity: state.initialQuantity,
        partialsCount: TradingState.getPartialsCount(symbol, isLong),
        addCount: TradingState.getAddedPartialStack(symbol, isLong).length,
        tradebookID: state.submitEntryResult.tradeBookID,
        stopTightenPhase: PartialStopDiscipline.getPhase(symbol, isLong),
    };
};

/** Publish raw plan/account inputs ahead of actions; Java owns the entry decision. */
export const createExecutionEntryContext = (symbol: string) => {
    const widget = Models.getChartWidget(symbol);
    if (!widget) return undefined;
    const definitions = [...widget.tradebooks.values()].filter((tradebook): tradebook is BookmapWallReversal =>
        tradebook instanceof BookmapWallReversal && Object.getPrototypeOf(tradebook) === BookmapWallReversal.prototype
        && tradebook.triggerEntry === BookmapWallReversal.prototype.triggerEntry
        && tradebook.triggerEntryCommon === BookmapWallReversal.prototype.triggerEntryCommon)
        .map(tradebook => tradebook.getNativeExecutionDefinition());
    const plan = TradingPlans.getTradingPlans(symbol);
    const account = Models.getBrokerAccount();
    if (!account) return undefined;
    Broker.rebuildBrokerAccount();
    const watchlist = new Set(Models.getWatchlist().map(item => item.symbol));
    let usedBuyingPower = 0;
    account.positions.forEach((position, positionSymbol) => {
        if (watchlist.has(positionSymbol)) usedBuyingPower += Math.abs(position.netQuantity) * Models.getCurrentPrice(positionSymbol);
    });
    const data = Models.getSymbolData(symbol);
    return {
        definitions, attendanceAllowed: allowEntry(),
        watchlistBlockReason: Watchlist.getWatchlistLimitBlockReason(),
        realizedPnl: Models.getRealizedProfitLoss(), dailyMaxLoss: RiskManager.dailyMax, riskDollars: RiskManager.R,
        liquidityScale: Models.getLiquidityScale(symbol),
        secondsSinceMarketOpen: Helper.getSecondsSinceMarketOpen(Helper.getCurrentMarketTime()),
        openPrice: Models.getOpenPrice(symbol), vwap: Models.getCurrentVwap(symbol),
        atr: plan.atr.average, maxQuantity: plan.atr.maxQuantity,
        watchAreas: plan.analysis.watchAreas, noTradeZones: plan.analysis.noTradeZones,
        volumes: Models.getVolumesSinceOpen(symbol).map(volume => volume.value),
        highOfDay: data.highOfDay, lowOfDay: data.lowOfDay,
        customEntryPrice: widget.entryPriceLine?.options().price ?? 0,
        customStopLong: Chart.getCustomStopLossPrice(symbol, true),
        customStopShort: Chart.getCustomStopLossPrice(symbol, false),
        fixedQuantity: Models.getFixedQuantityFromInput(symbol),
        availableBuyingPower: account.currentBalance * 3.9 - usedBuyingPower,
        // Observations for the experimental workflows; Java makes the action decision.
        reloadIsLong: Models.isLongForReload(symbol),
        lastExitSize: Models.getLastExitSize(symbol),
        crosshairPrice: Chart.getCrossHairPrice(symbol),
        todayRange: Models.getTodayRange(plan.atr),
        longState: directionState(symbol, true), shortState: directionState(symbol, false),
        activeBasePlan: TradingState.getSymbolState(symbol).activeBasePlan,
        isGappedUp: Models.isGappedUp(symbol),
        premarketHigh: data.premktHigh, premarketLow: data.premktLow,
        addTargetLong: Models.getFirstTargetToAdd(symbol, true),
        addTargetShort: Models.getFirstTargetToAdd(symbol, false),
        maxRiskMultipleWithExistingPosition: RiskManager.maxRiskMultipleWithExistingPosition,
        allowAddIfBelow: RiskManager.allowAddIfBelow,
    };
};
