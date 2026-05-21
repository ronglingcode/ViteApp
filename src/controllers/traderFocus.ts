import * as googleDocsApi from '../api/googleDocs/googleDocsApi';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as Models from '../models/models';
import * as TradingState from '../models/tradingState';
import * as TradebooksManager from '../tradebooks/tradebooksManager';
import * as UI from '../ui/ui';
import * as Firestore from '../firestore';
import * as ManagementCard from './managementCard';

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
        ManagementCard.render(traderFocusInstructionsContent, getManagementContexts());
    }
}
const getManagementContexts = (): ManagementCard.ManagementPositionContext[] => {
    let positions = Models.getOpenPositions();
    let positionBySymbol = new Map<string, Models.Position>();
    positions.forEach(position => {
        positionBySymbol.set(position.symbol, position);
    });

    return Models.getWatchlist().map(item => {
        let position = positionBySymbol.get(item.symbol);
        return {
            symbol: item.symbol,
            position: position,
            tradebookID: position ? getTradebookIDForPosition(position) : undefined,
        };
    });
}
const getTradebookIDForPosition = (position: Models.Position) => {
    let symbol = position.symbol;
    if (position.netQuantity === 0) {
        return undefined;
    }
    let isLong = position.netQuantity > 0;
    let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
    if (!breakoutTradeState) {
        Firestore.logError(`should have breakoutTradeState for position ${symbol}`);
        return undefined;
    }
    return breakoutTradeState.submitEntryResult.tradeBookID;
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
export const populateTradeManagementForPosition = (position: Models.Position, root: HTMLElement) => {
    if (position.netQuantity === 0) {
        return;
    }
    let tradebookID = getTradebookIDForPosition(position);
    ManagementCard.populateForPosition(position, root, tradebookID);
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

    let tickerTitle = document.createElement("div");
    tickerTitle.className = "ticker-title";
    container.appendChild(tickerTitle);

    UI.addOneLineDiv(tickerTitle, symbol, "");
    let tagClassName = isLong ? "tag tag-long" : "tag tag-short";
    UI.addOneLineSpan(tickerTitle, tradebook.name, tagClassName);
}
export const test = () => {
    let traderFocusInstructionsContent = document.getElementById("traderFocusInstructionsContent");
    if (traderFocusInstructionsContent) {
        let section = document.getElementById("traderFocusInstructions");
        if (section) {
            section.classList.remove("collapsed");
            let icon = section.querySelector(".collapseIcon");
            if (icon) {
                icon.textContent = "-";
            }
        }
        traderFocusInstructionsContent.innerHTML = "";
        ManagementCard.populateMockForTest(traderFocusInstructionsContent);
    }
}
