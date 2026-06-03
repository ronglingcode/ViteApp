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

const guessNetQuantityFromExitOrder = (exitIsBuy: boolean) => {
    return exitIsBuy ? -1 : 1;
};

export class LiteExitAdjuster {
    private busySymbols = new Set<string>();

    constructor(private readonly callbacks: ExitAdjusterCallbacks) { }

    resetBusy() {
        this.busySymbols.clear();
    }

    async handleKeyboardAdjust(event: KeyboardEvent) {
        let target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
            return;
        }
        if (!digitKeyCodes.has(event.code) && !batchAdjustKeyCodes.has(event.code)) {
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
        let firstPair = ChartLite.getExitOrderPairs(symbol)[0] ?? this.callbacks.getExitPairs(symbol)[0];
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
        let pairs = ChartLite.getExitOrderPairs(symbol);
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

    private async replaceExitPairAtPrice(
        pair: StateLite.LiteExitPair,
        newPrice: number,
        stopLeg: boolean
    ) {
        let activeSecrets = this.callbacks.getActiveSecrets();
        if (!activeSecrets) {
            throw new Error('Not connected');
        }
        return SchwabLite.replaceExitPairWithNewPrice(
            activeSecrets.schwab,
            activeSecrets.schwab.accessToken,
            pair,
            newPrice,
            stopLeg
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

    private async handleBatchAdjust(symbol: string, code: string, shiftKey: boolean) {
        if (shiftKey) {
            this.callbacks.logEvent(`${code} with shift ignored in lite`);
            return;
        }
        let pairs = ChartLite.getExitOrderPairs(symbol);
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
