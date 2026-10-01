import type { HttpPort } from '../../ports/http.ts';
import { decodeFields, encodeFields } from './documentCodec.ts';

/** Firestore's existing user security rules still apply; an API key is not an admin credential. */
export class FirestoreApi {
    private readonly http: HttpPort;
    private readonly root: string;
    private readonly apiKey: () => string;
    private readonly idToken: () => string;
    constructor(http: HttpPort, projectId: string, apiKey = () => '', idToken = () => '') {
        this.http = http; this.root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
        this.apiKey = apiKey; this.idToken = idToken;
    }
    private async request(path: string, method: string, body?: unknown, missingAllowed = false) {
        const url = new URL(`${this.root}${path}`);
        const key = this.apiKey(); if (key) url.searchParams.set('key', key);
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = this.idToken(); if (token) headers.Authorization = `Bearer ${token}`;
        const response = await this.http.request(url.toString(), method, headers, body === undefined ? undefined : JSON.stringify(body));
        if (missingAllowed && response.status === 404) return null;
        if (response.status < 200 || response.status >= 300) throw new Error(`Firestore ${method} HTTP ${response.status}`);
        try { return JSON.parse(response.body); } catch { throw new Error('Firestore returned invalid JSON'); }
    }
    async getDocument(path: string): Promise<Record<string, any> | null> {
        const json = await this.request(`/${encodePath(path)}`, 'GET', undefined, true);
        return json === null ? null : decodeFields(json.fields);
    }
    async setDocument(path: string, data: Record<string, any>): Promise<void> {
        await this.request(`/${encodePath(path)}`, 'PATCH', { fields: encodeFields(data) });
    }
    async fetchConfigData(): Promise<Record<string, any>> {
        const query = { structuredQuery: { from: [{ collectionId: 'configDataSnapshot' }], orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }], limit: 1 } };
        const rows = await this.request(':runQuery', 'POST', query);
        if (!Array.isArray(rows)) throw new Error('Firestore config query returned invalid rows');
        const document = rows.find(row => row.document)?.document;
        if (!document) throw new Error('Firestore has no configuration snapshot');
        return decodeFields(document.fields);
    }
    getTradingState(profile: string) { return this.getDocument(`state-${profile}/tradingState`); }
    setTradingState(profile: string, state: Record<string, any>) { return this.setDocument(`state-${profile}/tradingState`, state); }
    async addDocument(collection: string, data: Record<string, any>): Promise<void> {
        await this.request(`/${encodePath(collection)}`, 'POST', { fields: encodeFields(data) });
    }
}
function encodePath(path: string) { return path.split('/').map(encodeURIComponent).join('/'); }
