import * as googleDocsApi from '../api/googleDocs/googleDocsApi';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as Models from '../models/models';
import * as TradingState from '../models/tradingState';
import * as TradebooksManager from '../tradebooks/tradebooksManager';
import * as UI from '../ui/ui';
import * as Firestore from '../firestore';

export const updateUI = async () => {
    let config = await TradingPlans.fetchConfigData();
    let googleDocContent = await googleDocsApi.fetchDocumentContent(config.googleDocId);
    let { bestIdeas } = googleDocsApi.parseGoogleDoc(googleDocContent);
    populateBestIdeas(bestIdeas);
    updateTradeManagementUI();
}
export const populateBestIdeas = (bestIdeas: Map<string, string[]>) => {
    let traderFocusPlansContent = document.getElementById("traderFocusPlansContent");
    if (!traderFocusPlansContent) {
        return;
    }
    traderFocusPlansContent.innerHTML = "";
    bestIdeas.forEach((ideasList, symbol) => {
        if (!traderFocusPlansContent) {
            return;
        }
        let container = document.createElement("div");
        container.className = "ticker";
        UI.addOneLineDiv(container, symbol, "symbolTitle");
        traderFocusPlansContent.appendChild(container);
        let ul = document.createElement("ul");
        for (let i = 0; i < ideasList.length; i++) {
            let li = document.createElement("li");
            li.textContent = ideasList[i];
            ul.appendChild(li);
        }
        container.appendChild(ul);
    });
}

export const updateTradeManagementUI = () => {
    let traderFocusInstructionsContent = document.getElementById("traderFocusInstructionsContent");
    if (traderFocusInstructionsContent) {
        traderFocusInstructionsContent.innerHTML = "";
        let positions = Models.getOpenPositions();
        positions.forEach(position => {
            if (traderFocusInstructionsContent) {
                populateTradeManagementForPosition(position, traderFocusInstructionsContent);
            }
        });
    }
}
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
export const getTradeManagementFromPosition = (symbol: string) => {
    let tradebook = getTradebookFromPosition(symbol);
    if (!tradebook) {
        return new Map<string, string[]>();
    }
    return tradebook.getTradeManagementInstructions();
}
export const populateTradeManagementForPosition = (position: Models.Position, root: HTMLElement) => {
    let symbol = position.symbol;
    if (position.netQuantity === 0) {
        return;
    }
    let isLong = position.netQuantity > 0;
    let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
    if (!breakoutTradeState) {
        Firestore.logError(`should have breakoutTradeState for position ${symbol}`);
        return;
    }
    let tradebookID = breakoutTradeState.submitEntryResult.tradeBookID;
    populateTradeManagementForTradebook(symbol, isLong, tradebookID, root);
}
export const populateTradeManagementForTradebook = (symbol: string, isLong: boolean, tradebookID: string, root: HTMLElement) => {
    let tradebook = TradebooksManager.getTradebookByID(symbol, tradebookID);
    if (!tradebook) {
        Firestore.logInfo(`tradebook not found for ${symbol} ${tradebookID}`);
        return;
    }
    let container = document.createElement("div");
    container.className = "ticker";
    root.appendChild(container);


    let instructions = tradebook.getTradeManagementInstructions().mapData;

    let tickerTitle = document.createElement("div");
    tickerTitle.className = "ticker-title";
    container.appendChild(tickerTitle);

    UI.addOneLineDiv(tickerTitle, symbol, "");
    let tagClassName = isLong ? "tag tag-long" : "tag tag-short";
    UI.addOneLineSpan(tickerTitle, tradebook.name, tagClassName);
    instructions.forEach((instruction, sectionName) => {
        UI.addOneLineDiv(container, sectionName, "subtitle");
        let ul = document.createElement("ul");
        for (let i = 0; i < instruction.length; i++) {
            let li = document.createElement("li");
            li.textContent = instruction[i];
            ul.appendChild(li);
        }
        container.appendChild(ul);
    });
}
export const test = () => {
    let traderFocusInstructionsContent = document.getElementById("traderFocusInstructionsContent");
    if (traderFocusInstructionsContent) {
        traderFocusInstructionsContent.innerHTML = "";
        populateTradeManagementForTradebook("GOOGL", true, "aboveWaterBreakout", traderFocusInstructionsContent);
    }
}