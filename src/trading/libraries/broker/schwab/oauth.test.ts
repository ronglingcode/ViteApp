import test from 'node:test';
import assert from 'node:assert/strict';
import { SchwabOAuth } from './oauth.ts';

test('concurrent callers share one refresh, persist rotation, and later refresh uses it', async () => {
    let stored = { appKey: 'app', secret: 'secret', access_token: '', refresh_token: 'old', expires_at: 0 };
    const forms: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const client = new SchwabOAuth({ request: async (_url, _method, _headers, body) => {
        forms.push(body!); await pending;
        return { status: 200, body: JSON.stringify({ access_token: 'new', refresh_token: 'rotated', expires_in: 600 }) };
    } }, { loadSchwab: () => ({ ...stored }), saveSchwab: async value => { stored = value as typeof stored; } }, value => Buffer.from(value).toString('base64'), undefined, () => 100000);
    const calls = [client.accessToken(), client.accessToken(), client.refresh()]; release();
    await Promise.all(calls);
    assert.equal(forms.length, 1);
    assert.equal(stored.refresh_token, 'rotated'); assert.equal(stored.expires_at, 700000);
    await client.refresh();
    assert.equal(new URLSearchParams(forms[1]).get('refresh_token'), 'rotated');
});
