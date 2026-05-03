import * as Models from '../models/models';
import * as Chart from './chart';
import * as Config from '../config/config';
import * as TimeHelper from '../utils/timeHelper';
import * as Helper from '../utils/helper';
declare let window: Models.MyWindow;

/** True while clock diff is in the red zone; used to speak only on transition into bad sync. */
let clockSyncWarningSpoken = false;

export let currentChartReviewIndex: number = -1;

export const addToNetwork = (source: string) => {
    return;
    /*
    let network = document.getElementById("network");
    if (!network) {
        return;
    }
    let currentText = network.textContent;
    currentText += `_${source} `;

    while (currentText.length > 35) {
        currentText = currentText.slice(2);
    }
    network.innerHTML = currentText;
    */
}

export const updateTotalTrades = () => {
    let totalTrades = 0;
    let nonBreakevenTradesCount = 0;
    if (window.HybridApp.AccountCache) {
        nonBreakevenTradesCount = window.HybridApp.AccountCache.nonBreakevenTradesCount;
        totalTrades = window.HybridApp.AccountCache.tradesCount;
    }
    let node = document.getElementById("totalTrades");
    if (node) {
        node.innerText = `${nonBreakevenTradesCount}/${totalTrades}`;
    }
};

export const reviewChartStart = () => {
    let w = Models.getWatchlist();
    let count = w.length;
    for (let i = 0; i < count; i++) {
        Chart.invisibleChart(w[i].symbol);
    }
    currentChartReviewIndex = 0;
    Chart.visibleChart(w[currentChartReviewIndex].symbol);
    return count > 1;
};

export const reviewNextChart = () => {
    let w = Models.getWatchlist();
    let count = w.length;
    currentChartReviewIndex++;
    let hasNextChart = true;
    if (currentChartReviewIndex >= count) {
        for (let i = 0; i < count; i++) {
            Chart.visibleChart(w[i].symbol);
        }
        hasNextChart = false;
    } else {
        for (let i = 0; i < count; i++) {
            Chart.invisibleChart(w[i].symbol);
        }
        Chart.visibleChart(w[currentChartReviewIndex].symbol);
        hasNextChart = true;
    }
    return hasNextChart;
};

export const syncAndUpdate = (delaySeconds: number) => {
    if (Config.getProfileSettings().brokerName == "TradeStation") {
        setTimeout(() => {
            let symbols = window.HybridApp.SymbolsList;
            Chart.updateAccountUIStatus(symbols, 'sync and update');
        }, delaySeconds * 1000);
    }
};

export const setupAutoSync = () => {
    if (Config.getProfileSettings().brokerName == "TradeStation") {
        setInterval(() => {
            syncAndUpdate(0);
        }, 5000);
    }
};

export const displayState = (state: Models.TradingState) => {
    state.stateBySymbol.forEach((symbolState: Models.SymbolState, symbol: string) => {
        //Chart.displayState(symbol, symbolState.breakoutTradeState.status, symbolState.breakoutTradeState.exitLocked);
    });
};

export const addOneLineDiv = (root: HTMLElement, text: string, className?: string) => {
    let div = document.createElement("div");
    div.textContent = text;
    if (className) {
        div.className = className;
    }
    root.appendChild(div);
}
export const addOneLineSpan = (root: HTMLElement, text: string, className?: string) => {
    let span = document.createElement("span");
    span.textContent = text;
    if (className) {
        span.className = className;
    }
    root.appendChild(span);
}
export const updateClock = (timeAndSalesTime: Date) => {
    let clock = document.getElementById("clock");
    if (!clock)
        return;
    let localTime = new Date();
    TimeHelper.setCurrentMarketTime(timeAndSalesTime);
    let localTimeString = TimeHelper.formatDateToHHMMSSMMM(localTime);
    let marketTimeString = TimeHelper.formatDateToHHMMSSMMM(timeAndSalesTime);

    // Calculate time difference in seconds
    let timeDiffMs = Math.abs(localTime.getTime() - timeAndSalesTime.getTime());
    let timeDiffSeconds = timeDiffMs / 1000;
    let timeDiffString = timeDiffSeconds.toFixed(1);

    let clockText = `Local: ${localTimeString} Market: ${marketTimeString} Diff: ${timeDiffString}s`;

    // If difference is larger than 0.5 seconds, show in red
    let secondsSinceMarketOpen = Helper.getSecondsSinceMarketOpen(new Date());
    if (timeDiffSeconds > 0.5 && secondsSinceMarketOpen < 15) {
        clock.style.color = 'red';
        if (!clockSyncWarningSpoken) {
            clockSyncWarningSpoken = true;
            let msg = `warning, local clock out of sync with market time by ${timeDiffString} seconds`;
            setTimeout(() => Helper.speak(msg), 1000);
        }
    } else {
        clock.style.color = '';
        clockSyncWarningSpoken = false;
    }

    clock.textContent = clockText;
}