import * as Models from '../models/models';
import * as TradingState from '../models/tradingState';
import * as Helper from '../utils/helper';
import * as Chart from '../ui/chart';
import * as UI from '../ui/ui';
import * as Handler from './handler';
import * as EntryHandler from './entryHandler';
import * as Broker from '../api/broker';
import * as Firestore from '../firestore';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as AutoTrader from '../algorithms/autoTrader';

export const handleKeyPressed = (code: string, shiftKey: boolean) => {
    let uiState = Models.getUIState();
    let symbol = uiState.activeSymbol;

    if (!symbol) {
        console.log("no active symbol, skip");
        return;
    }
    //console.log(keyboardEvent);
    let secondsSinceMarketOpen = Helper.getSecondsSinceMarketOpen(new Date());
    console.log(code);
    let codeIsUsed = true;
    let symbolState = TradingState.getSymbolState(symbol);
    let netQuantity = Models.getPositionNetQuantity(symbol);

    if (code === "KeyB" || code === "KeyS") {
        let isLong = code === 'KeyB';
        handleEntry(symbol, isLong, secondsSinceMarketOpen, shiftKey);
    } else if (code === 'Space') {
        Chart.clearPriceLines(symbol);
    } else if (code === "KeyC") {
        // shift + c or just c: cancel all
        Handler.cancelKeyPressed(symbol);
        Firestore.logInfo("cancel all for " + symbol);
    } else if (code === "KeyQ") {
        // shift + q or just q: cancel entry orders
        Broker.cancelBreakoutEntryOrders(symbol);
        TradingState.clearPendingOrder(symbol);
        Firestore.logInfo("cancel new entries for " + symbol);
    } else if (code === "KeyF") {
        Handler.flattenPostionKeyPressed(symbol);
    } else if (["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0"].includes(code)) {
        Handler.numberKeyPressed(symbol, code, false);
    } else if (["Numpad1", "Numpad2", "Numpad3", "Numpad4", "Numpad5", "Numpad6", "Numpad7", "Numpad8", "Numpad9", "Numpad0"].includes(code)) {
        Handler.numberPadPressed(symbol, code);
    } else if (code == 'KeyM') {
        Handler.numberPadPressed(symbol, "Numpad1");
    } else if (code === 'KeyT' || code === 'KeyG' || code === 'KeyH') {
        Handler.adjustBatchExits(symbol, code, shiftKey);
    }
    else if (code === 'KeyW') {
        Handler.swapPositionKeyPressed(symbol);
    } else if (code === 'KeyV') {
        Handler.vwapBounceFail(symbol, shiftKey);
    } else if (code === 'KeyA') {
        Handler.reloadPartialPressed(symbol, shiftKey);
    } else if (code === 'KeyR') {
        Handler.setRiskLevel(symbol);
    } else if (code === 'KeyE') {
        // https://sunrisetrading.atlassian.net/browse/TPS-394
        Firestore.logError(`disabled move stop to breakeven`);
        //let isLong = netQuantity > 0;
        //Handler.moveToInitialEntry(symbol, isLong);
    } else if (code === 'KeyZ') {
        Handler.setCustomStopLoss(symbol);
    } else if (code === 'KeyO') {
        EntryHandler.clickOpenChasePlan(symbol, shiftKey);
    } else if (code === 'KeyP') {
        Handler.replaceWithProfitTakingExitOrders(symbol, false, 0);
    } else if (code === 'KeyU') {
        AutoTrader.pauseAlgo(symbol);
    } else if (code == 'KeyJ') {
        Handler.trailStop(symbol, 5, shiftKey);
    } else if (code == 'KeyK') {
        Handler.trailStop(symbol, 15, shiftKey);
    } else if (code == 'KeyL') {
        Handler.trailStop(symbol, 30, shiftKey);
    }
    else {
        codeIsUsed = false;
    }

    if (codeIsUsed) {
        let hasShiftKey = shiftKey ? 'with shift key' : 'without shift key';
        Firestore.logInfo(`${symbol} ${code} pressed ${hasShiftKey}`);
        UI.syncAndUpdate(1);
    }
};

const handleEntry = (symbol: string, isLong: boolean, secondsSinceMarketOpen: number, shiftKey: boolean) => {
    if (secondsSinceMarketOpen <= 0) {
        Firestore.logError("market not open yet");
        return;
    }
    let p = TradingPlans.getTradingPlansForSingleDirection(symbol, isLong);
    EntryHandler.entryAfterOpen(symbol, isLong, shiftKey, secondsSinceMarketOpen, p);
};
