const marketFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function marketTime(epochMs: number) {
    const parts = Object.fromEntries(marketFormatter.formatToParts(epochMs).map(part => [part.type, part.value]));
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        minutesSinceMarketOpen: minutes - 570 + Number(parts.second) / 60 + (epochMs % 1000) / 60000,
        isPremarket: minutes < 570,
        isRegularSession: minutes >= 570 && (minutes < 960 || (minutes === 960 && Number(parts.second) === 0 && epochMs % 1000 === 0)),
    };
}

/** Date-only arithmetic does not inherit the computer's timezone or DST offset. */
export function addDays(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(value.getTime())) throw new Error('Invalid market date');
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}
