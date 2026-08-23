import * as RiskManager from '../../algorithms/riskManager';
import * as Models from '../../models/models';

interface ControlButtonCallbacks {
    setOrderStatus: (message: string, isError?: boolean) => void;
    logEvent: (message: string, isError?: boolean) => void;
    handleError: (source: string, error: unknown) => void;
    refreshAccount: () => Promise<void>;
}

const runControlAction = async (
    label: string,
    callbacks: ControlButtonCallbacks,
    action: () => void | Promise<void>
) => {
    try {
        await action();
        callbacks.setOrderStatus(label);
        callbacks.logEvent(label);
    } catch (error) {
        callbacks.handleError(label, error);
    }
};

const checkQuantityWithoutStops = (callbacks: ControlButtonCallbacks) => {
    let watchlist = Models.getWatchlist();
    watchlist.forEach(item => {
        let quantity = RiskManager.getQuanityWithoutStopLoss(item.symbol);
        if (quantity > 0) {
            callbacks.logEvent(`${item.symbol} has ${quantity} shares without stop loss`, true);
        } else {
            callbacks.logEvent(`${item.symbol} check quantity is good`);
        }
    });
    callbacks.setOrderStatus(`Checked quantity for ${watchlist.length} symbols`);
};

export const setupMainAppControlButtons = (callbacks: ControlButtonCallbacks) => {
    document.getElementById('show_execution')?.addEventListener('click', () => {
        runControlAction('Generated execution script in console', callbacks, async () => {
            await callbacks.refreshAccount();
            let Broker = await import('../../api/broker');
            Broker.generateExecutionScript(false);
        });
    });
    document.getElementById('show_execution_detail')?.addEventListener('click', () => {
        runControlAction('Generated detailed execution script in console', callbacks, async () => {
            await callbacks.refreshAccount();
            let Broker = await import('../../api/broker');
            Broker.generateExecutionScript(true);
        });
    });
    document.getElementById('export_trades')?.addEventListener('click', () => {
        runControlAction('Exported trades in console', callbacks, async () => {
            await callbacks.refreshAccount();
            let TvTools = await import('../../tools/tradingview');
            TvTools.exportTrades();
        });
    });
    document.getElementById('check_quantity')?.addEventListener('click', () => {
        checkQuantityWithoutStops(callbacks);
    });
    document.getElementById('update_account_ui')?.addEventListener('click', () => {
        runControlAction('Updated account UI', callbacks, callbacks.refreshAccount);
    });
    document.getElementById('test_popup')?.addEventListener('click', () => {

    });
};
