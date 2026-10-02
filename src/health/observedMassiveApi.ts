import { MassiveApi } from '../trading/libraries/massive/api.ts';
import { integrationHealth as health } from './integrationHealth.ts';

/** Browser observation covers MarketLoader and direct history calls, including pagination. */
export class ObservedMassiveApi extends MassiveApi {
    override async getBars(symbol: string, path: string) {
        health.begin(health.history);
        try {
            const bars = await super.getBars(symbol, path);
            health.success(health.history, `${symbol}: ${bars.length} bars`, !bars.length);
            return bars;
        } catch (error) { health.fail(health.history, error); throw error; }
    }
}
