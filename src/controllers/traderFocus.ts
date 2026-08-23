import * as Models from '../models/models';
import * as TradingState from '../models/tradingState';
import * as TradebooksManager from '../tradebooks/tradebooksManager';

export const getTradebookFromPosition = (symbol: string) => {
    let position = Models.getOpenPositions();
    for (let i = 0; i < position.length; i++) {
        if (position[i].symbol === symbol) {
            let isLong = position[i].netQuantity > 0;
            let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
            if (!breakoutTradeState) {
                return null;
            }
            let tradebookID = breakoutTradeState.submitEntryResult.tradeBookID;
            let tradebook = TradebooksManager.getTradebookByID(symbol, tradebookID);
            if (!tradebook) {
                return;
            }
            return tradebook;
        }
    }
    return null;
}
