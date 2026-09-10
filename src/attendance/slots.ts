export function attendanceSlot(date: string): string {
    return date.slice(-2);
}

/** A slot from another month/year is not attendance for the requested date. */
export function readAttendanceSlot(date: string, record: { tradingDate?: unknown; clockedInAt: Date | null } | null) {
    const exists = record !== null && record.tradingDate === date;
    return { exists, clockedInAt: exists ? record.clockedInAt : null };
}
