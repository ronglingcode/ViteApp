import type { AccountFill } from '../../models/account.ts';
import { marketTime } from '../marketdata/marketClock.ts';

/** Pure formatters shared with Java ExecutionExports; no broker reads or UI state. */
export function aggregateExecutionBubbles(fills: AccountFill[], details: boolean): AccountFill[] {
    const groups = new Map<string, AccountFill[]>();
    for (const fill of fills) {
        const time = marketTime(fill.timestamp);
        const key = JSON.stringify([fill.symbol, time.date, Math.floor(time.minutesSinceMarketOpen), fill.isBuy,
            ...(details ? [clusteredPrice(Math.round(fill.price * 100) / 100)] : [])]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(fill);
    }
    return [...groups.values()].map(group => {
        if (group.length === 1) return { ...group[0] };
        const quantity = group.reduce((sum, fill) => sum + fill.quantity, 0);
        return { ...group[0], quantity, price: group.reduce((sum, fill) => sum + fill.quantity * fill.price, 0) / quantity };
    });
}

function clusteredPrice(price: number): number {
    const cents = price > 200 ? 5 : price > 100 ? 4 : price > 50 ? 3 : price > 25 ? 2 : 0;
    return cents ? Math.floor(price * 100 / cents) * cents / 100 : price;
}

/** Snippet for the existing ThinkScript study's time/BubbleGreen/BubbleRed definitions. */
export function executionBubbleScript(fills: AccountFill[]): string {
    return fills.map(fill => {
        const seconds = Math.floor(marketTime(fill.timestamp).minutesSinceMarketOpen) * 60;
        const symbol = fill.symbol.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
        return `AddChartBubble(GetSymbol() == "${symbol}" and time == ${seconds}, ${Math.round(fill.price * 100) / 100}, "${fill.isBuy ? '+' : '-'}${fill.quantity}", GlobalColor("${fill.isBuy ? 'BubbleGreen' : 'BubbleRed'}"), ${fill.isBuy ? 0 : 1});\n`;
    }).join('');
}

export function executionScript(fills: AccountFill[], details: boolean): string {
    return executionBubbleScript(aggregateExecutionBubbles(fills, details));
}

/** Preserve the legacy account-statement CSV layout used by Export trades. */
export function executionTradesCsv(fills: AccountFill[], now: number, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const dateTime = (timestamp: number) => {
        const p = Object.fromEntries(formatter.formatToParts(timestamp).map(part => [part.type, part.value]));
        return [`${p.month}/${p.day}/${p.year}`, `${p.hour}:${p.minute}:${p.second}`];
    };
    const cell = (value: string | number) => /[",\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
    const row = (values: (string | number)[]) => values.map(cell).join(',');
    const date = dateTime(now)[0];
    const lines = [
        `Account Statement since ${date} through ${date}`,
        'Cash Balance',
        'DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE',
        'Futures Statements',
        'Trade Date,Exec Date,Exec Time,Type,Ref #,Description,Misc Fees,Commissions & Fees,Amount,Balance',
        'Forex Statements',
        ',Date,Time,Type,Ref #,Description,Commissions & Fees,Amount,Amount(USD),Balance',
        'Total Cash **************',
        'Account Order History',
        'Notes,,Time Placed,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,,TIF,Status',
        ...fills.map(fill => row(['', '', dateTime(fill.timestamp).join(' '), fill.isBuy ? 'BUY' : 'SELL', `${fill.isBuy ? '+' : '-'}${fill.quantity}`, `TO ${fill.positionEffectIsOpen ? 'OPEN' : 'CLOSE'}`, fill.symbol, '', '', 'ETF', '~', 'MKT', 'DAY', 'FILLED'])),
        'Account Trade History',
        ',Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type',
        ...fills.map(fill => row(['', dateTime(fill.timestamp).join(' '), 'STOCK', fill.isBuy ? 'BUY' : 'SELL', `${fill.isBuy ? '+' : '-'}${fill.quantity}`, `TO ${fill.positionEffectIsOpen ? 'OPEN' : 'CLOSE'}`, fill.symbol, '', '', 'ETF', fill.price, fill.price, 'MKT'])),
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
    return lines.join('\n') + '\n';
}
