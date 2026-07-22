import * as Config from '../config/config';
import * as Models from '../models/models';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as AppVersion from '../config/appVersion';
import * as ReplayApi from './replayApi';
declare let window: Models.MyWindow;

export interface ReplayCaptureWorkerConfig {
    recordingId: string;
    socketUrl: string;
    cutoverEpochMs: number;
    finalizeAtEpochMs: number;
    nextSequence: number;
    recordingStartedAtEpochMs: number;
}

let recording: ReplayApi.ReplayManifest | null = null;
let lastBootstrap: ReplayApi.ReplayBootstrap | null = null;
let finalBootstrapTimer: ReturnType<typeof setTimeout> | null = null;
let bootstrapSource: {
    symbol: string;
    dailyBars: Models.Candle[];
    premarketDollarCollection: Models.PremarketDollarCollection;
    sharesOutstanding: number;
} | null = null;

const getMarketDate = () => {
    const currentDay = Config.Settings.currentDay;
    const year = currentDay.getFullYear();
    const month = String(currentDay.getMonth() + 1).padStart(2, '0');
    const day = String(currentDay.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const getScheduledCutoverEpochMs = () => Config.Settings.marketOpenTime.getTime() - 2 * 60 * 1000;

export const canCaptureCurrentSession = () => {
    const regularSessionEndEpochMs = Config.Settings.marketOpenTime.getTime() + 6.5 * 60 * 60 * 1000;
    const dayOfWeek = Config.Settings.currentDay.getDay();
    return dayOfWeek !== 0 && dayOfWeek !== 6 && Date.now() < regularSessionEndEpochMs + 5000;
};

export const start = async (
    symbol: string,
    cutoverEpochMs = getScheduledCutoverEpochMs(),
): Promise<ReplayCaptureWorkerConfig | undefined> => {
    const marketOpenEpochMs = Config.Settings.marketOpenTime.getTime();
    const regularSessionEndEpochMs = Config.Settings.marketOpenTime.getTime() + 6.5 * 60 * 60 * 1000;
    if (!canCaptureCurrentSession()) {
        console.log('[replay capture] outside a regular market capture day; recording disabled');
        return undefined;
    }
    try {
        const response = await ReplayApi.createRecording({
            marketDate: getMarketDate(),
            symbol,
            cutoverEpochMs,
            marketOpenEpochMs,
            appVersion: AppVersion.appVersion,
            // The logical capture boundary can be a few milliseconds before the
            // ProxyServer responds and the capture WebSocket is attached.
            captureStartedAtEpochMs: Math.min(Date.now(), cutoverEpochMs),
        });
        recording = response.manifest;
        lastBootstrap = null;
        console.log(`[replay capture] recording ${recording.recordingId}`);
        return {
            recordingId: recording.recordingId,
            socketUrl: ReplayApi.getCaptureWebSocketUrl(response.capturePath),
            cutoverEpochMs: recording.cutoverEpochMs,
            // Allow the final 100 ms trade flush and the 1 second capture flush to settle.
            finalizeAtEpochMs: regularSessionEndEpochMs + 5000,
            nextSequence: (recording.lastSequence ?? -1) + 1,
            recordingStartedAtEpochMs: recording.captureStartedAtEpochMs,
        };
    } catch (error) {
        console.warn('[replay capture] ProxyServer unavailable; live data will not be recorded', error);
        return undefined;
    }
};

const buildRuntimeSnapshot = (symbol: string): ReplayApi.ReplayRuntimeSnapshot => {
    const item = Models.getWatchlist().find(candidate => candidate.symbol === symbol);
    return {
        activeProfileName: window.HybridApp.TradingData.activeProfileName,
        tradingSettings: window.HybridApp.TradingData.tradingSettings,
        tradingPlanForSymbol: TradingPlans.getTradingPlans(symbol),
        marketCapInMillions: item?.marketCapInMillions ?? 0,
    };
};

const getHistoricalCandlesBeforeCutover = (symbol: string, fallback: Models.Candle[]) => {
    if (!recording) return [];
    const currentCandles = Models.getSymbolData(symbol).candles;
    const source = currentCandles.length > 0 ? currentCandles : fallback;
    return source
        .filter(candle => candle.datetime < recording!.cutoverEpochMs)
        .map(candle => ({
            symbol: candle.symbol,
            time: candle.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            datetime: candle.datetime,
            vwap: candle.vwap,
        }));
};

const uploadCurrentBootstrap = async (fallbackCandles: Models.Candle[]) => {
    if (!recording || !bootstrapSource) return;
    const candles = getHistoricalCandlesBeforeCutover(bootstrapSource.symbol, fallbackCandles);
    if (candles.length === 0) {
        console.warn('[replay capture] historical candles are not available yet');
        return;
    }
    const bootstrap: ReplayApi.ReplayBootstrap = {
        symbol: bootstrapSource.symbol,
        marketDate: recording.marketDate,
        cutoverEpochMs: recording.cutoverEpochMs,
        today1MinuteBars: candles,
        dailyBars: bootstrapSource.dailyBars,
        premarketDollarCollection: bootstrapSource.premarketDollarCollection,
        sharesOutstanding: bootstrapSource.sharesOutstanding,
        runtimeSnapshot: buildRuntimeSnapshot(bootstrapSource.symbol),
    };
    lastBootstrap = bootstrap;
    await ReplayApi.uploadBootstrap(recording.recordingId, bootstrap);
    console.log(`[replay capture] bootstrap saved with ${candles.length} M1 candles`);
};

export const saveBootstrap = async (
    symbol: string,
    priceHistory: {
        today1MinuteBars: Models.Candle[];
        dailyBars: Models.Candle[];
        premarketDollarCollection: Models.PremarketDollarCollection;
    },
    sharesOutstanding: number,
    scheduleCutoverRefresh = true,
) => {
    if (!recording) return;
    bootstrapSource = {
        symbol,
        dailyBars: priceHistory.dailyBars,
        premarketDollarCollection: priceHistory.premarketDollarCollection,
        sharesOutstanding,
    };
    await uploadCurrentBootstrap(priceHistory.today1MinuteBars).catch(error => {
        console.warn('[replay capture] failed to save initial bootstrap', error);
    });

    if (!scheduleCutoverRefresh) return;
    if (finalBootstrapTimer) clearTimeout(finalBootstrapTimer);
    const finalSnapshotDelay = Math.max(0, recording.cutoverEpochMs + 2000 - Date.now());
    finalBootstrapTimer = setTimeout(() => {
        uploadCurrentBootstrap(priceHistory.today1MinuteBars).catch(error => {
            console.warn('[replay capture] failed to save cutover bootstrap', error);
        });
    }, finalSnapshotDelay);
};

/** Update late-arriving fundamentals without rebuilding candles after capture started. */
export const updateBootstrapSharesOutstanding = async (sharesOutstanding: number) => {
    if (!recording || !lastBootstrap) return;
    lastBootstrap = { ...lastBootstrap, sharesOutstanding };
    await ReplayApi.uploadBootstrap(recording.recordingId, lastBootstrap).catch(error => {
        console.warn('[replay capture] failed to update bootstrap shares outstanding', error);
    });
};

export const getRecordingId = () => recording?.recordingId ?? '';
