import type * as TradingPlansModels from '../../models/tradingPlans/tradingPlansModels';
import type * as Models from '../../models/models';

export type OrderSide = 'buy' | 'sell';

export interface LiteWatchlistItem {
    symbol: string;
    marketCapInMillions?: number;
}

export interface SchwabSecrets {
    appKey: string;
    secret: string;
    accessToken: string;
    refreshToken: string;
    accountHash: string;
}

export interface MassiveSecrets {
    apiKey: string;
}

export interface FirebaseConfig {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId: string;
}

export interface LiteConfigData {
    activeProfileName: string;
    stockSelections: string[];
    tradingPlans: TradingPlansModels.TradingPlans[];
    tradingSettings: TradingPlansModels.TradingSettings;
    googleDocId: string;
}

export interface SchwabStreamerInfo {
    schwabClientChannel: string;
    schwabClientCorrelId: string;
    schwabClientCustomerId: string;
    schwabClientFunctionId: string;
    streamerSocketUrl: string;
}

export interface LiteSecrets {
    schwab: SchwabSecrets;
    massive: MassiveSecrets;
    streamerInfo?: SchwabStreamerInfo;
}

export interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface TradeTick {
    symbol: string;
    price: number;
    size: number;
    timestamp: number;
    source: 'massive';
}

export interface QuoteSnapshot {
    symbol: string;
    bid?: number;
    ask?: number;
    lastPrice?: number;
    timestamp: number;
    source: 'schwab' | 'massive';
}

export interface PositionSnapshot {
    symbol: string;
    quantity: number;
    averagePrice: number;
}

export type LiteOrderType = 'MARKET' | 'LIMIT' | 'STOP';

export interface LiteOrderModel {
    symbol: string;
    orderID: string;
    rawOrder: any;
    orderType: LiteOrderType;
    quantity: number;
    isBuy: boolean;
    positionEffectIsOpen: boolean;
    price?: number;
}

export interface LiteExitPair {
    symbol: string;
    STOP?: LiteOrderModel;
    LIMIT?: LiteOrderModel;
    source: string;
    parentOrderID: string;
}

export interface LiteAccountSnapshot {
    positions: Map<string, PositionSnapshot>;
    entryOrders: Map<string, LiteOrderModel[]>;
    exitPairs: Map<string, LiteExitPair[]>;
    orderExecutions: Map<string, Models.OrderExecution[]>;
    currentBalance: number;
}

export interface MarketSnapshot {
    symbol: string;
    lastPrice?: number;
    bid?: number;
    ask?: number;
    spread?: number;
    candle?: Candle;
}

export interface LiteStartPayload {
    watchlist: LiteWatchlistItem[];
    secrets: LiteSecrets;
    enableSchwabStreamer: boolean;
}

export type MainToWorkerMessage =
    | { type: 'start'; payload: LiteStartPayload }
    | { type: 'stop' };

export type WorkerToMainMessage =
    | { type: 'status'; source: string; status: string }
    | { type: 'history'; symbol: string; candles: Candle[]; dailyCandles: Candle[] }
    | { type: 'snapshot'; snapshots: MarketSnapshot[] }
    | { type: 'accountActivity'; summary: string }
    | { type: 'error'; source: string; message: string };

const parseJson = <T>(value: string | null): T | undefined => {
    if (!value) {
        return undefined;
    }
    try {
        return JSON.parse(value) as T;
    } catch {
        return undefined;
    }
};

export const getSchwabSecrets = (): SchwabSecrets => {
    let data = parseJson<any>(localStorage.getItem('tradingscripts.schwab')) ?? {};
    return {
        appKey: data.appKey ?? '',
        secret: data.secret ?? '',
        accessToken: data.access_token ?? '',
        refreshToken: data.refresh_token ?? '',
        accountHash: data.accountHashValue ?? data.accountHash ?? '',
    };
};

export const getMassiveSecrets = (): MassiveSecrets => {
    let data = parseJson<any>(localStorage.getItem('tradingscripts.massive')) ?? {};
    return {
        apiKey: data.apiKey ?? '',
    };
};

export const getFirebaseConfig = (): FirebaseConfig => {
    let data = parseJson<any>(localStorage.getItem('tradingscripts.firebaseConfig')) ?? {};
    return {
        apiKey: data.apiKey ?? '',
        authDomain: data.authDomain ?? '',
        projectId: data.projectId ?? '',
        storageBucket: data.storageBucket ?? '',
        messagingSenderId: data.messagingSenderId ?? '',
        appId: data.appId ?? '',
        measurementId: data.measurementId ?? '',
    };
};

export const hasRequiredFirebaseConfig = (config: FirebaseConfig) => {
    return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
};

export const saveSchwabAccessToken = (accessToken: string) => {
    let key = 'tradingscripts.schwab';
    let data = parseJson<any>(localStorage.getItem(key)) ?? {};
    data.access_token = accessToken;
    localStorage.setItem(key, JSON.stringify(data));
};

export const hasRequiredSecrets = (secrets: SchwabSecrets, massive: MassiveSecrets) => {
    return Boolean(
        secrets.appKey &&
        secrets.secret &&
        secrets.refreshToken &&
        secrets.accountHash &&
        massive.apiKey
    );
};

export const formatPrice = (value: number | undefined) => {
    if (value == null || !Number.isFinite(value)) {
        return '-';
    }
    return value >= 100 ? value.toFixed(2) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
};

export const formatQuantity = (value: number | undefined) => {
    if (value == null || !Number.isFinite(value)) {
        return '0';
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

export const formatClock = () => {
    return new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

export const toTradingViewTime = (timestampMs: number) => {
    let date = new Date(timestampMs);
    date.setSeconds(0, 0);
    return Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        0,
        0
    ) / 1000;
};

export const getMinuteStartMs = (timestampMs: number) => {
    return Math.floor(timestampMs / 60_000) * 60_000;
};
