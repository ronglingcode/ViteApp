import * as Secret from '../../config/secret';
import * as GlobalSettings from '../../config/globalSettings';
import * as BookmapManager from '../../bookmap/bookmapManager';
import { OrderBookReconstructor } from './orderBookReconstructor';
import type { OrderBookLevel, OrderBookSnapshot } from '../../bookmap/bookmapModels';

// ============================================
// Databento MBP-10 Types
// ============================================

interface DatabentoLevel {
    bid_px: string;
    ask_px: string;
    bid_sz: number;
    ask_sz: number;
    bid_ct: number;
    ask_ct: number;
}

interface DatabentoMbp10Record {
    ts_recv: string;
    hd: {
        ts_event: string;
        rtype: number;
        publisher_id: number;
        instrument_id: number;
    };
    action: string;
    side: string;
    depth: number;
    price: string;
    size: number;
    flags: number;
    levels: DatabentoLevel[];
}

// ============================================
// Databento MBO Types
// ============================================

interface DatabentoMboRecord {
    ts_recv: string;
    hd: {
        ts_event: string;
        rtype: number;
        publisher_id: number;
        instrument_id: number;
    };
    order_id: string;
    channel_id: number;
    price: string;
    size: number;
    action: string; // A=Add, C=Cancel, M=Modify, T=Trade, F=Fill, R=Clear, N=None
    side: string;   // B=Bid, A=Ask, N=None
    flags: number;
    ts_in_delta: number;
    sequence: number;
}

// ============================================
// State
// ============================================

const activeFeeds: Map<string, AbortController> = new Map();
const reconstructors: Map<string, OrderBookReconstructor> = new Map();
const SAMPLE_INTERVAL_MS = 200; // target ~5 snapshots/sec

// ============================================
// Parsing
// ============================================

/** Convert Databento fixed-point price (integer * 1e9) to dollars */
const priceToDollars = (fixedPoint: string): number => {
    return Number(fixedPoint) / 1e9;
};

/** Parse one MBP-10 record into an OrderBookSnapshot */
const parseMbp10ToSnapshot = (record: DatabentoMbp10Record): OrderBookSnapshot | null => {
    if (!record.levels || record.levels.length === 0) return null;

    let timestampMs = Number(record.ts_recv) / 1e6; // nanoseconds → milliseconds

    let bids: OrderBookLevel[] = [];
    let asks: OrderBookLevel[] = [];

    for (let level of record.levels) {
        let bidPrice = priceToDollars(level.bid_px);
        let askPrice = priceToDollars(level.ask_px);

        // Skip invalid/sentinel prices (Databento uses max int for empty levels)
        if (bidPrice > 0 && bidPrice < 1e6 && level.bid_sz > 0) {
            bids.push({ price: bidPrice, size: level.bid_sz, lastUpdate: timestampMs });
        }
        if (askPrice > 0 && askPrice < 1e6 && level.ask_sz > 0) {
            asks.push({ price: askPrice, size: level.ask_sz, lastUpdate: timestampMs });
        }
    }

    if (bids.length === 0 && asks.length === 0) return null;

    return { bids, asks, lastUpdate: timestampMs };
};

// ============================================
// Fetching — MBP-10
// ============================================

/**
 * Fetch MBP-10 data from Databento via proxy and feed to bookmap.
 * Each record is a pre-aggregated 10-level snapshot — no reconstruction needed.
 */
const fetchMbp10Data = async (
    symbol: string,
    start: string,
    end: string,
    abortSignal?: AbortSignal
): Promise<number> => {
    let lines = await fetchNdjsonLines(symbol, 'mbp-10', start, end, abortSignal);
    if (lines.length === 0) return 0;

    console.log(`[Databento] Received ${lines.length} MBP-10 records for ${symbol}`);

    let fedCount = 0;
    let lastFedTimestamp = 0;

    for (let line of lines) {
        if (abortSignal?.aborted) break;

        let record: DatabentoMbp10Record;
        try {
            record = JSON.parse(line);
        } catch {
            continue;
        }

        let timestampMs = Number(record.ts_recv) / 1e6;

        // Only feed one snapshot per SAMPLE_INTERVAL_MS
        if (timestampMs - lastFedTimestamp < SAMPLE_INTERVAL_MS) continue;

        let snapshot = parseMbp10ToSnapshot(record);
        if (snapshot) {
            BookmapManager.onOrderBookUpdate(symbol, snapshot);
            lastFedTimestamp = timestampMs;
            fedCount++;
        }
    }

    console.log(`[Databento] Fed ${fedCount} MBP-10 snapshots to bookmap for ${symbol}`);
    return fedCount;
};

// ============================================
// Fetching — MBO (Full Depth)
// ============================================

/**
 * Fetch MBO data from Databento via proxy, reconstruct full-depth order book,
 * and feed snapshots to bookmap at sampled intervals.
 */
const fetchMboData = async (
    symbol: string,
    start: string,
    end: string,
    abortSignal?: AbortSignal
): Promise<number> => {
    let lines = await fetchNdjsonLines(symbol, 'mbo', start, end, abortSignal);
    if (lines.length === 0) return 0;

    console.log(`[Databento] Received ${lines.length} MBO records for ${symbol}`);

    let reconstructor = new OrderBookReconstructor();
    reconstructors.set(symbol, reconstructor);

    let fedCount = 0;
    let lastFedTimestamp = 0;

    for (let line of lines) {
        if (abortSignal?.aborted) break;

        let record: DatabentoMboRecord;
        try {
            record = JSON.parse(line);
        } catch {
            continue;
        }

        let timestampMs = Number(record.ts_recv) / 1e6;
        let price = priceToDollars(record.price);

        // Process event into reconstructor (updates running book state)
        reconstructor.processEvent(
            record.order_id,
            record.action,
            record.side,
            price,
            record.size,
            timestampMs
        );

        // Emit a snapshot at sampled intervals
        if (timestampMs - lastFedTimestamp >= SAMPLE_INTERVAL_MS) {
            let snapshot = reconstructor.toSnapshot();
            if (snapshot.bids.length > 0 || snapshot.asks.length > 0) {
                BookmapManager.onOrderBookUpdate(symbol, snapshot);
                lastFedTimestamp = timestampMs;
                fedCount++;
            }
        }
    }

    // Emit final snapshot
    if (fedCount === 0 || lastFedTimestamp > 0) {
        let finalSnapshot = reconstructor.toSnapshot();
        if (finalSnapshot.bids.length > 0 || finalSnapshot.asks.length > 0) {
            BookmapManager.onOrderBookUpdate(symbol, finalSnapshot);
            fedCount++;
        }
    }

    console.log(`[Databento] Fed ${fedCount} MBO snapshots to bookmap for ${symbol} (${reconstructor.orderCount} orders tracked, ${reconstructor.bidLevelCount} bid levels, ${reconstructor.askLevelCount} ask levels)`);
    return fedCount;
};

// ============================================
// Shared NDJSON Fetcher
// ============================================

/**
 * Fetch NDJSON lines from Databento via proxy.
 * The proxy returns { data: "NDJSON string", parseError: "..." } since
 * NDJSON isn't valid JSON. We extract the data field and split by newlines.
 */
const fetchNdjsonLines = async (
    symbol: string,
    schema: string,
    start: string,
    end: string,
    abortSignal?: AbortSignal
): Promise<string[]> => {
    let apiKey = Secret.databento().apiKey;
    if (!apiKey) {
        console.warn('[Databento] No API key found in secrets');
        return [];
    }

    let proxyUrl = `${GlobalSettings.losthostWithPort}/databento/v0/timeseries.get_range`;

    let requestBody = {
        dataset: GlobalSettings.databentoDataset,
        symbols: symbol,
        schema: schema,
        start: start,
        end: end,
        encoding: 'json',
        compression: 'none',
    };

    console.log(`[Databento] Fetching ${schema} for ${symbol}: ${start} → ${end}`);

    let response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
    });

    if (!response.ok) {
        let errorText = await response.text();
        console.error(`[Databento] API error ${response.status}: ${errorText}`);
        return [];
    }

    let responseJson = await response.json();

    // The proxy wraps NDJSON in { data: "...", parseError: "..." }
    let ndjsonText: string;
    if (responseJson.data && typeof responseJson.data === 'string') {
        ndjsonText = responseJson.data;
    } else if (typeof responseJson === 'string') {
        ndjsonText = responseJson;
    } else {
        console.warn('[Databento] Unexpected response format:', responseJson);
        return [];
    }

    return ndjsonText.split('\n').filter(line => line.trim().length > 0);
};

// ============================================
// Public API
// ============================================

/**
 * Fetch book data using the configured schema (MBO or MBP-10).
 */
export const fetchBookData = async (
    symbol: string,
    start: string,
    end: string,
    abortSignal?: AbortSignal
): Promise<number> => {
    if (GlobalSettings.databentoSchema === 'mbo') {
        return fetchMboData(symbol, start, end, abortSignal);
    } else {
        return fetchMbp10Data(symbol, start, end, abortSignal);
    }
};

/**
 * Start feeding historical book data for a symbol.
 * Fetches the last trading day's data (since free key is T+1 delayed).
 */
export const startHistoricalFeed = async (symbol: string): Promise<void> => {
    // Cancel any existing feed for this symbol
    stopFeed(symbol);

    let abortController = new AbortController();
    activeFeeds.set(symbol, abortController);

    try {
        // Fetch last trading day's full-depth data (T+1 delayed — free tier)
        // Schwab live streaming handles today's order book data
        let yesterday = getLastTradingDay();
        let eastern = toEasternTime(yesterday);
        let start = `${eastern.date}T04:00:00${eastern.offset}`;
        let end = `${eastern.date}T20:00:00${eastern.offset}`;

        console.log(`[Databento] Requesting ${symbol}: ${start} → ${end}`);
        await fetchBookData(symbol, start, end, abortController.signal);
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.log(`[Databento] Feed aborted for ${symbol}`);
        } else {
            console.error(`[Databento] Error fetching book data for ${symbol}:`, error);
        }
    } finally {
        activeFeeds.delete(symbol);
    }
};

/** Stop any in-progress fetch for a symbol */
export const stopFeed = (symbol: string): void => {
    let controller = activeFeeds.get(symbol);
    if (controller) {
        controller.abort();
        activeFeeds.delete(symbol);
    }
    reconstructors.delete(symbol);
};

/** Stop all active feeds */
export const stopAllFeeds = (): void => {
    activeFeeds.forEach(controller => controller.abort());
    activeFeeds.clear();
    reconstructors.clear();
};

// ============================================
// Helpers
// ============================================

/** Get the last trading day (skip weekends) */
const getLastTradingDay = (): Date => {
    let date = new Date();
    date.setDate(date.getDate() - 1);
    let day = date.getDay();
    if (day === 0) date.setDate(date.getDate() - 2); // Sunday → Friday
    if (day === 6) date.setDate(date.getDate() - 1); // Saturday → Friday
    return date;
};

/** Format date as YYYY-MM-DD */
const formatDate = (date: Date): string => {
    let yyyy = date.getFullYear();
    let mm = String(date.getMonth() + 1).padStart(2, '0');
    let dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

/** Convert a Date to Eastern Time components with UTC offset */
const toEasternTime = (date: Date): { date: string; time: string; offset: string } => {
    let eastern = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    let yyyy = eastern.getFullYear();
    let mo = String(eastern.getMonth() + 1).padStart(2, '0');
    let dd = String(eastern.getDate()).padStart(2, '0');
    let hh = String(eastern.getHours()).padStart(2, '0');
    let mm = String(eastern.getMinutes()).padStart(2, '0');
    let ss = String(eastern.getSeconds()).padStart(2, '0');
    // Determine if EDT (-04:00) or EST (-05:00) by comparing UTC and Eastern hours
    let diff = (date.getUTCHours() - eastern.getHours() + 24) % 24;
    let offset = diff === 4 ? '-04:00' : '-05:00';
    return { date: `${yyyy}-${mo}-${dd}`, time: `${hh}:${mm}:${ss}`, offset };
};
