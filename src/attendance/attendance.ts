import { getApps, initializeApp } from 'firebase/app';
import { doc, getDocFromServer, getFirestore, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { requireClockInAttendance } from '../config/globalSettings.ts';
import { checkAttendance, type AttendanceResult, type AttendanceStore } from './checkAttendance.ts';
import { DEADLINE_MINUTE, isClockInWindow, pacificSession, validAttendance } from './policy.ts';
import { attendanceSlot, readAttendanceSlot } from './slots.ts';

let state: AttendanceResult = { status: 'checking', date: '', clockedInAt: null };
let started = false;
let pending = false;
let store: AttendanceStore | null = null;
const isReplay = () => /^\/replay\/?$/.test(window.location.pathname);
const eventLogs: string[] = [];
const lastEvents = new Map<string, string>();
let renderedLogs = '';

function formatPacific(date: Date): string {
    return `${date.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: 'numeric', minute: '2-digit', second: '2-digit',
    })} Pacific`;
}

function logEvent(category: string, message: string, level: 'info' | 'warn' = 'info') {
    // Suppress unchanged polling results, but report transitions and each day's results.
    const key = `${pacificSession(new Date()).date}:${message}`;
    if (lastEvents.get(category) === key) return;
    lastEvents.set(category, key);
    const line = `[${formatPacific(new Date())}] ${message}`;
    eventLogs.unshift(line);
    if (eventLogs.length > 100) eventLogs.pop();
    console[level](`[attendance] ${line}`);
    render();
}

function getStore(): AttendanceStore {
    if (store) return store;
    // Read the existing Firebase settings directly: importing secret/config/firestore
    // would pull in the main application's watchlist-dependent module graph.
    const config = JSON.parse(localStorage.getItem('tradingscripts.firebaseConfig') || '{}');
    if (!config.projectId || !config.apiKey || !config.appId) throw new Error('Missing Firebase configuration');
    const name = 'trading-attendance';
    const app = getApps().find(app => app.name === name) ?? initializeApp(config, name);
    const db = getFirestore(app);
    const reference = (date: string) => doc(db, 'tradingAttendance', attendanceSlot(date));
    store = {
        async read(date) {
            const snapshot = await getDocFromServer(reference(date));
            const timestamp = snapshot.data()?.clockedInAt;
            const record = readAttendanceSlot(date, snapshot.exists() ? {
                tradingDate: snapshot.data()?.tradingDate,
                clockedInAt: timestamp instanceof Timestamp ? timestamp.toDate() : null,
            } : null);
            logEvent('read', !snapshot.exists()
                ? `Read slot ${attendanceSlot(date)} for ${date}: no clock-in record found.`
                : !record.exists
                    ? `Read slot ${attendanceSlot(date)}: stored date is ${String(snapshot.data()?.tradingDate ?? 'missing')}; no clock-in for ${date}.`
                : timestamp instanceof Timestamp
                    ? `Read ${date}: current clock-in time is ${formatPacific(timestamp.toDate())}. Existing timestamp preserved.`
                    : `Read ${date}: record exists but its clock-in timestamp is invalid.`,
                snapshot.exists() && !(timestamp instanceof Timestamp) ? 'warn' : 'info');
            return record;
        },
        async createIfAbsent(date) {
            logEvent('signal', `Clock-in signaled for ${date}; waiting for Firestore confirmation.`);
            const outcome = await runTransaction(db, async transaction => {
                const ref = reference(date);
                const existing = await transaction.get(ref);
                if (existing.exists() && existing.data().tradingDate === date) return 'existing';
                // Transactions can retry. Recheck the window on every attempt.
                const now = new Date();
                if (pacificSession(now).date !== date || !isClockInWindow(now)) return 'expired';
                transaction.set(ref, { tradingDate: date, clockedInAt: serverTimestamp(), policyVersion: 1 });
                return 'created';
            });
            logEvent('write', outcome === 'created'
                ? `Clock-in write confirmed for ${date}; reading the server timestamp to verify eligibility.`
                : outcome === 'existing'
                    ? `Clock-in already recorded for ${date} by another request; keeping its timestamp.`
                    : `Clock-in not written for ${date}: the allowed window ended before submission.`,
                outcome === 'expired' ? 'warn' : 'info');
        },
    };
    return store;
}

export function canOpenNewExposure(): boolean {
    return !isReplay() && (!requireClockInAttendance
        || (state.status === 'eligible' && validAttendance(state.clockedInAt, new Date())));
}

export function attendanceMessage(): string {
    if (!isReplay() && !requireClockInAttendance) {
        return 'Clock-in requirement disabled in global settings — eligible';
    }
    if (canOpenNewExposure()) {
        const time = state.clockedInAt!.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' });
        return `Clocked in at ${time} Pacific — eligible today`;
    }
    if (state.date !== pacificSession(new Date()).date || state.status === 'checking') return 'Verifying clock-in — new entries locked';
    if (state.status === 'waiting') return 'New entries locked — automatic clock-in opens at 5:00 AM Pacific';
    if (state.status === 'error') return 'Cannot verify clock-in — new entries locked; retrying automatically';
    return 'New entries locked today — no valid clock-in before 5:45 AM Pacific';
}

export function allowEntry(): boolean {
    if (canOpenNewExposure()) return true;
    logEvent('entry', `Entry blocked: ${attendanceMessage()}`, 'warn');
    render();
    return false;
}

function render() {
    if (!document.body || isReplay()) return;
    let banner = document.getElementById('tradingAttendanceStatus');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'tradingAttendanceStatus';
        banner.setAttribute('role', 'status');
        banner.style.cssText = 'padding:8px 12px;font:14px system-ui;border-bottom:1px solid #777;';
        document.body.prepend(banner);
    }
    const message = attendanceMessage();
    const deadlineLocked = !canOpenNewExposure() && pacificSession(new Date()).minute >= DEADLINE_MINUTE;
    const display = deadlineLocked
        ? `TRADING LOCKED\n${message}\nClock-in deadline: 5:45 AM Pacific. New entries and adds are blocked. Closing positions remains available.`
        : message;
    if (banner.textContent !== display) banner.textContent = display;
    banner.setAttribute('role', deadlineLocked ? 'alert' : 'status');
    banner.style.cssText = deadlineLocked
        ? 'position:sticky;top:0;z-index:10000;box-sizing:border-box;width:100%;padding:22px 18px;background:#991b1b;color:#fff;border:3px solid #fca5a5;box-shadow:0 4px 16px #0008;font:700 clamp(18px,2vw,28px)/1.5 system-ui;text-align:center;white-space:pre-line;'
        : `padding:8px 12px;font:14px system-ui;border-bottom:1px solid #777;background:${canOpenNewExposure() ? '#16452c' : '#573e13'};color:#fff;`;
    let details = document.getElementById('tradingAttendanceLogs');
    if (!details) {
        details = document.createElement('details');
        details.id = 'tradingAttendanceLogs';
        details.setAttribute('open', '');
        details.style.cssText = 'padding:6px 12px;background:#20252b;color:#eee;font:12px system-ui;';
        const summary = document.createElement('summary');
        summary.textContent = 'Attendance events';
        summary.style.cursor = 'pointer';
        const content = document.createElement('pre');
        content.id = 'tradingAttendanceLogLines';
        content.style.cssText = 'max-height:160px;overflow:auto;white-space:pre-wrap;margin:6px 0;';
        details.append(summary, content);
        banner.after(details);
        renderedLogs = '';
    }
    const logs = eventLogs.join('\n');
    if (logs !== renderedLogs) {
        document.getElementById('tradingAttendanceLogLines')!.textContent = logs;
        renderedLogs = logs;
    }
}

async function refresh() {
    render();
    if (pending || canOpenNewExposure()) return;
    pending = true;
    try {
        state = await checkAttendance(getStore(), () => new Date());
        lastEvents.delete('error');
        logEvent('status', attendanceMessage());
    } catch (error) {
        state = { status: 'error', date: pacificSession(new Date()).date, clockedInAt: null };
        const reason = error instanceof Error ? error.message : 'Unknown error';
        logEvent('error', `Clock-in verification failed: ${reason}. New entries remain locked; retrying automatically.`, 'warn');
    } finally {
        pending = false;
        render();
    }
}

export function startAttendance() {
    if (started || isReplay()) return;
    started = true;
    logEvent('startup', requireClockInAttendance
        ? `Attendance started: reading clock-in for ${pacificSession(new Date()).date}. Allowed window: 5:00–5:45 AM Pacific.`
        : 'Attendance started with the clock-in requirement disabled in global settings.');
    void refresh();
    document.addEventListener('DOMContentLoaded', render, { once: true });
    window.addEventListener('online', () => void refresh());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
    // Handles an early launch, midnight rollover, and transient connectivity failures.
    setInterval(() => void refresh(), 15_000);
}
