import * as WebRequest from '../../utils/webRequest';
import * as Config from '../../config/config';
import * as Firestore from '../../firestore';
import * as TimeHelper from '../../utils/timeHelper';
import * as Broker from '../../api/broker';
import * as MarketData from '../../api/marketData';
import * as tdaApi from '../../api/tdAmeritrade/api';
import * as schwabApi from '../../api/schwab/api';
import * as alpacaApi from '../../api/alpaca/api';
import * as TakeProfit from '../../algorithms/takeProfit';
import * as RiskManager from '../../algorithms/riskManager';
import * as Watchlist from '../../algorithms/watchlist';
import * as AutoTrader from '../../algorithms/autoTrader';
import * as Handler from '../../controllers/handler';
import * as OrderFlow from '../../controllers/orderFlow';
import * as OrderFlowManager from '../../controllers/orderFlowManager';
import * as TraderFocus from '../../controllers/traderFocus';
import * as BasicIndicators from '../../indicators/basicIndicators';
import * as Models from '../../models/models';
import * as TradingPlans from '../../models/tradingPlans/tradingPlans';
import * as TradingState from '../../models/tradingState';
import * as TradebooksManager from '../../tradebooks/tradebooksManager';
import * as Chart from '../../ui/chart';
import * as QuestionPopup from '../../ui/questionPopup';
import * as UI from '../../ui/ui';
import type { Tradebook } from '../../tradebooks/baseTradebook';
import * as Helper from '../../utils/helper';
import * as StateLite from '../models/stateLite';

interface TradebookRenderCallbacks {
    onStatus: (message: string, isError?: boolean) => void;
    onAfterEntry: () => Promise<void>;
}

const getHybridApp = () => {
    let appWindow = window as any;
    appWindow.HybridApp = appWindow.HybridApp ?? {};
    let hybridApp = appWindow.HybridApp;
    hybridApp.Algo = hybridApp.Algo ?? {};
    hybridApp.Algo.TakeProfit = TakeProfit;
    hybridApp.Models = hybridApp.Models ?? {};
    hybridApp.UI = hybridApp.UI ?? {};
    hybridApp.Api = hybridApp.Api ?? {};
    hybridApp.Config = Config;
    hybridApp.Controllers = hybridApp.Controllers ?? {};
    hybridApp.Utils = hybridApp.Utils ?? {};
    hybridApp.Firestore = Firestore;
    hybridApp.ChartWidgets = hybridApp.ChartWidgets ?? new Map<string, any>();
    hybridApp.SymbolData = hybridApp.SymbolData ?? new Map<string, Models.SymbolData>();
    hybridApp.AccountCache = hybridApp.AccountCache ?? createEmptyBrokerAccount();
    hybridApp.Settings = hybridApp.Settings ?? {};
    hybridApp.Settings.checkSpread = true;
    hybridApp.Settings.liteMode = true;
    hybridApp.UIState = hybridApp.UIState ?? {
        activeTabIndex: -1,
    };
    hybridApp.Secrets = hybridApp.Secrets ?? {};
    hybridApp.Secrets.tdameritrade = hybridApp.Secrets.tdameritrade ?? {};
    hybridApp.Secrets.tradeStation = hybridApp.Secrets.tradeStation ?? {};
    hybridApp.Secrets.schwab = hybridApp.Secrets.schwab ?? {};
    hybridApp.TradingData = hybridApp.TradingData ?? {
        activeProfileName: '',
        tradingSettings: {
            useSingleOrderForEntry: false,
            snapMode: true,
        },
    };
    hybridApp.Algo.RiskManager = RiskManager;
    hybridApp.Algo.Watchlist = Watchlist;
    hybridApp.Algo.AutoTrader = AutoTrader;
    hybridApp.Api.Broker = Broker;
    hybridApp.Api.MarketData = MarketData;
    hybridApp.Api.TdaApi = tdaApi;
    hybridApp.Api.SchwabApi = schwabApi;
    hybridApp.Api.AlpacaApi = alpacaApi;
    hybridApp.Controllers.Handler = Handler;
    hybridApp.Controllers.OrderFlow = OrderFlow;
    hybridApp.Controllers.OrderFlowManager = OrderFlowManager;
    hybridApp.Controllers.TraderFocus = TraderFocus;
    hybridApp.Models.Models = Models;
    hybridApp.Models.TradingState = TradingState;
    hybridApp.Models.TradingPlans = TradingPlans;
    hybridApp.UI.Chart = Chart;
    hybridApp.UI.UI = UI;
    hybridApp.UI.QuestionPopup = QuestionPopup;
    hybridApp.Utils.Helper = Helper;
    hybridApp.Utils.WebRequest = WebRequest;
    hybridApp.Utils.TimeHelper = TimeHelper;
    return hybridApp;
};

const createEmptyBrokerAccount = (): Models.BrokerAccount => {
    return {
        orderExecutions: new Map(),
        entryOrders: new Map(),
        exitPairs: new Map(),
        positions: new Map(),
        currentBalance: 0,
        trades: new Map(),
        tradesCount: 0,
        nonBreakevenTradesCount: 0,
        realizedPnL: 0,
    };
};

const toModelOrder = (order: StateLite.LiteOrderModel | undefined): Models.OrderModel | undefined => {
    if (!order) {
        return undefined;
    }
    return {
        ...order,
        orderType: order.orderType as Models.OrderType,
    };
};

const toModelEntryOrder = (order: StateLite.LiteOrderModel): Models.EntryOrderModel => {
    return toModelOrder(order) as Models.EntryOrderModel;
};

const toModelExitPair = (pair: StateLite.LiteExitPair): Models.ExitPair => {
    return {
        symbol: pair.symbol,
        STOP: toModelOrder(pair.STOP),
        LIMIT: toModelOrder(pair.LIMIT),
        source: pair.source,
        parentOrderID: pair.parentOrderID,
    };
};

const toModelCandle = (symbol: string, candle: StateLite.Candle): Models.CandlePlus => {
    let localDate = Helper.tvTimestampToLocalJsDate(candle.time);
    let datetime = localDate.getTime();
    return {
        symbol,
        time: candle.time as any,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        datetime,
        vwap: candle.close,
        minutesSinceMarketOpen: Helper.getMinutesSinceMarketOpen(localDate),
        firstTradeTime: datetime,
    };
};

const createVolumePoint = (candle: StateLite.Candle) => {
    return {
        time: candle.time as any,
        value: candle.volume,
    };
};

const updateVwapData = (symbol: string) => {
    let symbolData = Models.getSymbolData(symbol);
    let totalVolume = 0;
    let totalTradingAmount = 0;
    let premarketDollarTraded = 0;
    let premktAboveVwapCount = 0;
    let premktBelowVwapCount = 0;
    symbolData.m1Vwaps = [];
    symbolData.candles.forEach(candle => {
        let previousVwap = totalVolume > 0 ? totalTradingAmount / totalVolume : 0;
        let tradingAmount = candle.volume * Models.getTypicalPrice(candle);
        if (candle.minutesSinceMarketOpen < 0) {
            premarketDollarTraded += tradingAmount;
            if (previousVwap > 0 && candle.minutesSinceMarketOpen > -30) {
                if (candle.close > previousVwap) {
                    premktAboveVwapCount++;
                } else if (candle.close < previousVwap) {
                    premktBelowVwapCount++;
                }
            }
        }
        totalVolume += candle.volume;
        totalTradingAmount += tradingAmount;
        symbolData.m1Vwaps.push({
            time: candle.time,
            value: totalVolume > 0 ? totalTradingAmount / totalVolume : candle.close,
        });
    });
    symbolData.totalVolume = totalVolume;
    symbolData.totalTradingAmount = totalTradingAmount;
    symbolData.premarketDollarTraded = premarketDollarTraded;
    symbolData.premktAboveVwapCount = premktAboveVwapCount;
    symbolData.premktBelowVwapCount = premktBelowVwapCount;
};

const updateSessionHighLow = (symbol: string) => {
    let symbolData = Models.getSymbolData(symbol);
    symbolData.highOfDay = 0;
    symbolData.lowOfDay = 99999999;
    symbolData.premktHigh = 0;
    symbolData.premktLow = 99999999;
    symbolData.candles.forEach(candle => {
        if (candle.minutesSinceMarketOpen < 0) {
            symbolData.premktHigh = Math.max(symbolData.premktHigh, Math.ceil(candle.high * 100) / 100);
            symbolData.premktLow = Math.min(symbolData.premktLow, Math.floor(candle.low * 100) / 100);
        } else {
            symbolData.highOfDay = Math.max(symbolData.highOfDay, Math.ceil(candle.high * 100) / 100);
            symbolData.lowOfDay = Math.min(symbolData.lowOfDay, Math.floor(candle.low * 100) / 100);
        }
    });
};

const getRequiredElement = <T extends Element>(container: ParentNode, selector: string): T => {
    let element = container.querySelector(selector);
    if (!element) {
        throw new Error(`Missing lite chart element ${selector}`);
    }
    return element as T;
};

const getElementOrFallback = <T extends HTMLElement>(container: ParentNode, selector: string, tagName = 'span'): T => {
    return (container.querySelector(selector) ?? document.createElement(tagName)) as T;
};

const createLiteWidgetHtmlContents = (index: number): Models.ChartWidgetHtmlContents => {
    let container = document.getElementById(`chartContainer${index}`);
    if (!container) {
        throw new Error(`Missing lite chart container ${index}`);
    }
    let chart = getRequiredElement<HTMLElement>(container, `#chart${index}`);
    let currentCandle = getRequiredElement<HTMLElement>(container, '.currentCandle');
    let quantityBar = getRequiredElement<HTMLElement>(container, '.quantityBar');
    let quantityInputs = quantityBar.getElementsByTagName('input');
    let quantityButtons = quantityBar.getElementsByTagName('button');
    let tradingPlans = getRequiredElement<HTMLElement>(container, '.tradingPlans');
    let sideBar = getRequiredElement<HTMLElement>(container, '.sideBar');

    return {
        chartM1: chart,
        symbol: getRequiredElement<HTMLElement>(container, `[id="symbol${index}"]`),
        container,
        positionCount: getRequiredElement<Element>(container, '.positionCount'),
        popupWindow: document.getElementById(`chart${index}popup`) as HTMLElement,
        exitOrders: getRequiredElement<HTMLElement>(container, '.exitOrders'),
        exitButtonsContainer: getRequiredElement<HTMLElement>(container, '.exitButtons'),
        timeframeButtonsContainer: document.createElement('span'),
        currentCandle: {
            open: getRequiredElement<HTMLElement>(currentCandle, '.ohlc_o'),
            high: getRequiredElement<HTMLElement>(currentCandle, '.ohlc_h'),
            low: getRequiredElement<HTMLElement>(currentCandle, '.ohlc_l'),
            close: getRequiredElement<HTMLElement>(currentCandle, '.ohlc_c'),
        },
        quantityElements: {
            input: quantityInputs[0],
            largeOrderInput: quantityInputs[1] ?? document.createElement('input'),
            percentageButton: quantityButtons[0],
            fixedQuantityButton: quantityButtons[1],
        },
        tradingPlans: {
            long: getElementOrFallback<HTMLElement>(tradingPlans, '.tradingPlansLong'),
            short: getElementOrFallback<HTMLElement>(tradingPlans, '.tradingPlansShort'),
        },
        sideBar,
        tradebookButtons: getRequiredElement<HTMLElement>(sideBar, '.tradebookButtons'),
    };
};

const registerLiteChartWidget = (symbol: string, tradebooks: Map<string, Tradebook>, index: number) => {
    let existingWidget = Models.getChartWidget(symbol) as any;
    let widget = existingWidget ?? {};
    widget.symbol = symbol;
    widget.tabIndex = index;
    widget.htmlContents = widget.htmlContents ?? createLiteWidgetHtmlContents(index);
    widget.tradebooks = tradebooks;
    widget.entryOrders = widget.entryOrders ?? [];
    widget.exitOrderPairs = widget.exitOrderPairs ?? [];
    Models.setChartWidget(symbol, widget as Models.ChartWidget);
};

const createButton = (text: string, className: string, parent: HTMLElement) => {
    let button = document.createElement('div');
    button.textContent = text;
    button.classList.add(className);
    parent.appendChild(button);
    return button;
};

const createEntryParameters = (entryMethod: string): Models.TradebookEntryParameters => {
    return {
        entryMethod,
        useFirstNewHigh: false,
        useCurrentCandleHigh: false,
        useMarketOrderWithTightStop: false,
    };
};

const renderTradebook = (
    tradebook: Tradebook,
    sideBar: HTMLElement,
    callbacks: TradebookRenderCallbacks
) => {
    let entryMethods = tradebook.getEntryMethods();
    let container = document.createElement('div');
    container.dataset.liteTradebook = 'true';

    let title = document.createElement('div');
    title.textContent = tradebook.buttonLabel;
    title.classList.add(tradebook.isLong ? 'longButtonTitle' : 'shortButtonTitle');
    container.appendChild(title);

    let stats = document.createElement('div');
    container.appendChild(stats);

    let entryMethodButtons = document.createElement('div');
    entryMethodButtons.classList.add('entryMethodButtons');
    if (entryMethods.length > 1 && entryMethods.every(entryMethod => entryMethod.trim().length < 10)) {
        entryMethodButtons.classList.add('twoButtonsPerRow');
    }
    container.appendChild(entryMethodButtons);

    let buttonClassName = tradebook.isLong ? 'longButton' : 'shortButton';
    let buttons: HTMLElement[] = [];
    let methodsToRender = entryMethods.length > 0 ? entryMethods : [tradebook.buttonLabel];
    methodsToRender.forEach(entryMethod => {
        let button = createButton(entryMethod, buttonClassName, entryMethodButtons);
        buttons.push(button);
        button.addEventListener('click', pointerEvent => {
            try {
                let size = tradebook.startEntry(
                    pointerEvent.shiftKey,
                    false,
                    createEntryParameters(entryMethods.length > 0 ? entryMethod : '')
                );
                callbacks.onStatus(`${tradebook.symbol} ${tradebook.buttonLabel} size ${size}`);
                callbacks.onAfterEntry().catch(error => callbacks.onStatus(String(error), true));
            } catch (error) {
                callbacks.onStatus(error instanceof Error ? error.message : String(error), true);
            }
        });
    });

    tradebook.linkButton(buttons, stats, container);
    container.style.display = tradebook.isEnabled() || tradebook.enableByDefault ? 'block' : 'none';
    sideBar.appendChild(container);
};

export const initializeSharedRuntime = (
    config: StateLite.LiteConfigData,
    watchlist: StateLite.LiteWatchlistItem[],
    secrets: StateLite.LiteSecrets
) => {
    let hybridApp = getHybridApp();
    hybridApp.TradingPlans = config.tradingPlans;
    hybridApp.StockSelections = config.stockSelections;
    hybridApp.Watchlist = watchlist.map(item => ({
        symbol: item.symbol,
        marketCapInMillions: item.marketCapInMillions ?? 0,
    }));
    hybridApp.TradingData = {
        activeProfileName: config.activeProfileName,
        tradingSettings: config.tradingSettings,
    };
    hybridApp.Secrets.schwab = {
        ...hybridApp.Secrets.schwab,
        accessToken: secrets.schwab.accessToken,
        accountHash: secrets.schwab.accountHash,
        schwabClientChannel: secrets.streamerInfo?.schwabClientChannel ?? '',
        schwabClientCorrelId: secrets.streamerInfo?.schwabClientCorrelId ?? '',
        schwabClientCustomerId: secrets.streamerInfo?.schwabClientCustomerId ?? '',
        schwabClientFunctionId: secrets.streamerInfo?.schwabClientFunctionId ?? '',
        streamerSocketUrl: secrets.streamerInfo?.streamerSocketUrl ?? '',
    };
};

export const renderTradebooksForWatchlist = (
    watchlist: StateLite.LiteWatchlistItem[],
    callbacks: TradebookRenderCallbacks
) => {
    watchlist.slice(0, 4).forEach((item, index) => {
        let panel = document.getElementById(`chartContainer${index}`);
        let sideBar = panel?.querySelector('.tradebookButtons') as HTMLElement | null;
        if (!sideBar) {
            return;
        }

        sideBar.querySelectorAll('[data-lite-tradebook="true"]').forEach(element => element.remove());
        let tradebooks = TradebooksManager.createAllTradebooks(item.symbol);
        registerLiteChartWidget(item.symbol, tradebooks, index);
        TradebooksManager.updateTradebooksStatus(
            item.symbol,
            tradebooks,
            Models.getCurrentPrice(item.symbol),
            0
        );
        tradebooks.forEach(tradebook => renderTradebook(tradebook, sideBar, callbacks));
    });
};

export const syncAccountSnapshot = (account: StateLite.LiteAccountSnapshot) => {
    let hybridApp = getHybridApp();
    let previousAccount = hybridApp.AccountCache as Models.BrokerAccount | undefined;
    let nextAccount = createEmptyBrokerAccount();
    nextAccount.orderExecutions = account.orderExecutions;
    nextAccount.entryOrders = new Map();
    nextAccount.trades = previousAccount?.trades ?? new Map();
    nextAccount.currentBalance = account.currentBalance || previousAccount?.currentBalance || 0;
    nextAccount.tradesCount = previousAccount?.tradesCount ?? 0;
    nextAccount.nonBreakevenTradesCount = previousAccount?.nonBreakevenTradesCount ?? 0;
    nextAccount.realizedPnL = previousAccount?.realizedPnL ?? 0;

    hybridApp.ChartWidgets.forEach((widget: any) => {
        widget.entryOrders = [];
        widget.exitOrderPairs = [];
    });
    account.positions.forEach(position => {
        nextAccount.positions.set(position.symbol, {
            symbol: position.symbol,
            averagePrice: position.averagePrice,
            netQuantity: position.quantity,
        });
    });
    account.exitPairs.forEach((pairs, symbol) => {
        nextAccount.exitPairs.set(symbol, pairs.map(toModelExitPair));
        let widget = Models.getChartWidget(symbol) as any;
        if (widget) {
            widget.exitOrderPairs = nextAccount.exitPairs.get(symbol) ?? [];
        }
    });
    account.entryOrders.forEach((orders, symbol) => {
        nextAccount.entryOrders.set(symbol, orders.map(toModelEntryOrder));
        let widget = Models.getChartWidget(symbol) as any;
        if (widget) {
            widget.entryOrders = nextAccount.entryOrders.get(symbol) ?? [];
        }
    });
    hybridApp.AccountCache = nextAccount;
};

export const syncHistory = (symbol: string, candles: StateLite.Candle[], dailyCandles: StateLite.Candle[] = []) => {
    let symbolData = Models.getSymbolData(symbol);
    let modelCandles = candles.map(candle => toModelCandle(symbol, candle));
    symbolData.candles = modelCandles;
    symbolData.m1Candles = modelCandles.slice();
    let volumePoints = candles.map(createVolumePoint);
    symbolData.volumes = volumePoints;
    symbolData.m1Volumes = volumePoints.slice();
    updateSessionHighLow(symbol);
    updateVwapData(symbol);
    if (dailyCandles.length > 0) {
        BasicIndicators.updateIndicators(
            symbol,
            symbolData,
            dailyCandles.map(candle => toModelCandle(symbol, candle))
        );
    }
};

export const syncSnapshot = (snapshot: StateLite.MarketSnapshot) => {
    if (!snapshot.candle) {
        return;
    }
    let symbolData = Models.getSymbolData(snapshot.symbol);
    let modelCandle = toModelCandle(snapshot.symbol, snapshot.candle);
    let lastIndex = symbolData.candles.length - 1;
    if (lastIndex >= 0 && symbolData.candles[lastIndex].time === modelCandle.time) {
        symbolData.candles[lastIndex] = modelCandle;
        symbolData.m1Candles[lastIndex] = modelCandle;
        symbolData.volumes[lastIndex] = createVolumePoint(snapshot.candle);
        symbolData.m1Volumes[lastIndex] = symbolData.volumes[lastIndex];
    } else {
        symbolData.candles.push(modelCandle);
        symbolData.m1Candles.push(modelCandle);
        let volumePoint = createVolumePoint(snapshot.candle);
        symbolData.volumes.push(volumePoint);
        symbolData.m1Volumes.push(volumePoint);
    }
    if (snapshot.bid != null) {
        symbolData.bidPrice = snapshot.bid;
        symbolData.schwabLevelOneQuote.bidPrice = snapshot.bid;
    }
    if (snapshot.ask != null) {
        symbolData.askPrice = snapshot.ask;
        symbolData.schwabLevelOneQuote.askPrice = snapshot.ask;
    }
    updateSessionHighLow(snapshot.symbol);
    updateVwapData(snapshot.symbol);
    TradebooksManager.refreshTradebooksStatusForSymbol(snapshot.symbol);
};
