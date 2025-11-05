import * as firebase from 'firebase/app'
import * as gbase from "firebase/firestore"
import * as secret from './config/secret'
import * as Config from './config/config';
import * as Helper from './utils/helper';
import type * as Models from './models/models';
declare let window: Models.MyWindow;

let dateobj = new Date();
let date = dateobj.getDate(), month = dateobj.getMonth() + 1, year = dateobj.getFullYear();

const getCollectionNamePrefix = () => {
    if (window.HybridApp && window.HybridApp.TradingData && window.HybridApp.TradingData.activeProfileName)
        return `${window.HybridApp.TradingData.activeProfileName}`;
    else
        return "momentumSimple";
};

export const getStatePrefix = () => {
    return `state-${window.HybridApp.TradingData.activeProfileName}`
};

// Initialize Firebase
export const app = firebase.initializeApp(secret.firebaseConfig());
export const db = gbase.getFirestore(app);
export const logCandles = async (candles: Models.Candle[]) => {
    let msg = `total candles: ${candles.length}: `;
    for (let i = 0; i < candles.length; i++) {
        let c = candles[i];
        msg += `o:${c.open},h:${c.high},l:${c.low},c:${c.close};`;
    }
    logInfo(msg);
}
export const logDebug = async (msg: any, tags: Models.LogTags = {}) => {
    log('Debug', msg, tags);
    console.log(msg);
};
export const logInfo = async (msg: any, tags: Models.LogTags = {}) => {
    console.log(msg);
    log('Info', msg, tags);
    addToLogView(msg, 'Info', tags);
};
export const logSuccess = async (msg: any, tags: Models.LogTags = {}) => {
    console.log(msg);
    log('Success', msg, tags);
    addToLogView(msg, 'Success', tags);
}
export const logError = async (msg: any, tags: Models.LogTags = {}) => {
    console.error(msg);
    log('Error', msg, tags);
    addToLogView(msg, 'Error', tags);
};
const log = async (msgType: string, msg: any, tags: Models.LogTags) => {
    let now = new Date();
    let expiredAt = new Date();
    expiredAt.setDate(expiredAt.getDate() + 7);
    let docId = now.getTime();

    let docRef = await gbase.doc(db, `${getCollectionNamePrefix()}-Logs/${docId}`) // create this document newDoc at this path
    await gbase.setDoc(docRef, {
        msg: JSON.stringify(msg),
        type: msgType,
        timestamp: now,
        dateStr: `${year}-${month}-${date}`,
        expiredAt: expiredAt,
        ...tags,
    });
};
export const logOrder = async (order: any, logTags: Models.LogTags) => {
    console.log(order);
    let expiredAt = new Date();
    expiredAt.setDate(expiredAt.getDate() + 7);
    gbase.addDoc(gbase.collection(db, `${getCollectionNamePrefix()}-Orders`), {
        timestamp: new Date(),
        dateStr: `${year}-${month}-${date}`,
        expiredAt: expiredAt,
        logOrder: JSON.stringify(order),
        ...logTags,
    });
};

export const addToLogView = (msg: string, msgType: string, tags: Models.LogTags = {}) => {
    let ul = document.getElementById('logs');
    if (ul == null)
        return;
    let li = document.createElement("div");
    li.className = msgType;
    let now = new Date();
    let symbol = '';
    if (tags && tags.symbol) {
        symbol = tags.symbol;
    }
    li.innerText = `${now.toLocaleTimeString()} ${symbol} ${msg}`;
    ul.appendChild(li);
    while (ul.children.length > 18) {
        let firstChild = ul.children[0];
        firstChild.remove();
    }
};

// allow used once, returns true if allowed this time
/*
const usageAllowedOnce = (symbol: string, fieldToCheck: string) => {
    let state = getStockState(symbol);
    let hasDoneIt = state[fieldToCheck];
    if (!Config.getProfileSettings().isTestAccount && hasDoneIt === true) {
        logInfo(`has already done ${fieldToCheck} for ${symbol}, skipping this time.`);
        return false;
    }
    state[fieldToCheck] = true;
    setStockState(symbol, state);
    return true;
};
*/
// TTL link: https://console.cloud.google.com/firestore/ttl?pli=1&project=tradingapp-84f28
export const deleteMonthlyLogs = async (year: number, month: number, accountName: string) => {
    for (let i = 1; i <= 31; i++) {
        setTimeout(() => {
            let prefix = `${year}-${month}-${i}-${accountName}`;
            deleteLogsAndOrders(prefix);
        }, 500 * i);
    }
}

export const deleteDailyLogs = async (year: number, month: number, day: number) => {
    const prefix = `${year}-${month}-${day}-${getCollectionNamePrefix()}`;
    console.log(`Delete for ${prefix}`);
    const collections = [
        gbase.collection(db, `${prefix}-Logs`),
        gbase.collection(db, `${prefix}-Orders`)
    ];
    collections.forEach(collection => {
        deleteCollection(collection);
    });
};
export const deleteCollectionByName = async (name: string, accountName: string) => {
    let c = gbase.collection(db, name);
    deleteCollection(c);
};
export const deleteLogsAndOrders = async (prefix: string) => {
    console.log(`delete for ${prefix}`);
    const collections = [
        gbase.collection(db, `${prefix}-Logs`),
        gbase.collection(db, `${prefix}-Orders`)
    ];
    collections.forEach(collection => {
        if (collection)
            deleteCollection(collection);
    });
};
const deleteCollection = async (collection: any) => {
    const q = gbase.query(collection);
    const querySnapshot = await gbase.getDocs(q);
    querySnapshot.forEach((doc: any) => {
        gbase.deleteDoc(doc.ref);
    });
};

export const setTradingState = async (state: Models.TradingState) => {
    let docRef = await gbase.doc(db, `${getStatePrefix()}/tradingState`);
    let d = {
        date: state.date,
        initialBalance: state.initialBalance,
        stateBySymbol: {} as any,
        readOnlyStateBySymbol: {} as any,
    }
    state.stateBySymbol.forEach((mapValue: Models.SymbolState, key: string) => {
        d.stateBySymbol[key] = mapValue;
    });
    state.readOnlyStateBySymbol.forEach((mapValue: Models.ReadOnlySymbolState, key: string) => {
        d.readOnlyStateBySymbol[key] = mapValue;
    })
    await gbase.setDoc(docRef, d);
};
export const logBreakoutTradeState = async (symbol: string, state: Models.BreakoutTradeState) => {
    let expiredAt = new Date();
    expiredAt.setDate(expiredAt.getDate() + 3);
    gbase.addDoc(gbase.collection(db, `BreakoutTradeState`), {
        symbol: symbol,
        timestamp: new Date(),
        dateStr: `${year}-${month}-${date}`,
        expiredAt: expiredAt,
        ...state,
    });
};

export const getTradingState = async () => {
    const docRef = gbase.doc(db, `${getStatePrefix()}`, "tradingState");
    const docSnap = await gbase.getDoc(docRef);

    if (docSnap.exists()) {
        let data = docSnap.data();
        let result: Models.TradingState = {
            date: data.date,
            initialBalance: data.initialBalance,
            stateBySymbol: new Map<string, Models.SymbolState>(),
            readOnlyStateBySymbol: new Map<string, Models.ReadOnlySymbolState>(),
        };
        for (const key in data.stateBySymbol) {
            result.stateBySymbol.set(key, data.stateBySymbol[key])
        }
        for (const key in data.readOnlyStateBySymbol) {
            result.readOnlyStateBySymbol.set(key, data.readOnlyStateBySymbol[key])
        }
        return result;
    } else {
        logError("no trading state");
        return null;
    }
};

export const fetchConfigData = async () => {
    const querySnapshot = await gbase.getDocs(gbase.collection(db, 'configDataSnapshot'));
    let results: any[] = [];
    querySnapshot.forEach((doc: any) => {
        let item = doc.data();
        let d = new Date(item.timestamp.seconds * 1000);
        let seconds = Helper.getSecondsSinceMarketOpen(d);
        if (seconds > 0 && seconds < 5 * 60) {
            //results.push(item);
            logError(`cannot use trading plan updated within first 5 minutes`);
        } else {
            results.push(item);
        }
    });

    let latest = results[0];
    for (let i = 1; i < results.length; i++) {
        let item = results[i];
        if (item.timestamp.seconds > latest.timestamp.seconds) {
            latest = item;
        }
    }
    return latest;
};
