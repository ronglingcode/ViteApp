import * as Models from '../models/models';
import { toCoreFill } from '../trading/adapters/browserAccount.ts';
import { executionTradesCsv } from '../trading/core/account/executionExports.ts';

export const exportTrades = () => {
    console.log(executionTradesCsv(Models.getAllOrderExecutions(undefined).map(toCoreFill), Date.now()));
};
