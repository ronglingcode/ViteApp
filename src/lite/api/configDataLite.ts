import * as FirebaseApp from 'firebase/app';
import * as Firestore from 'firebase/firestore';
import * as Watchlist from '../../algorithms/watchlist';
import type * as Models from '../../models/models';
import * as StateLite from '../models/stateLite';

const CONFIG_COLLECTION = 'configDataSnapshot';
const LITE_FIREBASE_APP_NAME = 'lite-config';

let app: FirebaseApp.FirebaseApp | null = null;
let db: Firestore.Firestore | null = null;

const getDb = () => {
    if (db) {
        return db;
    }
    let firebaseConfig = StateLite.getFirebaseConfig();
    if (!StateLite.hasRequiredFirebaseConfig(firebaseConfig)) {
        throw new Error('Missing Firebase config in tradingscripts.firebaseConfig');
    }
    app = FirebaseApp.getApps().find(app => app.name === LITE_FIREBASE_APP_NAME)
        ?? FirebaseApp.initializeApp(firebaseConfig, LITE_FIREBASE_APP_NAME);
    db = Firestore.getFirestore(app);
    return db;
};

const getTimestampSeconds = (item: any) => {
    return Number(item?.timestamp?.seconds ?? 0);
};

const getLatestConfigSnapshot = async () => {
    let querySnapshot = await Firestore.getDocs(Firestore.collection(getDb(), CONFIG_COLLECTION));
    let latest: any | undefined;
    querySnapshot.forEach(doc => {
        let item = doc.data();
        if (!latest || getTimestampSeconds(item) > getTimestampSeconds(latest)) {
            latest = item;
        }
    });
    if (!latest) {
        throw new Error(`No documents found in ${CONFIG_COLLECTION}`);
    }
    return latest;
};

export const fetchConfigData = async (): Promise<StateLite.LiteConfigData> => {
    let latest = await getLatestConfigSnapshot();
    let stockSelections = Array.isArray(latest.stockSelections)
        ? latest.stockSelections.filter((symbol: unknown): symbol is string => typeof symbol === 'string')
        : [];

    return {
        activeProfileName: latest.activeProfileName ?? '',
        stockSelections,
        tradingPlans: Array.isArray(latest.plans) ? latest.plans : [],
        tradingSettings: latest.tradingSettings ?? {
            useSingleOrderForEntry: false,
            snapMode: true,
        },
    };
};

const getHybridAppForWatchlist = () => {
    let appWindow = window as unknown as Models.MyWindow;
    appWindow.HybridApp = appWindow.HybridApp ?? {} as Models.MyWindow['HybridApp'];
    let hybridApp = appWindow.HybridApp;
    hybridApp.TradingPlans = hybridApp.TradingPlans ?? [];
    hybridApp.StockSelections = hybridApp.StockSelections ?? [];
    hybridApp.TradingData = hybridApp.TradingData ?? {
        activeProfileName: '',
        tradingSettings: {
            useSingleOrderForEntry: false,
            snapMode: true,
        },
    };
    return hybridApp;
};

const prepareHybridAppForWatchlist = (config: StateLite.LiteConfigData) => {
    let appWindow = window as any;
    appWindow.TradingData = appWindow.TradingData ?? {};
    appWindow.TradingData.StockSelection = appWindow.TradingData.StockSelection ?? {};
    appWindow.TradingData.StockSelection.futures = config.stockSelections;
    appWindow.TradingData.StockSelection.index = config.stockSelections;
    appWindow.TradingData.StockSelection.StockCandidates = appWindow.TradingData.StockSelection.StockCandidates ?? {};
    appWindow.TradingData.Settings = appWindow.TradingData.Settings ?? {};

    let hybridApp = getHybridAppForWatchlist();
    hybridApp.TradingPlans = config.tradingPlans;
    hybridApp.StockSelections = config.stockSelections;
    hybridApp.TradingData = {
        activeProfileName: config.activeProfileName,
        tradingSettings: config.tradingSettings,
    };
};

const toLiteWatchlist = (watchlist: Models.WatchlistItem[]): StateLite.LiteWatchlistItem[] => {
    return watchlist.map(item => ({
        symbol: item.symbol,
        marketCapInMillions: item.marketCapInMillions,
    }));
};

export const createLiteWatchlistFromConfig = async (config: StateLite.LiteConfigData): Promise<StateLite.LiteWatchlistItem[]> => {
    prepareHybridAppForWatchlist(config);
    let fullWatchlist = await Watchlist.createWatchlist();
    let watchlist = toLiteWatchlist(fullWatchlist);
    if (watchlist.length === 0) {
        throw new Error(`Firestore config has no stockSelections for ${config.activeProfileName || 'active profile'}`);
    }
    return watchlist;
};

export const getLiteWatchlistFromConfig = async (): Promise<StateLite.LiteWatchlistItem[]> => {
    let config = await fetchConfigData();
    return await createLiteWatchlistFromConfig(config);
};
