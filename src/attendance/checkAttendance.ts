import { DEADLINE_MINUTE, isClockInWindow, pacificSession, validAttendance } from './policy.ts';

export type AttendanceStatus = 'checking' | 'waiting' | 'eligible' | 'locked' | 'error';
export interface AttendanceResult {
    status: AttendanceStatus;
    date: string;
    clockedInAt: Date | null;
}
export interface AttendanceStore {
    read(date: string): Promise<{ exists: boolean; clockedInAt: Date | null }>;
    createIfAbsent(date: string): Promise<void>;
}

/** No watchlist, broker, trading profile, or historical/replay date dependency. */
export async function checkAttendance(store: AttendanceStore, now: () => Date): Promise<AttendanceResult> {
    const date = pacificSession(now()).date;
    let record = await store.read(date);
    // Never carry yesterday's in-flight request across midnight.
    if (pacificSession(now()).date !== date) return { status: 'checking', date, clockedInAt: null };
    if (!record.exists && isClockInWindow(now())) {
        await store.createIfAbsent(date);
        record = await store.read(date); // Only a confirmed server timestamp can grant eligibility.
    }
    const current = now();
    if (pacificSession(current).date !== date) return { status: 'checking', date, clockedInAt: null };
    const status = validAttendance(record.clockedInAt, current) ? 'eligible'
        : record.exists || pacificSession(current).minute >= DEADLINE_MINUTE ? 'locked'
        : isClockInWindow(current) ? 'error' : 'waiting';
    return { status, date, clockedInAt: record.clockedInAt };
}
