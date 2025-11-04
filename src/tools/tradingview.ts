import * as Models from '../models/models';

export const exportTrades = () => {
    let d = new Date();
    let date = d.toLocaleDateString(); // 2/27/23
    let csv = `Account Statement for *****3551TDA (lingrong) since ${date} through ${date}\n`;
    csv += generateTopOfExport();
    let orders = Models.getAllOrderExecutions(undefined);
    csv += `Account Order History\n`;
    csv += `Notes,,Time Placed,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,,TIF,Status\n`;
    orders.forEach((order) => {
        csv += generateOneRowForOrderHistory(order);
    });
    csv += `Account Trade History\n`;
    csv += `,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type\n`;
    orders.forEach((order) => {
        csv += generateOneRowForTradeHistory(order);
    });
    csv += generateBottomOfExport();
    console.log(csv);
};
const getDateTimeString = (d: Date) => {
    let date = d.toLocaleDateString();
    let time = d.toLocaleTimeString();
    let t = time.split(' ');
    if (t.length > 0) {
        time = t[0];
    }
    return `${date} ${time}`
    //2/28/23 07:59:05
};
const generateOneRowForOrderHistory = (oe: Models.OrderExecution) => {
    let action = oe.isBuy ? 'BUY' : 'SELL';
    let symbol = oe.symbol;
    let orderType = Models.toTdaOrderTypeString(Models.OrderType.MARKET);
    let positionEffect = oe.positionEffectIsOpen ? "OPEN" : "CLOSE";
    let q = oe.quantity;
    let netQ = oe.isBuy ? `+${q}` : `-${q}`;
    let time = getDateTimeString(oe.time);
    let code = `,,${time},${action},${netQ},TO ${positionEffect},${symbol},,,ETF,~,${orderType},DAY,FILLED\n`;
    return code;
};
const generateOneRowForTradeHistory = (oe: Models.OrderExecution) => {
    let action = oe.isBuy ? 'BUY' : 'SELL';
    let symbol = oe.symbol;
    let orderType = Models.toTdaOrderTypeString(Models.OrderType.MARKET);
    let positionEffect = oe.positionEffectIsOpen ? "OPEN" : "CLOSE";
    let q = oe.quantity;
    let netQ = oe.isBuy ? `+${q}` : `-${q}`;
    let time = getDateTimeString(oe.time);
    let p = oe.price;
    let code = `,${time},STOCK,${action},${netQ},TO ${positionEffect},${symbol},,,ETF,${p},${p},${orderType}\n`;
    return code;
}
const generateForOneTrade = (oe: Models.OrderExecution) => {
    let action = oe.isBuy ? 'buy' : 'sell';
    let q = oe.quantity;
    let color = oe.isBuy ? "color.green" : "color.red";
    let tooltip = `${action} ${q};`;
    let code = `if syminfo.ticker == '${oe.symbol}'\n`;
    code += `    label.new(bar_index, text="${q}",yloc=yloc.price, y=266, color=${color}, style=label.style_label_lower_left, textcolor = color.white, size=size.tiny, tooltip = "${tooltip}")\n`;

    return code
};
const generateTopOfExport = () => {
    let lines = [
        `Cash Balance`,
        `DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE`,
        `Futures Statements`,
        `Trade Date,Exec Date,Exec Time,Type,Ref #,Description,Misc Fees,Commissions & Fees,Amount,Balance`,
        `Forex Statements`,
        `,Date,Time,Type,Ref #,Description,Commissions & Fees,Amount,Amount(USD),Balance`,
        `Total Cash **************`,
    ];
    return generateLines(lines);
};
const generateBottomOfExport = () => {
    let lines = [
        'Profits and Losses',
        'Symbol,Description,P/L Open,P/L %,P/L Day,Margin Req,Mark Value',
        'Account Summary',
        'Net Liquidating Value,**************',
        'Stock Buying Power,**************',
        'Option Buying Power,**************',
        'Equity Commissions & Fees YTD,**************',
        'Futures Commissions & Fees YTD,**************',
        'Total Commissions & Fees YTD,**************',
    ];
    return generateLines(lines);
};
const generateLines = (lines: string[]) => {
    let text = '';
    lines.forEach(line => {
        text += `${line}\n`;
    });
    return text;
};