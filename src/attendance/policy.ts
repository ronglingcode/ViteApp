export const TIME_ZONE = 'America/Los_Angeles';
export const WINDOW_START_MINUTE = 5 * 60;
export const DEADLINE_MINUTE = 5 * 60 + 45;

const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function pacificSession(now: Date) {
    const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        minute: Number(parts.hour) * 60 + Number(parts.minute),
    };
}

export function isClockInWindow(now: Date) {
    const { minute } = pacificSession(now);
    return minute >= WINDOW_START_MINUTE && minute < DEADLINE_MINUTE;
}

export function validAttendance(clockIn: Date | null, now: Date) {
    return clockIn !== null && Number.isFinite(clockIn.getTime())
        && pacificSession(clockIn).date === pacificSession(now).date
        && clockIn.getTime() <= now.getTime() && isClockInWindow(clockIn);
}

// These are the closing instructions emitted by our Schwab equity order factories.
// Unknown payloads fail closed. Inspect every child, including OCO/trigger trees.
export function isClosingSchwabOrder(order: any): boolean {
    if (!order || typeof order !== 'object') return false;
    const legs = Array.isArray(order.orderLegCollection) ? order.orderLegCollection : [];
    const children = Array.isArray(order.childOrderStrategies) ? order.childOrderStrategies : [];
    return (legs.length > 0 || children.length > 0)
        && legs.every((leg: any) => leg.positionEffect !== 'OPENING'
            && ['SELL', 'BUY_TO_COVER', 'SELL_TO_CLOSE', 'BUY_TO_CLOSE'].includes(leg.instruction))
        && children.every(isClosingSchwabOrder);
}
