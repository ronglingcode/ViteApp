export const alpaca = () => {
    let td = localStorage.getItem('tradingscripts.alpaca');
    if (td == null) {
        console.error(`no secrets in local storage`)
        td = '{}';
    }

    let data = JSON.parse(td);
    return {
        apiKey: data.apiKey,
        apiSecret: data.apiSecret,
    }
};

export const tradeStation = () => {
    let td = localStorage.getItem('tradingscripts.tradeStation');
    if (td == null) {
        console.error(`no secrets in local storage`)
        td = '{}';
    }

    let data = JSON.parse(td);
    return {
        'AccountIDs': {
            'Equity': data.AccountIDs.Equity,
            'Futures': data.AccountIDs.Futures,
        },
        'key': data.key,
        'secret': data.secret,
        "access_token": data.access_token,
        "refresh_token": data.refresh_token,
        "id_token": data.id_token,
        "scope": data.scope,
        "expires_in": 1200,
        "token_type": "Bearer",
        "code": data.code,
    }
};
export const schwab = () => {
    let td = localStorage.getItem('tradingscripts.schwab');
    if (td == null) {
        console.error(`no schwab secrets in local storage`)
        td = '{}';
    }

    let data = JSON.parse(td);
    return {
        appKey: data.appKey,
        secret: data.secret,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        redirectUrl: "https://127.0.0.1",
        accountId: data.accountId,
        accountHash: data.accountHashValue,
    }
}
export const tdameritrade = () => {
    let td = localStorage.getItem('tradingscripts.tdameritrade');
    if (td == null) {
        console.error(`no secrets in local storage`)
        td = '{}';
    }

    let data = JSON.parse(td);
    return {
        name: data.name,
        accountId: data.accountId,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        code: data.code,
        clientId: data.clientId,
        redirectUrl: "https://localhost",
    }
};

export const firebaseConfig = () => {
    let td = localStorage.getItem('tradingscripts.firebaseConfig');
    if (td == null) {
        console.error(`no secrets in local storage`)
        td = '{}';
    }

    let data = JSON.parse(td);
    return {
        apiKey: data.apiKey,
        authDomain: data.authDomain,
        projectId: data.projectId,
        storageBucket: data.storageBucket,
        messagingSenderId: data.messagingSenderId,
        appId: data.appId,
        measurementId: data.measurementId
    }
};

export const massive = () => {
    let td = localStorage.getItem('tradingscripts.massive');
    if (td == null) {
        console.error(`no secrets in local storage`)
        td = '{}';
    }

    let data = JSON.parse(td);
    return {
        apiKey: data.apiKey,
    }
};