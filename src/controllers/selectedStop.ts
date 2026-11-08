import { SelectedStop, StopClaims } from '../trading/core/controllers/selectedStop';
import * as Chart from '../ui/chart';
import * as Firestore from '../firestore';
import type { LogTags } from '../models/models';

export const selection = new SelectedStop();
const claims = new StopClaims(selection);
let drawnSymbol: string | undefined;
selection.onChange(value => {
    if (drawnSymbol) Chart.clearSelectedStopLine(drawnSymbol);
    drawnSymbol = value?.symbol;
    if (value) Chart.drawStopLoss(value.symbol, value.price);
});
export function prepare(symbol: string, isLong: boolean, entry: number, tags: LogTags) {
    try { return claims.prepare(tags, symbol, isLong, entry); }
    catch (error) { Firestore.logError(error instanceof Error ? error.message : String(error), tags); return undefined; }
}
export function authorize(symbol: string, isLong: boolean, entry: number, stop: number, tags: LogTags) {
    try { claims.submit(tags, symbol, isLong, entry, stop); return true; }
    catch (error) { Firestore.logError(error instanceof Error ? error.message : String(error), tags); return false; }
}
