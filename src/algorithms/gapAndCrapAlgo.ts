import * as Models from '../models/models';
export const getAllowedReasonToAddPartial = (symbol: string, entryPrice: number, logTags: Models.LogTags): Models.CheckRulesResult => {
    let vwap = Models.getCurrentVwap(symbol);
    if (entryPrice < vwap) {
        return {
            allowed: true,
            reason: `entry price ${entryPrice} is below vwap ${vwap}`,
        };
    }
    return {
        allowed: false,
        reason: 'default is no add',
    };
}