import * as webRequest from './utils/webRequest';
import * as TimeHelper from './utils/timeHelper';
import * as Broker from './api/broker';
import * as SchwabApi from './api/schwab/api';
import * as Watchlist from './algorithms/watchlist';
import * as TradingState from './models/tradingState';
import * as Models from './models/models';

interface UserPrincipal {
    [key: string]: any;
}

interface TosClient {
    createWatchlist: () => Promise<any[]>;
    initialize: () => Promise<void>;
    userPrincipal: UserPrincipal;
}

declare let window: Models.MyWindow;

window.TradingApp.TOS = (function (): TosClient {
    let userPrincipal: UserPrincipal = {};
    
    const initialize = async (): Promise<void> => {
        let r0 = await Models.setConfigData();
        let r1 = await Broker.refreshAccessToken();
        if (r0 && r1) {
            let r2 = await createWatchlist();
            let r3 = await SchwabApi.getUserPreference();
            let r4 = await setInitialAccount();
        }
    };

    /* #region Account */

    const setInitialAccount = async (): Promise<boolean> => {
        let brokerAccount = await Broker.syncAccount('initial');
        let result = false;
        if (brokerAccount) {
            result = await TradingState.initializeTradingState(brokerAccount);
        }
        if (!TimeHelper.isMarketOpen()) {
            let a = Models.getPositionSymbols();
            if (a.length > 0) {
                alert(`has overnight position: ${a}`);
            }
        }

        return result;
    };
    
    /* #endregion */
    
    const createWatchlist = async (): Promise<any[]> => {
        let stocks = await Watchlist.createWatchlist();
        TradingState.addStocksFromWatchlist(stocks);
        return stocks;
    };

    return {
        createWatchlist,
        initialize,
        userPrincipal,
    };
})();

