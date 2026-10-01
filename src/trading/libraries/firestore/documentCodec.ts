export interface FirestoreTimestamp { seconds: number; nanoseconds: number }
type Value = Record<string, any>;

export function decodeFields(fields: Record<string, Value> = {}): Record<string, any> {
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}
export function decodeValue(value: Value): any {
    if ('nullValue' in value) return null;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('stringValue' in value) return value.stringValue;
    if ('timestampValue' in value) {
        const epoch = Date.parse(value.timestampValue);
        if (!Number.isFinite(epoch)) throw new Error('Invalid Firestore timestamp');
        const fraction = /\.(\d+)/.exec(value.timestampValue)?.[1] ?? '';
        return { seconds: Math.floor(epoch / 1000), nanoseconds: Number(fraction.padEnd(9, '0').slice(0, 9)) };
    }
    if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue);
    if ('mapValue' in value) return decodeFields(value.mapValue.fields);
    throw new Error('Unsupported Firestore value type');
}
export function encodeFields(fields: Record<string, any>): Record<string, Value> {
    return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined).map(([key, value]) => [key, encodeValue(value)]));
}
export function encodeValue(value: any): Value {
    if (value === null) return { nullValue: null };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('Cannot persist a nonfinite Firestore number');
        return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
    if (value && typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 2 && keys.includes('seconds') && keys.includes('nanoseconds')) {
            const timestamp = new Date(value.seconds * 1000).toISOString().replace('.000Z', '');
            return { timestampValue: `${timestamp}.${String(value.nanoseconds).padStart(9, '0')}Z` };
        }
        return { mapValue: { fields: encodeFields(value) } };
    }
    throw new Error('Unsupported Firestore persistence value');
}
