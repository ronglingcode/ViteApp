import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { MarketState } from '../src/trading/core/marketdata/marketState.ts';
import { marketTime } from '../src/trading/core/marketdata/marketClock.ts';

function load(relative, mocks) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', 'window', 'document', 'CustomEvent', 'setTimeout', js)(
        name => { if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`); return mocks[name]; },
        module, module.exports, { dispatchEvent() {} }, { getElementById() { return null; } }, class {}, () => 1);
    return module.exports;
}

test('actual browser DB uses headless prints, including prints before chart initialization', () => {
    const base = Date.parse('2026-10-01T13:30:00Z');
    const state = new MarketState('AAPL', '2026-10-01', 10000);
    state.initialize([{ symbol: 'AAPL', datetime: base - 60000, open: 10, high: 10, low: 10, close: 10, volume: 100, vwap: 10 }], base);
    const helper = {
        jsDateToTradingViewUTC: date => date.getTime() / 1000, jsDateToUTC: date => date.getTime() / 1000,
        numberToDate: value => new Date(value), tvTimestampToLocalJsDate: value => new Date(value * 1000),
        executeOncePerInterval: fn => fn, isMarketOpenTime: date => date.getTime() === base,
        getMinutesSinceMarketOpen: date => marketTime(date.getTime()).minutesSinceMarketOpen,
        getCurrentMarketTime: () => new Date(base), getSecondsSinceMarketOpen: () => 0,
        numberToStringWithPaddingToCents: String, largeNumberToString: String, roundToMillion: value => value / 1e6,
    };
    const loader = { getState: () => state, acceptTrade: trade => state.applyTrade(trade) };
    const adapter = load('../src/trading/adapters/browserMarket.ts', {
        '../runtime/marketLoader.ts': { MarketLoader: class { constructor() { return loader; } } },
        '../libraries/massive/api.ts': { MassiveApi: class {} }, './browserHttp.ts': { browserHttp: {} },
        '../../config/secret': {}, '../../utils/helper': helper, '../core/marketdata/marketClock.ts': { marketTime },
    });
    const noop = () => {}, series = { setData: noop, update: noop };
    const widget = { symbol: 'AAPL', isDark: true, openPriceSeries: series };
    let ready = false, closed = 0;
    const data = { candles: [], volumes: [], m1Vwaps: [], m1Candles: [], m1Volumes: [], m1ma5: [], m1ma9: [], keyAreaData: [], premktAboveVwapCount: 99 };
    const models = {
        getChartWidget: () => ready ? widget : undefined, getSymbolData: () => data,
        getChartsInAllTimeframes: () => [{ volumeSeries: series, candleSeries: series, vwapSeries: series }],
        getUsedTimeframe: () => 1, getMovingAverageCandle: () => undefined, getLiquidityScale: () => 0,
        getEmptyOpenRangeLineSeriesData: () => ({ openHigh: [], openLow: [], openPrice: [], orbArea: [] }),
        buildCandlePlus: (_symbol, candle, time, minutes) => ({ ...candle, time, minutesSinceMarketOpen: minutes }),
        getTypicalPrice: candle => candle.vwap, hasOpenPrice: () => false,
    };
    const chart = Object.fromEntries(['updateUI', 'syncCandlestickVisibility', 'resetPreMarketHighLineSeries', 'resetPreMarketLowLineSeries',
        'drawMomentumLevels', 'populatePreMarketLineSeries', 'drawIndicatorsForNewlyClosedCandle', 'onPriceHistoryLoaded', 'drawLevelsAfterChartInitialize'].map(key => [key, noop]));
    const db = load('../src/data/db.ts', {
        '../trading/adapters/browserMarket.ts': adapter, '../ui/chart': chart, '../utils/helper': helper,
        '../utils/timeHelper': { roundToTimeFrameBucketTime: date => date, setCurrentMarketTime: noop, getCurrentMarketTime: () => new Date(base), getMarketOpenTimeInLocal: () => new Date(base) },
        '../config/config': { Settings: { currentDay: new Date(base), marketOpenTime: new Date(base), dtStartTime: new Date(base - 60000) } },
        '../config/globalSettings': { skipLateTimeAndSalesChartUpdates: false }, '../firestore': {}, '../models/models': models,
        '../models/tradingPlans/tradingPlans': { getKeyAreasToDraw: () => [], getVwapCorrection: () => ({ volumeSum: 0, tradingSum: 0 }) },
        '../algorithms/autoTrader': { onNewTimeAndSalesData: noop, onMinuteClosed: () => closed++, onFirstDataAfterMarketOpen: noop },
        '../controllers/orderFlowManager': {}, '../ui/chartSettings': {}, '../api/broker': { cancelAllEntryOrders: noop },
        '../ui/ui': { updateClock: noop }, '../indicators/basicIndicators': { updateIndicators: noop },
        '../utils/candlestickVisibility': { shouldShowCandles: () => true }, '../utils/chartSeries': { safeUpdateSeries: noop },
    });
    const print = (price, size, offset, seq) => ({ symbol: 'AAPL', tradeTime: base + offset, timestamp: base + offset, lastPrice: price, lastSize: size, seq, conditions: [] });
    db.updateFromTimeSale(print(10, 100, 1, 1));
    assert.equal(state.metrics().totalVolume, 200);
    ready = true;
    // The caller's history snapshot is stale; DB must seed from the current core.
    assert.equal(db.initialize('AAPL', [], []), true);
    assert.equal(data.candles.length, 2); assert.equal(data.totalVolume, 200);
    assert.equal(data.premktAboveVwapCount, 0);
    db.updateFromTimeSalesBatch([print(12, 200, 2, 2), print(9, 100, 3, 3), print(9, 100, 3, 3)]);
    const candle = data.candles.at(-1);
    assert.deepEqual([candle.open, candle.high, candle.low, candle.close, candle.volume], [10, 12, 9, 9, 400]);
    assert.equal(data.totalTradingAmount, 5300); assert.equal(data.totalVolume, 500);
    assert.equal(data.m1Vwaps.at(-1).value, 10.6);
    db.updateFromTimeSale(print(11, 50, 60001, 4)); assert.equal(closed, 1);
    db.updateFromTimeSale(print(99, 999, 4, 5)); assert.equal(closed, 1);
    assert.equal(data.candles.length, 3); assert.equal(data.totalVolume, state.metrics().totalVolume);
    assert.equal(data.candles.at(-1).close, 11);
});
