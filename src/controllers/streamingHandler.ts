import * as DB from '../data/db';
import * as AlpacaStreaming from '../api/alpaca/streaming';
import * as Chart from '../ui/chart';
import type * as Models from '../models/models';
import * as Firestore from '../firestore';
import * as Broker from '../api/broker';
// https://polygon.io/glossary/conditions-indicators
export const conditionsNotUpdateHighLow = [
    "W", "C", "T", "U", "M", "Q", "N", "H", "I", "V", "7"
];
export const conditionsNotUpdateLastPrice = [
    "W", "C", "T", "U", "M", "Q", "N", "H", "I", "V", "7"
];
export const conditionsNotUpdateLastPriceNumbers = [
    2,7,12,13,15,16,20,21,37,52,53
];
export const conditionsNotUpdateVolume = [
    "M", "Q", "9"
];

export const handleTimeAndSalesData = (data: any) => {
    let timeSale = AlpacaStreaming.createTimeSale(data);
    if (timeSale) {
        DB.updateFromTimeSale(timeSale);
    }
}
export const handleMessageData = (data: any[]) => {
    data.forEach(element => {
        let service = element.service;
        let contents = element.content;
        if (["TIMESALE_EQUITY"].includes(service)) {
        } else if (service === "TIMESALE_FUTURES") {
        } else if (service === "QUOTE") {
        } else if (service === "ACCT_ACTIVITY") {
        } else {
            console.log(service);
            console.log(contents);
        }
    });
};

export const handleTradeUpdates = (symbol: string, data: any) => {
    Broker.UpdateAccountUIWithDelay('handleTradeUpdates');
}


const handleOrderRejection = (symbol: string, message: string) => {
    console.log(message);
    Firestore.logError('Order rejected by TOS');
    let index = message.indexOf('<OrderRejectionMessage');
    let xml = message.substring(index);
    let parser = new DOMParser();
    let d = parser.parseFromString(xml, "text/xml");
    let orders = d.getElementsByTagName('Order');
    if (orders.length < 1)
        return;
    let order = orders[0];
    let quantity = 0;
    let quantityTags = order.getElementsByTagName('OriginalQuantity');
    if (quantityTags.length == 1) {
        quantity = parseInt(quantityTags[0].innerHTML, 10);
    }

    Firestore.logError(`${symbol}: ${quantity} shares rejected by TOS: `);
};