import * as Models from '../models/models';
const oneMillion = 1000*1000;   
export const getPremarketVolumeQuality = (symbol: string,premarketDollar: Models.PremarketDollarCollection) => {    
    if (premarketDollar.lastDayDollar < 20*oneMillion) {
        return Models.PremarketVolumeQuality.TooLow;
    }
    let previousDaysDollar = premarketDollar.previousDaysDollar[premarketDollar.previousDaysDollar.length - 1].data;
    if (premarketDollar.lastDayDollar < previousDaysDollar*0.5) {
        return Models.PremarketVolumeQuality.TooLow;
    }
    if (['NVDA', 'AMD', 'TSLA', 'SPY', 'QQQ', 'PLTR', 'GOOGL', 'AAPL'].includes(symbol)) {
        return getPremarketVolumeQualityForRetailFavorites(symbol, premarketDollar);
    }
    if (premarketDollar.lastDayDollar >= 999*oneMillion) {
        return Models.PremarketVolumeQuality.Elevated;
    }
    if (premarketDollar.rvol > 3) {
        return Models.PremarketVolumeQuality.Elevated;
    }
    return Models.PremarketVolumeQuality.Ok;
}

/**
 * These stocks are still tradable when volume is not elevated. 
 * Just need to wait more after open for a better setup.
 */
export const getPremarketVolumeQualityForRetailFavorites = (symbol: string, premarketDollar: Models.PremarketDollarCollection) => {
    if (symbol == 'AMD') {
        if (premarketDollar.lastDayDollar < 500*oneMillion) {
            return Models.PremarketVolumeQuality.Ok;
        } else {
            return Models.PremarketVolumeQuality.Elevated;
        }
    } else if (symbol == 'NVDA') {
        if (premarketDollar.lastDayDollar < 750*oneMillion) {
            return Models.PremarketVolumeQuality.Ok;
        } else {
            return Models.PremarketVolumeQuality.Elevated;
        }
    } else if (symbol == 'TSLA') {
        if (premarketDollar.lastDayDollar < 750*oneMillion) {
            return Models.PremarketVolumeQuality.Ok;
        } else {
            return Models.PremarketVolumeQuality.Elevated;
        }
    } else if (symbol == 'PLTR') {
        if (premarketDollar.lastDayDollar < 500*oneMillion) {
            return Models.PremarketVolumeQuality.Ok;
        } else {
            return Models.PremarketVolumeQuality.Elevated;
        }
    } else if (symbol == 'GOOGL') {
        if (premarketDollar.lastDayDollar < 400*oneMillion) {
            return Models.PremarketVolumeQuality.Ok;
        } else {
            return Models.PremarketVolumeQuality.Elevated;
        }
    } else if (symbol == 'AAPL') {
        if (premarketDollar.lastDayDollar < 300*oneMillion) {
            return Models.PremarketVolumeQuality.Ok;
        } else {
            return Models.PremarketVolumeQuality.Elevated;
        }
    }
    return Models.PremarketVolumeQuality.Elevated;
}