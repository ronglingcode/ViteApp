import * as SchwabLite from '../api/schwabLite';
import * as StateLite from '../models/stateLite';
import * as ChartLite from '../ui/chartLite';

interface ExitAdjusterCallbacks {
    getActiveSymbol: () => string;
    getActiveSecrets: () => StateLite.LiteSecrets | null;
    getPositionQuantity: (symbol: string) => number;
    getExitPairs: (symbol: string) => StateLite.LiteExitPair[];
    getCurrentPrice: (symbol: string) => number | undefined;
    refreshAccount: () => Promise<void>;
    setOrderStatus: (message: string, isError?: boolean) => void;
    logEvent: (message: string, isError?: boolean) => void;
    handleError: (source: string, error: unknown) => void;
}

const digitKeyCodes = new Set([
    'Digit1',
    'Digit2',
    'Digit3',
    'Digit4',
    'Digit5',
    'Digit6',
    'Digit7',
    'Digit8',
    'Digit9',
    'Digit0',
]);

const batchAdjustKeyCodes = new Set(['KeyT', 'KeyG', 'KeyH']);
const marketActionKeyCodes = new Set(['KeyF', 'KeyM']);

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const guessNetQuantityFromExitOrder = (exitIsBuy: boolean) => {
    return exitIsBuy ? -1 : 1;
};

const pricesMatch = (left: number | undefined, right: number) => {
    return left != null && Math.abs(left - right) < 0.01;
};

const getPairLeg = (pair: StateLite.LiteExitPair, stopLeg: boolean) => {
    return stopLeg ? pair.STOP : pair.LIMIT;
};

const getMarketOutLeg = (pair: StateLite.LiteExitPair) => {
    return pair.LIMIT ?? pair.STOP;
};

export class LiteExitAdjuster {
    private busySymbols = new Set<string>();

    constructor(private readonly callbacks: ExitAdjusterCallbacks) { }

    resetBusy() {
        this.busySymbols.clear();
    }

    private getExitPairsForSymbol(symbol: string) {
        let chartPairs = ChartLite.getExitOrderPairs(symbol);
        return chartPairs.length > 0 ? chartPairs : this.callbacks.getExitPairs(symbol);
    }

    async handleKeyboardAdjust(event: KeyboardEvent) {
        let target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
            return;
        }
        if (!digitKeyCodes.has(event.code) && !batchAdjustKeyCodes.has(event.code) && !marketActionKeyCodes.has(event.code)) {
            return;
        }
        let symbol = this.callbacks.getActiveSymbol();
        if (!symbol) {
            return;
        }
        event.preventDefault();
        if (this.busySymbols.has(symbol)) {
            return;
        }
        this.busySymbols.add(symbol);
        try {
            if (digitKeyCodes.has(event.code)) {
                await this.handleDigitAdjust(symbol, event.code);
            } else if (event.code === 'KeyM') {
                await this.handleMarketOutFirstPair(symbol);
            } else if (event.code === 'KeyF') {
                await this.handleFlatten(symbol);
            } else {
                await this.handleBatchAdjust(symbol, event.code, event.shiftKey);
            }
        } catch (error) {
            this.callbacks.handleError('adjust exits', error);
        } finally {
            this.busySymbols.delete(symbol);
        }
    }

    private getNetQuantityForLegChoice(symbol: string) {
        let positionQuantity = this.callbacks.getPositionQuantity(symbol);
        if (positionQuantity !== 0) {
            return positionQuantity;
        }
        let firstPair = this.getExitPairsForSymbol(symbol)[0];
        if (firstPair?.STOP) {
            return guessNetQuantityFromExitOrder(firstPair.STOP.isBuy);
        }
        if (firstPair?.LIMIT) {
            return guessNetQuantityFromExitOrder(firstPair.LIMIT.isBuy);
        }
        return 0;
    }

    private inferStopLegFromPairPrices(pair: StateLite.LiteExitPair, newPrice: number) {
        let stopPrice = pair.STOP?.price;
        let limitPrice = pair.LIMIT?.price;
        if (stopPrice == null || limitPrice == null) {
            return undefined;
        }
        return Math.abs(newPrice - stopPrice) <= Math.abs(newPrice - limitPrice);
    }

    private isStopLeg(symbol: string, newPrice: number, pair: StateLite.LiteExitPair) {
        let currentPrice = this.callbacks.getCurrentPrice(symbol);
        let netQuantity = this.getNetQuantityForLegChoice(symbol);
        if (currentPrice != null && netQuantity !== 0) {
            return (netQuantity > 0 && newPrice < currentPrice) ||
                (netQuantity < 0 && newPrice > currentPrice);
        }

        let inferredFromPair = this.inferStopLegFromPairPrices(pair, newPrice);
        if (inferredFromPair != null) {
            return inferredFromPair;
        }

        throw new Error(`Cannot choose STOP or LIMIT leg for ${symbol}`);
    }

    private getExitPairFromDigitKey(symbol: string, code: string) {
        let number = Number(code.replace('Digit', ''));
        if (number === 0) {
            number = 10;
        }
        let index = number - 1;
        let pairs = this.getExitPairsForSymbol(symbol);
        return {
            pair: pairs[index],
            index,
            totalPairsCount: pairs.length,
        };
    }

    private getCrosshairAdjustPrice(symbol: string) {
        let newPrice = ChartLite.getCrossHairPrice(symbol);
        if (!newPrice) {
            throw new Error(`No crosshair price for ${symbol}`);
        }
        return newPrice;
    }

    private adjustedOrderIsVisible(
        symbol: string,
        originalOrder: StateLite.LiteOrderModel,
        newPrice: number,
        stopLeg: boolean
    ) {
        let pairs = this.getExitPairsForSymbol(symbol);
        return pairs.some(pair => {
            let visibleOrder = getPairLeg(pair, stopLeg);
            if (!visibleOrder) {
                return false;
            }
            if (visibleOrder.orderID === originalOrder.orderID) {
                return pricesMatch(visibleOrder.price, newPrice);
            }
            return visibleOrder.orderType === originalOrder.orderType &&
                visibleOrder.isBuy === originalOrder.isBuy &&
                pricesMatch(visibleOrder.price, newPrice);
        });
    }

    private orderIsVisible(symbol: string, originalOrder: StateLite.LiteOrderModel) {
        let pairs = this.getExitPairsForSymbol(symbol);
        return pairs.some(pair => pair.STOP?.orderID === originalOrder.orderID || pair.LIMIT?.orderID === originalOrder.orderID);
    }

    private async refreshUntilAdjusted(
        symbol: string,
        originalOrder: StateLite.LiteOrderModel,
        newPrice: number,
        stopLeg: boolean
    ) {
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) {
                await wait(700);
            }
            await this.callbacks.refreshAccount();
            if (this.adjustedOrderIsVisible(symbol, originalOrder, newPrice, stopLeg)) {
                return true;
            }
        }
        return false;
    }

    private async refreshUntilOrderGone(symbol: string, originalOrder: StateLite.LiteOrderModel) {
        for (let attempt = 0; attempt < 4; attempt++) {
            if (attempt > 0) {
                await wait(800);
            }
            await this.callbacks.refreshAccount();
            if (!this.orderIsVisible(symbol, originalOrder)) {
                return true;
            }
        }
        return false;
    }

    private async replaceExitPairAtPrice(
        pair: StateLite.LiteExitPair,
        newPrice: number,
        stopLeg: boolean
    ) {
        let activeSecrets = this.callbacks.getActiveSecrets();
        if (!activeSecrets) {
            throw new Error('Not connected');
        }
        let order = getPairLeg(pair, stopLeg);
        if (!order) {
            throw new Error(`Missing ${stopLeg ? 'STOP' : 'LIMIT'} leg for ${pair.symbol}`);
        }
        try {
            await SchwabLite.replaceExitPairWithNewPrice(
                activeSecrets.schwab,
                activeSecrets.schwab.accessToken,
                pair,
                newPrice,
                stopLeg
            );
        } catch (error) {
            let adjusted = await this.refreshUntilAdjusted(pair.symbol, order, newPrice, stopLeg);
            if (adjusted) {
                this.callbacks.logEvent(`${pair.symbol} replace returned error, refresh confirmed order changed`, true);
                return;
            }
            throw error;
        }
    }

    private async marketOutExitPair(pair: StateLite.LiteExitPair) {
        let activeSecrets = this.callbacks.getActiveSecrets();
        if (!activeSecrets) {
            throw new Error('Not connected');
        }
        let order = getMarketOutLeg(pair);
        if (!order) {
            throw new Error(`Missing exit leg for ${pair.symbol}`);
        }
        try {
            await SchwabLite.replaceExitPairWithMarketOrder(
                activeSecrets.schwab,
                activeSecrets.schwab.accessToken,
                pair
            );
        } catch (error) {
            let adjusted = await this.refreshUntilOrderGone(pair.symbol, order);
            if (adjusted) {
                this.callbacks.logEvent(`${pair.symbol} market out returned error, refresh confirmed order changed`, true);
                return order.quantity;
            }
            throw error;
        }
        return order.quantity;
    }

    private async placeClosingMarketOrder(symbol: string, quantity: number, netQuantity: number) {
        let activeSecrets = this.callbacks.getActiveSecrets();
        if (!activeSecrets) {
            throw new Error('Not connected');
        }
        await SchwabLite.placeClosingMarketOrder(
            activeSecrets.schwab,
            activeSecrets.schwab.accessToken,
            symbol,
            quantity,
            netQuantity
        );
    }

    private async handleDigitAdjust(symbol: string, code: string) {
        let { pair, index, totalPairsCount } = this.getExitPairFromDigitKey(symbol, code);
        if (!pair) {
            throw new Error(`No exit pair ${index + 1} for ${symbol}; found ${totalPairsCount}`);
        }
        let newPrice = this.getCrosshairAdjustPrice(symbol);
        let stopLeg = this.isStopLeg(symbol, newPrice, pair);
        await this.replaceExitPairAtPrice(pair, newPrice, stopLeg);
        let legName = stopLeg ? 'STOP' : 'LIMIT';
        this.callbacks.setOrderStatus(`Adjusted ${symbol} pair ${index + 1} ${legName} @ ${StateLite.formatPrice(newPrice)}`);
        this.callbacks.logEvent(`Adjusted ${symbol} pair ${index + 1} ${legName} @ ${StateLite.formatPrice(newPrice)}`);
        await this.callbacks.refreshAccount();
    }

    private async handleMarketOutFirstPair(symbol: string) {
        let { pair, index, totalPairsCount } = this.getExitPairFromDigitKey(symbol, 'Digit1');
        if (!pair) {
            throw new Error(`No exit pair ${index + 1} for ${symbol}; found ${totalPairsCount}`);
        }
        let quantity = await this.marketOutExitPair(pair);
        this.callbacks.setOrderStatus(`Market out ${symbol} pair 1 qty ${StateLite.formatQuantity(quantity)}`);
        this.callbacks.logEvent(`Market out ${symbol} pair 1 qty ${StateLite.formatQuantity(quantity)}`);
        await this.callbacks.refreshAccount();
    }

    private async handleMarketOutHalf(symbol: string) {
        let pairs = this.getExitPairsForSymbol(symbol);
        if (pairs.length === 0) {
            throw new Error(`No exit pairs for ${symbol}`);
        }
        let pairsToMarketOut = pairs.slice(0, Math.ceil(pairs.length / 2));
        let totalQuantity = 0;
        for (let pair of pairsToMarketOut) {
            totalQuantity += await this.marketOutExitPair(pair);
        }
        this.callbacks.setOrderStatus(`Market out ${pairsToMarketOut.length} ${symbol} exits qty ${StateLite.formatQuantity(totalQuantity)}`);
        this.callbacks.logEvent(`Market out ${pairsToMarketOut.length} ${symbol} exits qty ${StateLite.formatQuantity(totalQuantity)}`);
        await this.callbacks.refreshAccount();
    }

    private async handleFlatten(symbol: string) {
        let netQuantity = this.callbacks.getPositionQuantity(symbol);
        let pairs = this.getExitPairsForSymbol(symbol);
        if (netQuantity === 0 && pairs.length === 0) {
            throw new Error(`No position or exit pairs for ${symbol}`);
        }

        let remainingQuantity = Math.abs(netQuantity);
        let marketOutQuantity = 0;
        for (let pair of pairs) {
            let quantity = await this.marketOutExitPair(pair);
            marketOutQuantity += quantity;
            remainingQuantity -= quantity;
        }
        if (netQuantity !== 0 && remainingQuantity > 0) {
            await this.placeClosingMarketOrder(symbol, remainingQuantity, netQuantity);
            marketOutQuantity += remainingQuantity;
        }
        this.callbacks.setOrderStatus(`Flatten ${symbol} qty ${StateLite.formatQuantity(marketOutQuantity)}`);
        this.callbacks.logEvent(`Flatten ${symbol} qty ${StateLite.formatQuantity(marketOutQuantity)}`);
        await this.callbacks.refreshAccount();
    }

    private async handleBatchAdjust(symbol: string, code: string, shiftKey: boolean) {
        if (shiftKey && (code === 'KeyG' || code === 'KeyH')) {
            await this.handleMarketOutHalf(symbol);
            return;
        }
        if (shiftKey) {
            this.callbacks.logEvent(`${code} with shift ignored in lite`);
            return;
        }
        let pairs = this.getExitPairsForSymbol(symbol);
        if (pairs.length === 0) {
            throw new Error(`No exit pairs for ${symbol}`);
        }
        let newPrice = this.getCrosshairAdjustPrice(symbol);
        let pairsToAdjust = code === 'KeyT' ? pairs : pairs.slice(0, Math.ceil(pairs.length / 2));
        let stopLeg = this.isStopLeg(symbol, newPrice, pairsToAdjust[0]);
        for (let pair of pairsToAdjust) {
            await this.replaceExitPairAtPrice(pair, newPrice, stopLeg);
        }
        let legName = stopLeg ? 'STOP' : 'LIMIT';
        this.callbacks.setOrderStatus(`Adjusted ${pairsToAdjust.length} ${symbol} ${legName} exits @ ${StateLite.formatPrice(newPrice)}`);
        this.callbacks.logEvent(`Adjusted ${pairsToAdjust.length} ${symbol} ${legName} exits @ ${StateLite.formatPrice(newPrice)}`);
        await this.callbacks.refreshAccount();
    }
}
