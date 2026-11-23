import * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as Helper from '../utils/helper';
import * as Handler from './handler';
import * as ExitRules from './exitRulesCheckerNew';
import * as OrderFlow from './orderFlow';
import * as AdjustExits from './adjustExitsHandler';
import { wallOutPairs, wallOutTarget, type WallOutSnapshot } from '../trading/core/controllers/wallOut';

export async function wallOutPartials(symbol: string, count: number, snapshot: WallOutSnapshot) {
    const logTags = Models.generateLogTags(symbol, `${symbol}-wall_out_${count}`);
    const netQuantity = Models.getPositionNetQuantity(symbol);
    if (!Number.isFinite(netQuantity) || netQuantity === 0) throw new Error('No open position');
    const isLong = netQuantity > 0;
    if (!Handler.hasSplitPartials(symbol, isLong)) throw new Error('Wall Out requires split protective orders');
    const allPairs = Models.getExitOrdersPairs(symbol);
    const pairs = wallOutPairs(allPairs, count, isLong);
    const { targetPrice, wallPrice, wallSize } = wallOutTarget(isLong, snapshot);
    // Validate every selected limit before submitting either replacement.
    for (const pair of pairs) {
        if (!ExitRules.isAllowedToAdjustSingleLimitOrder(symbol, allPairs.indexOf(pair), pair.LIMIT!, pair, targetPrice, logTags)) {
            throw new Error('Exit rules blocked Wall Out');
        }
    }
    Firestore.logInfo(`Wall Out ${count}: ${pairs.length} partial(s) @ ${targetPrice}, wall ${wallSize} @ ${wallPrice}`, logTags);
    // Always adjust LIMIT legs, even if the two-cent offset crosses the current price.
    if (await OrderFlow.adjustExitPairsWithNewPrice(symbol, pairs, targetPrice, false, isLong, logTags)) {
        AdjustExits.afterAdjustSingleExit(symbol, allPairs.length);
    }
}

export function reportWallOutError(symbol: string, error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    Firestore.logError(`Wall Out blocked for ${symbol}: ${reason}`, Models.generateLogTags(symbol, 'wall_out'));
    Helper.speak(`Wall Out blocked for ${symbol}: ${reason}`);
}
