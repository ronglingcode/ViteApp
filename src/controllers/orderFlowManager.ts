import { RollingWindow } from "./rollingWindow";
import { SimpleRollingWindow } from "./simpleRollingWindow";
import * as Firestore from '../firestore';
import * as Models from '../models/models';
import * as DB from '../data/db';

const WINDOW_IN_SECONDS = 30;
const MAX_POINTS_IN_WINDOW = 100;
export const spreadMonitors = new Map<string, SimpleRollingWindow<number>>();
export const schwabSpreadMonitors = new Map<string, SimpleRollingWindow<Models.LevelOneQuote>>();
export const alpacaSpreadMonitors = new Map<string, SimpleRollingWindow<Models.LevelOneQuote>>();
export const orderImbalanceMonitors = new Map<string, RollingWindow>();
export const orderSizeMonitors = new Map<string, RollingWindow>();
export const level1HistoryMonitors = new Map<string, string[]>();

const alpacaWindowSize = 10;
const schwabWindowSize = 6;
export const getOrCreateLevel1History = (symbol: string) => {
    if (!level1HistoryMonitors.has(symbol)) {
        level1HistoryMonitors.set(symbol, []);
    }
    return level1HistoryMonitors.get(symbol)!;
}
export const getOrCreateOrderSizeMonitor = (symbol: string) => {
    if (!orderSizeMonitors.has(symbol)) {
        orderSizeMonitors.set(symbol, new RollingWindow(WINDOW_IN_SECONDS / 2, MAX_POINTS_IN_WINDOW));
    }
    return orderSizeMonitors.get(symbol)!;
}

export const getOrCreateSpreadMonitor = (symbol: string) => {
    let windowSize = DB.levelOneQuoteSource == DB.levelOneQuoteSourceAlpaca ? alpacaWindowSize : schwabWindowSize;
    if (!spreadMonitors.has(symbol)) {
        spreadMonitors.set(symbol, new SimpleRollingWindow<number>(windowSize));
    }
    return spreadMonitors.get(symbol)!;
}
export const getOrCreateSchwabSpreadMonitor = (symbol: string) => {
    if (!schwabSpreadMonitors.has(symbol)) {
        schwabSpreadMonitors.set(symbol, new SimpleRollingWindow<Models.LevelOneQuote>(schwabWindowSize));
    }
    return schwabSpreadMonitors.get(symbol)!;
}
export const getOrCreateAlpacaSpreadMonitor = (symbol: string) => {
    if (!alpacaSpreadMonitors.has(symbol)) {
        alpacaSpreadMonitors.set(symbol, new SimpleRollingWindow(alpacaWindowSize));
    }
    return alpacaSpreadMonitors.get(symbol)!;
}

export const getOrCreateOrderImbalanceMonitor = (symbol: string) => {
    if (!orderImbalanceMonitors.has(symbol)) {
        orderImbalanceMonitors.set(symbol, new RollingWindow(WINDOW_IN_SECONDS, MAX_POINTS_IN_WINDOW));
    }
    return orderImbalanceMonitors.get(symbol)!;
}
const getSpreadInAtrPercent = (symbol: string, quoteData: Models.LevelOneQuote) => {
    let spread = quoteData.askPrice - quoteData.bidPrice;
    let atr = Models.getAtr(symbol).average;
    let spreadInAtr = spread / atr;
    let spreadInATRPercent = spreadInAtr * 100;
    spreadInATRPercent = Math.round(spreadInATRPercent * 100) / 100;
    return spreadInATRPercent;
}
export const updateSchwabQuote = (symbol: string, quoteData: Models.LevelOneQuote) => {
    const schwabSpreadMonitor = getOrCreateSchwabSpreadMonitor(symbol);
    schwabSpreadMonitor.push(quoteData);
}
export const getSchwabLevelOneQuote = (symbol: string) => {
    const schwabSpreadMonitor = getOrCreateSchwabSpreadMonitor(symbol);
    return schwabSpreadMonitor.getItems();
}

export const updateAlpacaQuote = (symbol: string, quoteData: Models.LevelOneQuote) => {
    const alpacaSpreadMonitor = getOrCreateAlpacaSpreadMonitor(symbol);
    alpacaSpreadMonitor.push(quoteData);
}
export const getAlpacaLevelOneQuote = (symbol: string) => {
    const alpacaSpreadMonitor = getOrCreateAlpacaSpreadMonitor(symbol);
    return alpacaSpreadMonitor.getItems();
}

export const updateQuote = (symbol: string, bidSize: number, askSize: number, bidPrice: number, askPrice: number, spreadInAtr: number) => {
    const orderImbalanceMonitor = getOrCreateOrderImbalanceMonitor(symbol);
    const spreadMonitor = getOrCreateSpreadMonitor(symbol);
    const orderSizeMonitor = getOrCreateOrderSizeMonitor(symbol);

    spreadMonitor.push(spreadInAtr);
    let orderImbalance = Math.abs(bidSize - askSize);
    if (orderImbalance > 0) {
        orderImbalanceMonitor.push(orderImbalance);
    }
    orderSizeMonitor.push(bidSize);
    orderSizeMonitor.push(askSize);
    const level1History = getOrCreateLevel1History(symbol);
    level1History.push(`${bidPrice},${bidSize},${askPrice},${askSize}`);
}
export const exportQuoteHistory = (symbol: string) => {
    const level1History = getOrCreateLevel1History(symbol);
    console.log(level1History);
    return level1History;
}
export const getSpreadDataPoints = (symbol: string) => {
    const spreadMonitor = getOrCreateSpreadMonitor(symbol);
    return spreadMonitor.getItems();
}

export const orderIsImbalanced = (symbol: string, bidSize: number, askSize: number) => {
    const orderImbalanceMonitor = getOrCreateOrderImbalanceMonitor(symbol);
    let orderImbalance = Math.abs(bidSize - askSize);
    let zScore = (orderImbalance - orderImbalanceMonitor.avg()) / orderImbalanceMonitor.vol();
    zScore = Math.abs(zScore);
    let isImbalanced = zScore > 8;
    if (isImbalanced) {
        let msg = `${symbol}, ` +
            `avg: ${Math.round(orderImbalanceMonitor.avg() * 100) / 100}, ` +
            `vol: ${Math.round(orderImbalanceMonitor.vol() * 100) / 100}, ` +
            `current: ${orderImbalance}, `;
        Firestore.logInfo(msg);
    }
    return isImbalanced;
}
export const orderSizeIsLarge = (symbol: string, bidSize: number, askSize: number) => {
    const orderSizeMonitor = getOrCreateOrderSizeMonitor(symbol);
    let zScoreBid = (bidSize - orderSizeMonitor.avg()) / orderSizeMonitor.vol();
    let zScoreAsk = (askSize - orderSizeMonitor.avg()) / orderSizeMonitor.vol();
    let isLarge = Math.abs(zScoreBid) > 8 || Math.abs(zScoreAsk) > 8;
    if (isLarge) {
        let msg = `${symbol}, ` +
            `avg: ${Math.round(orderSizeMonitor.avg() * 100) / 100}, ` +
            `vol: ${Math.round(orderSizeMonitor.vol() * 100) / 100}, ` +
            `bid: ${bidSize}, ` +
            `ask: ${askSize}, `;
        //Firestore.logInfo(msg);
    }
    return isLarge;
}

export const isSingleSpreadTooLarge = (spreadInPoints: number, atr: number) => {
    let spreadInAtrPercent = spreadInPoints * 100 / atr;
    return isSpreadTooLargeCore(spreadInPoints, spreadInAtrPercent, atr);
}

export const isSingleSpreadInAtrPercentTooLarge = (spreadInAtrPercent: number, atr: number) => {
    let spreadInPoints = spreadInAtrPercent * atr / 100;
    return isSpreadTooLargeCore(spreadInPoints, spreadInAtrPercent, atr);

}
const isSpreadTooLargeCore = (spreadInPoints: number, spreadInAtrPercent: number, atr: number) => {
    // disable this check due to some stocks has very large ATR
    /*
    if (spreadInPoints > 0.5) {
        return "too large";
    }*/
    if (spreadInPoints <= 0.02) {
        return "ok";
    }
    if (spreadInAtrPercent >= 5) {
        return "too large";
    } else if (spreadInAtrPercent > 3.5) {
        return "quite large";
    } else {
        return "ok";
    }
}