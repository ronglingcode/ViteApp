import * as MassiveLite from '../api/massiveLite';
import * as SchwabLite from '../api/schwabLite';
import * as StateLite from '../models/stateLite';
import * as MarketDataState from './marketDataState';

type PostToMain = (message: StateLite.WorkerToMainMessage) => void;

export class LiteWorkerStreamManager {
    private massiveStreamer: MassiveLite.MassiveStreamer | null = null;
    private schwabStreamer: SchwabLite.SchwabStreamer | null = null;
    private readonly marketState: MarketDataState.MarketDataState;

    constructor(private readonly post: PostToMain) {
        this.marketState = new MarketDataState.MarketDataState(post);
    }

    stop() {
        this.massiveStreamer?.close();
        this.schwabStreamer?.close();
        this.massiveStreamer = null;
        this.schwabStreamer = null;
        this.marketState.stop();
    }

    async start(payload: StateLite.LiteStartPayload) {
        this.stop();
        this.marketState.reset(payload.watchlist);

        this.post({ type: 'status', source: 'lite', status: `starting ${payload.watchlist.length} symbols` });
        await this.loadHistory(payload);
        this.startMassive(payload);
        this.startSchwabIfEnabled(payload);
    }

    private async loadHistory(payload: StateLite.LiteStartPayload) {
        await Promise.all(payload.watchlist.map(async item => {
            try {
                let candles = await MassiveLite.getTodayMinuteBars(item.symbol, payload.secrets.massive.apiKey);
                this.marketState.replaceHistory(item.symbol, candles);
            } catch (error) {
                this.post({
                    type: 'error',
                    source: 'massive history',
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }));
    }

    private startMassive(payload: StateLite.LiteStartPayload) {
        let symbolList = payload.watchlist.map(item => item.symbol);
        this.massiveStreamer = new MassiveLite.MassiveStreamer(payload.secrets.massive.apiKey, symbolList, {
            onStatus: status => this.post({ type: 'status', source: 'massive', status }),
            onTrade: trade => this.marketState.updateFromTrade(trade),
            onQuote: quote => this.marketState.updateFromQuote(quote),
            onError: message => this.post({ type: 'error', source: 'massive', message }),
        });
        this.massiveStreamer.connect();
    }

    private startSchwabIfEnabled(payload: StateLite.LiteStartPayload) {
        if (!payload.enableSchwabStreamer || !payload.secrets.streamerInfo) {
            this.post({ type: 'status', source: 'schwab', status: 'stream off' });
            return;
        }

        let symbolList = payload.watchlist.map(item => item.symbol);
        this.schwabStreamer = new SchwabLite.SchwabStreamer(
            payload.secrets.schwab.accessToken,
            payload.secrets.streamerInfo,
            symbolList,
            {
                onStatus: status => this.post({ type: 'status', source: 'schwab', status }),
                onQuote: quote => this.marketState.updateFromQuote(quote),
                onAccountActivity: summary => this.post({ type: 'accountActivity', summary }),
                onError: message => this.post({ type: 'error', source: 'schwab', message }),
            }
        );
        this.schwabStreamer.connect();
    }
}
