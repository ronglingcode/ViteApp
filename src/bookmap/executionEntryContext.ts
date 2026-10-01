import * as Models from '../models/models';
import * as Chart from '../ui/chart';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as Watchlist from '../algorithms/watchlist';
import { createExecutionInputs, defaultTradingPolicy } from '../trading/core/controllers/executionInputs.ts';
import { projectTradeLedger } from '../trading/core/account/tradeLedger.ts';
import { marketLoader } from '../trading/adapters/browserMarket.ts';
import { toCoreFill } from '../trading/adapters/browserAccount.ts';
import * as GlobalSettings from '../config/globalSettings';
import * as RiskManager from '../algorithms/riskManager';
import * as Broker from '../api/broker';
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
    const market = marketLoader.getState(symbol)?.snapshot();
    if (!market) return undefined;
    const order = (value: Models.OrderModel) => ({ ...value, price: value.price ?? 0, rawOrder: value.rawOrder ?? {} });
    const projection = {
        positions: Object.fromEntries(account.positions),
        entryOrders: Object.fromEntries([...account.entryOrders].map(([key, values]) => [key, values.map(order)])),
        exitPairs: Object.fromEntries([...account.exitPairs].map(([key, values]) => [key, values.map(pair => ({ ...pair,
            STOP: pair.STOP ? order(pair.STOP) : undefined, LIMIT: pair.LIMIT ? order(pair.LIMIT) : undefined }))])),
        executions: Object.fromEntries([...account.orderExecutions].map(([key, fills]) => [key, fills.map(toCoreFill)])),
        currentBalance: account.currentBalance, rawOrders: account.rawAccount,
    };
    const watchlist = Models.getWatchlist().map(item => item.symbol);
    const inputs = createExecutionInputs(symbol, plan, market, Models.getSymbolData(symbol), projection,
        projectTradeLedger(projection.executions, RiskManager.dailyMax),
        { symbol: TradingState.getSymbolState, direction: TradingState.getBreakoutTradeState }, watchlist,
        Object.fromEntries(watchlist.map(stock => [stock, { currentPrice: Models.getCurrentPrice(stock) }])),
        { customEntryPrice: widget.entryPriceLine?.options().price ?? 0, customStopLong: Chart.getCustomStopLossPrice(symbol, true),
            customStopShort: Chart.getCustomStopLossPrice(symbol, false), fixedQuantity: Models.getFixedQuantityFromInput(symbol), crosshairPrice: Chart.getCrossHairPrice(symbol) },
        Date.now(), 0, { ...defaultTradingPolicy, riskDollars: RiskManager.R, dailyMaxLoss: RiskManager.dailyMax,
            batchCount: GlobalSettings.batchCount, coreTargetEnabled: GlobalSettings.enableCoreTargetExitFeature,
            maxRiskMultipleWithExistingPosition: RiskManager.maxRiskMultipleWithExistingPosition, allowAddIfBelow: RiskManager.allowAddIfBelow });
    return { ...inputs.entryContext, definitions, watchlistBlockReason: Watchlist.getWatchlistLimitBlockReason(),
        longState: directionState(symbol, true), shortState: directionState(symbol, false) };
};
