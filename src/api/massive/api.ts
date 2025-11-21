import * as Firestore from '../../firestore';
import * as Secret from '../../config/secret';
import * as TimeHelper from '../../utils/timeHelper';

export const getPriceHistory = async (symbol: string, timeframe: number) => {
    let apiKey = Secret.massive().apiKey;
    let host = 'https://api.massive.com';
    let today = new Date();
    let todayString = TimeHelper.formatDateToYYYYMMDD(today);

    let tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    let tomorrowString = TimeHelper.formatDateToYYYYMMDD(tomorrow);
    
    let url = `${host}/v2/aggs/ticker/${symbol}/range/${timeframe}/minute/${todayString}/${tomorrowString}?adjusted=true&sort=asc&limit=120&apiKey=${apiKey}`;

    return getBars(symbol, url);
};

export const getBars = async (symbol: string, url: string) => {
    const config = {
        method: 'GET',
    };
    let response = await fetch(url, config);
    let responseJson = await response.json();
    let candles: any[] = [];
    let data = responseJson.bars[symbol];
    if (data) {
       console.log(data);
    } else {
        Firestore.logError(`no data for getBars()`);
    }

    return true;
};