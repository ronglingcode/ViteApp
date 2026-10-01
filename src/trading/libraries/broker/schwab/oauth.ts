import type { HttpPort } from '../../../ports/http.ts';
import type { CredentialPort, SchwabCredentials } from '../../../ports/credentials.ts';

/** Refresh coordination is confined to credentials; it does not serialize trading actions. */
export class SchwabOAuth {
    private readonly http: HttpPort;
    private readonly credentials: CredentialPort;
    private readonly encodeBasic: (value: string) => string;
    private readonly endpoint: () => string;
    private readonly now: () => number;
    private inFlight?: Promise<SchwabCredentials>;
    constructor(http: HttpPort, credentials: CredentialPort, encodeBasic: (value: string) => string,
        endpoint = () => 'https://api.schwabapi.com/v1/oauth/token', now = Date.now) {
        this.http = http; this.credentials = credentials; this.encodeBasic = encodeBasic;
        this.endpoint = endpoint; this.now = now;
    }
    async accessToken(force = false): Promise<string> {
        const value = this.credentials.loadSchwab();
        if (!force && value.access_token && (value.expires_at ?? 0) > this.now() + 60000) return value.access_token;
        return (await this.refresh()).access_token;
    }
    refresh(): Promise<SchwabCredentials> {
        if (this.inFlight) return this.inFlight;
        const value = this.credentials.loadSchwab();
        this.inFlight = this.exchange({ grant_type: 'refresh_token', refresh_token: value.refresh_token }, value)
            .finally(() => { this.inFlight = undefined; });
        return this.inFlight;
    }
    exchangeAuthorizationCode(callbackUrl: string): Promise<SchwabCredentials> {
        const code = new URL(callbackUrl).searchParams.get('code');
        if (!code) return Promise.reject(new Error('Schwab callback has no authorization code'));
        const value = this.credentials.loadSchwab();
        return this.exchange({ grant_type: 'authorization_code', code, redirect_uri: value.redirectUrl || 'https://127.0.0.1' }, value);
    }
    private async exchange(data: Record<string, string>, previous: SchwabCredentials): Promise<SchwabCredentials> {
        if (!previous.appKey || !previous.secret) throw new Error('Schwab app credentials are missing');
        if (data.grant_type === 'refresh_token' && !data.refresh_token) throw new Error('Schwab refresh token is missing; authorize again');
        const response = await this.http.request(this.endpoint(), 'POST', {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${this.encodeBasic(`${previous.appKey}:${previous.secret}`)}`,
        }, new URLSearchParams(data).toString());
        if (response.status !== 200) throw new Error(`Schwab OAuth HTTP ${response.status}${response.status === 400 || response.status === 401 ? '; authorize again if refresh token is revoked' : ''}`);
        let result: Record<string, unknown>;
        try { result = JSON.parse(response.body); } catch { throw new Error('Schwab OAuth returned invalid JSON'); }
        if (!result || typeof result.access_token !== 'string' || !result.access_token || typeof result.expires_in !== 'number' || !Number.isFinite(result.expires_in) || result.expires_in <= 0)
            throw new Error('Schwab OAuth returned no usable token/expiry');
        const updated = {
            ...previous, access_token: result.access_token,
            refresh_token: typeof result.refresh_token === 'string' && result.refresh_token ? result.refresh_token : previous.refresh_token,
            expires_at: this.now() + result.expires_in * 1000,
        };
        await this.credentials.saveSchwab(updated);
        return updated;
    }
}
