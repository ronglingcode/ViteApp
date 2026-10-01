import type { TradingPlans } from '../../../models/tradingPlans/tradingPlansModels';
import type { MarketState } from '../marketdata/marketState.ts';
import { marketTime } from '../marketdata/marketClock.ts';
import { createTradebookDefinitions } from '../configuration/tradingConfig.ts';
import type { TradeState, StateObject } from '../state/tradeState.ts';
import { addedPartialStack, type projectTradeLedger } from '../account/tradeLedger.ts';
import type { projectAccount, AccountExitPair } from '../../libraries/broker/schwab/accountProjection.ts';

export interface ManualInputs { customEntryPrice?: number; customStopLong?: number; customStopShort?: number; fixedQuantity?: number; crosshairPrice?: number }
export interface TradingPolicy { batchCount: number; riskDollars: number; dailyMaxLoss: number; coreTargetEnabled: boolean; maxRiskMultipleWithExistingPosition: number; allowAddIfBelow: number }
export const defaultTradingPolicy: TradingPolicy = { batchCount: 10, riskDollars: 1000, dailyMaxLoss: 4000, coreTargetEnabled: false, maxRiskMultipleWithExistingPosition: 1.2, allowAddIfBelow: 1000 };
function sortedPairs(pairs: AccountExitPair[]) {
    return [...pairs].sort((a, b) => !a.LIMIT ? b.LIMIT ? 1 : 0 : !b.LIMIT ? -1 : b.LIMIT.isBuy ? b.LIMIT.price - a.LIMIT.price : a.LIMIT.price - b.LIMIT.price);
}
/** Builds the executor's full inputs from domain sources; never waits on I/O or UI. */
export function createExecutionInputs(symbol: string, plan: TradingPlans, market: ReturnType<MarketState['snapshot']>, quote: StateObject,
    account: ReturnType<typeof projectAccount>, ledger: ReturnType<typeof projectTradeLedger>, state: Pick<TradeState, 'symbol' | 'direction'>,
    watchlist: string[], markets: Record<string, { currentPrice: number }>, manual: ManualInputs, now: number, revision: number, policy = defaultTradingPolicy) {
    const netQuantity = account.positions[symbol]?.netQuantity ?? 0, isLong = netQuantity > 0;
    const active = state.direction(symbol, isLong), trades = ledger.trades[symbol] ?? [], openTrade = trades.find(trade => !trade.isClosed);
    const partialsCount = (direction: StateObject) => direction.plan?.planConfigs?.sizingCount > 0 ? direction.plan.planConfigs.sizingCount : policy.batchCount;
    const pairs = sortedPairs(account.exitPairs[symbol] ?? []);
    const initialCount = partialsCount(active);
    const direction = (isLong: boolean) => { const saved = state.direction(symbol, isLong); return {
        initialQuantity: saved.initialQuantity, partialsCount: partialsCount(saved), addCount: addedPartialStack(openTrade, saved.initialQuantity).length,
        tradebookID: saved.submitEntryResult.tradeBookID, stopTightenPhase: saved.stopTightenPhase ?? 'idle',
    }; };
    const reference = (value: string) => value === 'vwap' ? market.vwap : value === 'premarketHigh' ? market.premarketHigh : value === 'premarketLow' ? market.premarketLow : Number(value) || 0;
    let usedBuyingPower = 0;
    for (const stock of watchlist) usedBuyingPower += Math.abs(account.positions[stock]?.netQuantity ?? 0) * (markets[stock]?.currentPrice ?? 0);
    const lastExitSize = [...trades].reverse().find(trade => trade.exits.length)?.exits.at(-1)?.quantity ?? 0;
    return {
        symbol, revision, netQuantity, averagePrice: account.positions[symbol]?.averagePrice ?? 0,
        currentPrice: market.currentPrice, bid: quote.bidPrice ?? 0, ask: quote.askPrice ?? 0,
        batchCount: policy.batchCount, splitPartials: netQuantity !== 0 && (!active.submitEntryResult.isSingleOrder || !pairs.some(pair => (pair.LIMIT ?? pair.STOP)!.quantity > active.submitEntryResult.totalQuantity * 2)),
        hasPlan: active.hasValue, entryPrice: active.entryPrice, coreTarget: active.plan.coreTarget, coreCount: active.plan.coreCount,
        coreRuleEnabled: policy.coreTargetEnabled, rulesSupported: true,
        entries: account.entryOrders[symbol] ?? [],
        pairs: pairs.map((pair, index) => ({ ...pair, originalPartial: index + Math.max(0, initialCount - pairs.length) + 1 })),
        entryContext: {
            activeTrade: active, longTrade: state.direction(symbol, true), shortTrade: state.direction(symbol, false), candles: market.candles,
            definitions: createTradebookDefinitions(plan), attendanceAllowed: true,
            watchlistBlockReason: watchlist.length > 1 ? `more than 1 stocks in watchlist: ${watchlist.join(', ')}` : '',
            realizedPnl: ledger.realizedPnL, dailyMaxLoss: policy.dailyMaxLoss, riskDollars: policy.riskDollars,
            liquidityScale: market.liquidityScale, secondsSinceMarketOpen: marketTime(now).minutesSinceMarketOpen * 60,
            openPrice: market.openPrice, vwap: market.vwap, atr: plan.atr.average, maxQuantity: plan.atr.maxQuantity,
            watchAreas: plan.analysis.watchAreas ?? [], noTradeZones: plan.analysis.noTradeZones ?? [],
            volumes: market.candles.filter(candle => !marketTime(candle.datetime).isPremarket).map(candle => candle.volume),
            highOfDay: market.highOfDay, lowOfDay: market.lowOfDay,
            customEntryPrice: manual.customEntryPrice ?? 0, customStopLong: manual.customStopLong ?? 0, customStopShort: manual.customStopShort ?? 0,
            fixedQuantity: manual.fixedQuantity ?? plan.fixedQuantity ?? 0, availableBuyingPower: account.currentBalance * 3.9 - usedBuyingPower,
            reloadIsLong: netQuantity !== 0 ? isLong : trades.at(-1)?.entries[0]?.isBuy ?? true,
            lastExitSize, crosshairPrice: manual.crosshairPrice ?? 0, todayRange: Math.round(plan.atr.average * plan.atr.mutiplier * 100) / 100,
            longState: direction(true), shortState: direction(false), activeBasePlan: state.symbol(symbol).activeBasePlan,
            isGappedUp: market.openPrice > plan.analysis.gap.pdc, premarketHigh: market.premarketHigh, premarketLow: market.premarketLow,
            addTargetLong: reference(plan.long.firstTargetToAdd), addTargetShort: reference(plan.short.firstTargetToAdd),
            maxRiskMultipleWithExistingPosition: policy.maxRiskMultipleWithExistingPosition, allowAddIfBelow: policy.allowAddIfBelow,
        },
    };
}
