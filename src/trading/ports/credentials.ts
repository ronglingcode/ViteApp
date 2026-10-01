export interface SchwabCredentials {
    appKey: string;
    secret: string;
    access_token: string;
    refresh_token: string;
    expires_at?: number;
    accountHashValue?: string;
    redirectUrl?: string;
}
export interface CredentialPort {
    loadSchwab(): SchwabCredentials;
    saveSchwab(credentials: SchwabCredentials): Promise<void>;
}
