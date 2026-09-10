import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAttendance, type AttendanceStore } from './checkAttendance.ts';
import { isClockInWindow, pacificSession, validAttendance, isClosingSchwabOrder } from './policy.ts';
import { attendanceSlot, readAttendanceSlot } from './slots.ts';

test('months and years reuse the same 31 slots', () => {
    assert.equal(attendanceSlot('2026-09-01'), '01');
    assert.equal(attendanceSlot('2026-10-01'), '01');
    assert.equal(attendanceSlot('2027-01-31'), '31');
    const slots = new Set<string>();
    for (let day = new Date('2026-01-01T12:00:00Z'); day.getUTCFullYear() < 2028; day.setUTCDate(day.getUTCDate() + 1)) {
        slots.add(attendanceSlot(day.toISOString().slice(0, 10)));
    }
    assert.equal(slots.size, 31);
});

test('full date must match even if a stale slot contains a timestamp from today', () => {
    const timestamp = new Date('2026-09-10T12:30:00Z');
    for (const tradingDate of ['2026-08-10', '2025-09-10', undefined]) {
        assert.deepEqual(readAttendanceSlot('2026-09-10', { tradingDate, clockedInAt: timestamp }),
            { exists: false, clockedInAt: null });
    }
    assert.deepEqual(readAttendanceSlot('2026-09-10', { tradingDate: '2026-09-10', clockedInAt: timestamp }),
        { exists: true, clockedInAt: timestamp });
});

test('stale slots are replaced inside the window and remain locked after the deadline', async () => {
    for (const late of [false, true]) {
        let record = { tradingDate: '2026-08-10', clockedInAt: new Date('2026-08-10T12:30:00Z') };
        let writes = 0;
        const store: AttendanceStore = {
            async read(date) { return readAttendanceSlot(date, record); },
            async createIfAbsent(date) {
                if (record.tradingDate !== date) {
                    record = { tradingDate: date, clockedInAt: new Date('2026-09-10T12:30:00Z') };
                    writes++;
                }
            },
        };
        const now = () => new Date(late ? '2026-09-10T13:00:00Z' : '2026-09-10T12:30:00Z');
        assert.equal((await checkAttendance(store, now)).status, late ? 'locked' : 'eligible');
        await checkAttendance(store, now);
        assert.equal(writes, late ? 0 : 1);
        assert.equal(record.tradingDate, late ? '2026-08-10' : '2026-09-10');
    }
});

test('Pacific window is inclusive at 5:00 and exclusive at 5:45 in summer and winter', () => {
    for (const [date, offset] of [['2026-09-10', '-07:00'], ['2026-01-12', '-08:00']]) {
        assert.equal(isClockInWindow(new Date(`${date}T04:59:59${offset}`)), false);
        assert.equal(isClockInWindow(new Date(`${date}T05:00:00${offset}`)), true);
        assert.equal(isClockInWindow(new Date(`${date}T05:44:59.999${offset}`)), true);
        assert.equal(isClockInWindow(new Date(`${date}T05:45:00${offset}`)), false);
    }
    assert.equal(isClockInWindow(new Date('2026-03-08T12:30:00Z')), true);
    assert.equal(isClockInWindow(new Date('2026-11-01T13:30:00Z')), true);
    assert.equal(pacificSession(new Date('2026-09-11T02:00:00Z')).date, '2026-09-10');
});

test('attendance cannot carry over, be future-dated, or have a late server timestamp', () => {
    const now = new Date('2026-09-10T13:00:00Z');
    assert.equal(validAttendance(new Date('2026-09-10T12:30:00Z'), now), true);
    assert.equal(validAttendance(new Date('2026-09-09T12:30:00Z'), now), false);
    assert.equal(validAttendance(new Date('2026-09-11T12:30:00Z'), now), false);
    assert.equal(validAttendance(new Date('2026-09-10T12:45:00Z'), now), false);
    assert.equal(validAttendance(null, now), false);
});

function fakeStore(timestamp: Date | null = null) {
    let record = { exists: timestamp !== null, clockedInAt: timestamp };
    const operations: string[] = [];
    const store: AttendanceStore = {
        async read(date) { operations.push(`read:${date}`); return record; },
        async createIfAbsent(date) {
            operations.push(`create:${date}`);
            if (!record.exists) record = { exists: true, clockedInAt: new Date('2026-09-10T12:30:00Z') };
        },
    };
    return { store, operations };
}

test('reads first, creates only if absent, then requires a confirmed read', async () => {
    const { store, operations } = fakeStore();
    const result = await checkAttendance(store, () => new Date('2026-09-10T12:30:00Z'));
    assert.equal(result.status, 'eligible');
    assert.deepEqual(operations, ['read:2026-09-10', 'create:2026-09-10', 'read:2026-09-10']);
});

test('an existing timestamp is preserved, including when opened after the deadline', async () => {
    const { store, operations } = fakeStore(new Date('2026-09-10T12:10:00Z'));
    const result = await checkAttendance(store, () => new Date('2026-09-10T15:00:00Z'));
    assert.equal(result.status, 'eligible');
    assert.deepEqual(operations, ['read:2026-09-10']);
});

test('early and late launches never create records', async () => {
    for (const [time, status] of [['11:59:59', 'waiting'], ['12:45:00', 'locked']]) {
        const { store, operations } = fakeStore();
        assert.equal((await checkAttendance(store, () => new Date(`2026-09-10T${time}Z`))).status, status);
        assert.deepEqual(operations, ['read:2026-09-10']);
    }
});

test('a read finishing after the deadline cannot initiate a late write', async () => {
    const { store, operations } = fakeStore();
    let calls = 0;
    const result = await checkAttendance(store, () => new Date(calls++ === 0
        ? '2026-09-10T12:44:59Z' : '2026-09-10T12:45:01Z'));
    assert.equal(result.status, 'locked');
    assert.equal(operations.length, 1);
});

test('an in-flight read crossing midnight never grants yesterday permission', async () => {
    const { store, operations } = fakeStore(new Date('2026-09-10T12:30:00Z'));
    let calls = 0;
    const result = await checkAttendance(store, () => new Date(calls++ === 0
        ? '2026-09-11T06:59:59Z' : '2026-09-11T07:00:01Z'));
    assert.equal(result.status, 'checking');
    assert.equal(operations.length, 1);
});

test('a failed read does not attempt to write', async () => {
    let created = false;
    await assert.rejects(checkAttendance({
        async read() { throw new Error('offline'); },
        async createIfAbsent() { created = true; },
    }, () => new Date('2026-09-10T12:30:00Z')), /offline/);
    assert.equal(created, false);
});

test('closing orders remain available; entries and unknown nested orders are gated', () => {
    const order = (instruction: string) => ({ orderLegCollection: [{ instruction }] });
    assert.equal(isClosingSchwabOrder(order('SELL')), true);
    assert.equal(isClosingSchwabOrder(order('BUY_TO_COVER')), true);
    assert.equal(isClosingSchwabOrder(order('BUY')), false);
    assert.equal(isClosingSchwabOrder(order('SELL_SHORT')), false);
    assert.equal(isClosingSchwabOrder({}), false);
    assert.equal(isClosingSchwabOrder({ childOrderStrategies: [order('SELL'), order('SELL')] }), true);
    assert.equal(isClosingSchwabOrder({ ...order('SELL'), childOrderStrategies: [order('BUY')] }), false);
});
