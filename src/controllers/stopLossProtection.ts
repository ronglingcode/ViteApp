import { StopLossMonitor } from '../trading/core/controllers/stopLossMonitor.ts';
import * as Models from '../models/models';
import * as Broker from '../api/broker';
import * as TradingState from '../models/tradingState';
import * as Firestore from '../firestore';

const monitor = new StopLossMonitor();
let started = false;

export const observeStopLossProtection = (account: Models.BrokerAccount) => {
    const decision = monitor.observe([...account.positions].map(([symbol, position]) => ({
        symbol, netQuantity: position.netQuantity, pairs: account.exitPairs.get(symbol) ?? [],
    })), Date.now());
    for (const { symbol, uncovered } of decision.warnings)
        Firestore.logError(`${symbol} has ${uncovered} shares without stop loss; will close the full position if this persists more than 10 seconds`);
    for (const symbol of decision.close) {
        const tags = Models.generateLogTags(symbol, `${symbol}-stop-loss-safety-close`);
        const net = account.positions.get(symbol)!.netQuantity;
        const legs = (account.exitPairs.get(symbol) ?? []).map(pair => (pair.LIMIT ?? pair.STOP)!);
        if (legs.some(leg => !leg || leg.isBuy !== (net < 0) || !Number.isFinite(leg.quantity) || leg.quantity <= 0)
            || legs.reduce((sum, leg) => sum + leg.quantity, 0) > Math.abs(net)) {
            Firestore.logError(`${symbol} safety close blocked: exit orders disagree with the position`, tags);
            continue;
        }
        Firestore.logError(`${symbol} missing stop-loss coverage for more than 10 seconds; closing FULL position`, tags);
        TradingState.clearPendingOrder(symbol);
        void Broker.flattenPosition(symbol, net, tags)
            .catch(error => Firestore.logError(`${symbol} safety close failed: ${String(error)}`, tags));
    }
};

export const startStopLossProtection = () => {
    if (started) return;
    started = true;
    let reading = false;
    // Poll independently of quotes, watchlist membership and account-activity messages.
    setInterval(async () => {
        if (reading) return;
        reading = true;
        try { await Broker.syncAccount('stop-loss protection monitor'); }
        catch (error) { Firestore.logError(`Stop-loss protection account refresh failed: ${String(error)}`); }
        finally { reading = false; }
    }, 3000);
};
