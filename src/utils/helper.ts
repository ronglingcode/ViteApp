import type * as LightweightCharts from 'sunrise-tv-lightweight-charts'
import * as TimeHelper from './timeHelper';
export const numberToString = (n: number | null | undefined) => {
    if (!n)
        return "";
    return n.toString();
};
export const largeNumberToString = (n: number) => {
    return n.toLocaleString();
}
export const numberToStringWithPaddingToCents = (n: number | null | undefined) => {
    if (!n)
        return "";
    let result = roundToCents(n).toString();
    let parts = result.split('.');
    if (parts.length == 0) {
        return result;
    } else if (parts.length == 1) {
        return result + '.00';
    } else if (parts.length == 2) {
        if (parts[1].length == 2) {
            return result;
        } else if (parts[1].length == 1) {
            return result + '0';
        } else {
            return result + '00';
        }
    } else {
        return result;
    }
};
export const numberToDate = (n: number | null | undefined) => {
    if (!n)
        return new Date();
    return new Date(n);
};
export const getMarketOpenTime = () => {
    return TimeHelper.getMarketOpenTimeInLocal();
}
export const getMarketCloseTime = () => {
    return TimeHelper.getMarketCloseTimeInLocal();
}
export const getSecondsToNextMinute = () => {
    let now = new Date();
    return 60 - now.getSeconds();
};
export const getMinutesSinceMarketOpen = (jsDate: Date) => {
    return (jsDate.getTime() - getMarketOpenTime().getTime()) / 60000;
};
export const getSecondsSinceMarketOpen = (jsDate: Date) => {
    return (jsDate.getTime() - getMarketOpenTime().getTime()) / 1000;
};
export const getMillisecondsSinceMarketOpen = (jsDate: Date) => {
    return jsDate.getTime() - getMarketOpenTime().getTime();
};
export const getSecondsToMarketOpen = (jsDate: Date) => {
    return (getMarketOpenTime().getTime() - jsDate.getTime()) / 1000;
};
export const roundToCents = (price: number) => {
    return Math.round(price * 100) / 100;
};
export const roundToCentsWithDirection = (price: number, up: boolean) => {
    if (up) {
        return Math.ceil(price * 100) / 100;
    } else {
        return Math.floor(price * 100) / 100;
    }
}
export const roundToQuarters = (price: number) => {
    return Math.round(price * 4) / 4;
};
export const roundToQuartersWithDirection = (price: number, up: boolean) => {
    if (up) {
        return Math.ceil(price * 4) / 4;
    } else {
        return Math.floor(price * 4) / 4;
    }
};
export const roundToOz = (price: number) => {
    return Math.round(price * 32) / 32;
}
export const roundToOzWithDirection = (price: number, up: boolean) => {
    if (up) {
        return Math.ceil(price * 32) / 32;
    } else {
        return Math.floor(price * 32) / 32;
    }
}
export const roundPrice = (symbol: string, price: number) => {
    if (isFutures(symbol)) {
        if (symbol.startsWith("US"))
            return roundToOz(price);
        else
            return roundToQuarters(price);
    } else {
        return roundToCents(price);
    }
};
export const roundPriceWithDirection = (symbol: string, price: number, up: boolean) => {
    if (isFutures(symbol)) {
        if (symbol.startsWith("US"))
            return roundToOzWithDirection(price, up);
        else
            return roundToQuartersWithDirection(price, up);
    } else {
        return roundToCentsWithDirection(price, up);
    }
}
export const roundToCentsOrOz = (symbol: string, price: number, up: boolean) => {
    if (symbol.startsWith("US") && symbol.length == 5) {
        if (up) {
            return Math.ceil(price * 32) / 32;
        } else {
            return Math.floor(price * 32) / 32;
        }
    } else {
        if (up)
            return Math.ceil(price * 100) / 100;
        else
            return Math.floor(price * 100) / 100;
    }
}
export const tvTimestampToLocalJsDate = (timestamp: number) => {
    let d = new Date(timestamp * 1000);
    let offset = d.getTimezoneOffset();
    d.setTime(d.getTime() + (offset * 60 * 1000));
    return d;
};
export const toUserTimeString = (seconds: number) => {
    let m = Math.floor(seconds / 60);
    let s = seconds - m * 60;
    return `${m} minutes ${s} seconds`;
};
export const playNotificationSound = () => {
    const audio = new Audio("/resources/notification_sound.wav");
    audio.play();
};
export const playOrderSubmissionSound = () => {
    playNotificationSound();
}
export const jsDateToUTC = (jsDateObj: Date) => {
    let result = Date.UTC(jsDateObj.getFullYear(), jsDateObj.getMonth(), jsDateObj.getDate(), jsDateObj.getHours(), jsDateObj.getMinutes(), jsDateObj.getSeconds(), jsDateObj.getMilliseconds()) / 1000;
    return result as LightweightCharts.UTCTimestamp;
};
/**
 * round to 1 minute bucket
 *  */
export const jsDateToTradingViewUTC = (jsDateObj: Date) => {
    let newD = new Date(jsDateObj);
    newD.setSeconds(0, 0);
    return jsDateToUTC(newD);
};
/**
 * round to the nearest timeframe minute bucket
 */
export const jsDateToTradingViewUTCForTimeframe = (jsDateObj: Date, timeframe: number) => {
    let newD = new Date(jsDateObj);

    // Round to the nearest timeframe minute bucket
    const minutes = newD.getMinutes();
    const roundedMinutes = Math.floor(minutes / timeframe) * timeframe;

    // Set the rounded minutes and clear seconds/milliseconds
    newD.setMinutes(roundedMinutes, 0, 0);

    return jsDateToUTC(newD);
};
export const isFutures = (symbol: string) => {
    let futuresSymbols = ['MESZ22', 'ESZ22', 'ES', 'MES'];
    if (futuresSymbols.includes(symbol))
        return true;
    if ((symbol.startsWith("MES") && symbol.length == 6) ||
        (symbol.startsWith("ES") && symbol.length == 5))
        return true;
    if ((symbol.startsWith("MNQ") && symbol.length == 6) ||
        (symbol.startsWith("NQ") && symbol.length == 5))
        return true;
    if (symbol.startsWith("US") && symbol.length == 5) {
        return true;
    }
    return false;
};
export const addMinimumPriceIncrement = (symbol: string, isLong: boolean, price: number) => {
    if (isFutures(symbol)) {
        return price;
    }
    if (isLong) {
        return price + 0.01;
    } else {
        return price - 0.01;
    }
}
export const isIndex = (symbol: string) => {
    return ['SPY', 'QQQ', 'IWM', 'DIA', 'TQQQ', 'SQQQ', 'UPRO'].includes(symbol);
}

export const getTargetPrice = (symbol: string, isLong: boolean, entryPrice: number, stopOutPrice: number, riskRewardRatio: number) => {
    let risk = Math.abs(stopOutPrice - entryPrice);
    let reward = risk * riskRewardRatio;
    let targetPrice = isLong ? entryPrice + reward : entryPrice - reward;
    return roundPrice(symbol, targetPrice);
};

export const isMarketOpenTime = (jsDatdeObj: Date, currentDay: Date) => {
    let d = jsDatdeObj;
    let open = getMarketOpenTime();
    return d.getFullYear() == currentDay.getFullYear() &&
        d.getMonth() == currentDay.getMonth() &&
        d.getDate() == currentDay.getDate() &&
        d.getHours() == open.getHours() &&
        d.getMinutes() == open.getMinutes();
};

export const speak = (message: string) => {
    let seconds = getSecondsSinceMarketOpen(new Date());
    if (seconds < 60 * 300) {
        var msg = new SpeechSynthesisUtterance();
        msg.text = message;
        window.speechSynthesis.speak(msg);
    }
};

export const isToday = (jsDate: Date) => {
    let today = new Date();
    return jsDate.getDate() === today.getDate() &&
        jsDate.getMonth() === today.getMonth() &&
        jsDate.getFullYear() === today.getFullYear();
};

export const isTwoTimesInTheSameMinute = (time1: Date, time2: Date) => {
    return time1.getDate() === time2.getDate() &&
        time1.getMonth() === time2.getMonth() &&
        time1.getFullYear() === time2.getFullYear() &&
        time1.getHours() === time2.getHours() &&
        time1.getMinutes() === time2.getMinutes();
}
export const isCurrentMinute = (jsDate: Date) => {
    let now = new Date();
    return isTwoTimesInTheSameMinute(now, jsDate);
};

const generateRandomShortNumber = () => {
    return Math.floor(Math.random() * 1000);
};

export const generateLogSessionName = (prefix: string) => {
    let r = generateRandomShortNumber();
    return `${prefix}-${r}`;
};

export const isNewPriceMoreProfitableThanCurrentPrice = (currentPrice: number, newPrice: number, isLong: boolean) => {
    if (isLong) {
        return newPrice >= currentPrice;
    } else {
        return newPrice <= currentPrice;
    }
};

export const isAgainstVwap = (currentVwap: number, entryPrice: number, isLong: boolean) => {
    return ((isLong && entryPrice < currentVwap) ||
        (!isLong && entryPrice > currentVwap));
};

export const getFuturesQuarter = (symbol: string) => {
    let now = new Date();
    let year = now.getFullYear() % 2000;
    let month = now.getMonth() + 1;
    let day = now.getDate();
    // May 29th => 0529;
    let today = month * 100 + day;
    let dateStr = `${today}`;
    if (month < 10) {
        dateStr = '0' + dateStr;
    }
    if (symbol.startsWith('ZB') || symbol.startsWith('US')) {
        if ('0224' <= dateStr && dateStr < '0530') {
            return `M${year}`;
        } else if ('0530' <= dateStr && dateStr < '0829') {
            return `U${year}`;
        } else if ('0829' <= dateStr && dateStr < '1128') {
            return `Z${year}`;
        } else {
            return `H${year}`;
        }
    } else {
        if ('0313' <= dateStr && dateStr < '0610') {
            return `M${year}`;
        } else if ('0610' <= dateStr && dateStr < '0912') {
            return `U${year}`;
        } else if ('0912' <= dateStr && dateStr < '1212') {
            return `Z${year}`;
        } else {
            return `H${year}`;
        }
    }
}

export const getDelta = (symbol: string) => {
    if (isFutures(symbol)) {
        if (symbol.startsWith('MES')) {
            return 5;
        } else if (symbol.startsWith('ES')) {
            return 50;
        } else if (symbol.startsWith('MNQ')) {
            return 2;
        } else if (symbol.startsWith('NQ')) {
            return 20;
        } else if (symbol.startsWith('US')) {
            return 1000;
        }
    }

    return 1;
}

export const roundListToCents = (numbers: number[]) => {
    let r: number[] = [];
    numbers.forEach(n => {
        r.push(Math.round(n * 100) / 100);
    });
    return r;
}

export const printBar = (open: number, high: number, low: number, close: number) => {
    return `open ${open} high ${high} low ${low} close ${close}`;
}

export const generateUniqueString = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export const roundToMillion = (n: number) => {
    return Math.round(n / 1000000);
}

export const getPullbackPrice = (symbol: string, entryPrice: number, stopLoss: number, isLong: boolean, pullbackDepth: number) => {
    let risk = Math.abs(entryPrice - stopLoss);
    let pullback = pullbackDepth * risk;
    let price = isLong ? entryPrice - pullback : entryPrice + pullback;
    return roundPrice(symbol, price);
}

export const getPullbackDepth = (currentPrice: number, entryPrice: number, stopLoss: number, isLong: boolean) => {
    if ((isLong && currentPrice >= entryPrice) ||
        (!isLong && currentPrice <= entryPrice)) {
        return 0;
    }
    let risk = Math.abs(entryPrice - stopLoss);
    let pullback = Math.abs(entryPrice - currentPrice);
    let depth = pullback / risk;
    return Math.round(depth * 100) / 100;
}

export const getBatchIndex = (keyIndex: number, initialTotal: number, currentTotal: number) => {
    let batchIndex = keyIndex;
    if (currentTotal < initialTotal) {
        let exitedCount = initialTotal - currentTotal;
        batchIndex = keyIndex + exitedCount;
    }
    return batchIndex;
}

export const updateHtmlIfChanged = (html: HTMLElement, text: string) => {
    if (html.textContent != text) {
        html.textContent = text;
        return true;
    }
    return false;
}

/**
 * Creates a function that executes the first call immediately, then rejects subsequent calls until the interval passes
 * @param func The function to execute
 * @param intervalMs The interval in milliseconds (default: 1000ms = 1 second)
 * @returns A function that only executes once per interval, with the first call being immediate
 */
export const executeOncePerInterval = <T extends (...args: any[]) => any>(
    func: T,
    intervalMs: number = 1000
): ((...args: Parameters<T>) => boolean) => {
    let lastRunTime = 0;

    return (...args: Parameters<T>): boolean => {
        const now = Date.now();

        // If enough time has passed since last run, execute immediately
        if (now - lastRunTime >= intervalMs) {
            lastRunTime = now;
            func(...args);
            return true; // Execution successful
        }

        // Reject the call - not enough time has passed
        return false; // Execution rejected
    };
};

/**
 * Creates a throttled function that will only execute once per specified interval
 * @param func The function to throttle
 * @param intervalMs The interval in milliseconds (default: 1000ms = 1 second)
 * @returns A throttled version of the function
 */
export const throttle = <T extends (...args: any[]) => any>(
    func: T,
    intervalMs: number = 1000
): ((...args: Parameters<T>) => void) => {
    let lastRunTime = 0;

    return (...args: Parameters<T>) => {
        const now = Date.now();

        if (now - lastRunTime >= intervalMs) {
            lastRunTime = now;
            func(...args);
        }
    };
};