import * as Secret from '../../config/secret';
import * as GlobalSettings from '../../config/globalSettings';
import * as BookmapManager from '../../bookmap/bookmapManager';
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
// State
// ============================================

const activeFeeds: Map<string, AbortController> = new Map();
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
// Fetching
// ============================================

/**
 * Fetch MBP-10 data from Databento via proxy and feed to bookmap.
 * The proxy returns { data: "NDJSON string", parseError: "..." } since
 * NDJSON isn't valid JSON. We extract the data field and split by newlines.
 */
export const fetchBookData = async (
    symbol: string,
    start: string,
    end: string,
    abortSignal?: AbortSignal
): Promise<number> => {
    let apiKey = Secret.databento().apiKey;
    if (!apiKey) {
        console.warn('[Databento] No API key found in secrets');
        return 0;
    }

    let proxyUrl = `${GlobalSettings.losthostWithPort}/databento/v0/timeseries.get_range`;

    let requestBody = {
        dataset: GlobalSettings.databentoDataset,
        symbols: symbol,
        schema: 'mbp-10',
        start: start,
        end: end,
        encoding: 'json',
        compression: 'none',
    };

    console.log(`[Databento] Fetching MBP-10 for ${symbol}: ${start} → ${end}`);

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
        return 0;
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
        return 0;
    }

    let lines = ndjsonText.split('\n').filter(line => line.trim().length > 0);
    console.log(`[Databento] Received ${lines.length} MBP-10 records for ${symbol}`);

    // Sample records by timestamp to avoid overwhelming the bookmap
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

    console.log(`[Databento] Fed ${fedCount} snapshots to bookmap for ${symbol}`);
    return fedCount;
};

// ============================================
// Feed Management
// ============================================

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
        // Get the last trading day (skip weekends)
        let yesterday = getLastTradingDay();
        let dateStr = formatDate(yesterday);

        // Fetch a 10-minute window around market open for testing
        // Full day would be too much data; expand as needed
        let start = `${dateStr}T09:30:00`;
        let end = `${dateStr}T09:40:00`;

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
};

/** Stop all active feeds */
export const stopAllFeeds = (): void => {
    activeFeeds.forEach(controller => controller.abort());
    activeFeeds.clear();
};

// ============================================
// Helpers
// ============================================

/** Get the last trading day (skip weekends) */
const getLastTradingDay = (): Date => {
    let date = new Date();
    // Go back to yesterday
    date.setDate(date.getDate() - 1);
    // Skip weekends
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
