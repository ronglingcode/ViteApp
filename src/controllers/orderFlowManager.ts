import { SimpleRollingWindow } from "./simpleRollingWindow";
import * as DB from '../data/db';

export const spreadMonitors = new Map<string, SimpleRollingWindow<number>>();

const alpacaWindowSize = 10;
const schwabWindowSize = 6;

export const getOrCreateSpreadMonitor = (symbol: string) => {
    let windowSize = DB.levelOneQuoteSource == DB.levelOneQuoteSourceAlpaca ? alpacaWindowSize : schwabWindowSize;
    if (!spreadMonitors.has(symbol)) {
        spreadMonitors.set(symbol, new SimpleRollingWindow<number>(windowSize));
    }
    return spreadMonitors.get(symbol)!;
}

export const updateQuote = (symbol: string, bidSize: number, askSize: number, bidPrice: number, askPrice: number, spreadInAtr: number) => {
    const spreadMonitor = getOrCreateSpreadMonitor(symbol);
    spreadMonitor.push(spreadInAtr);
}
export const getSpreadDataPoints = (symbol: string) => {
    const spreadMonitor = getOrCreateSpreadMonitor(symbol);
    return spreadMonitor.getItems();
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