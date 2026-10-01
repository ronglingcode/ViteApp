import type { CredentialPort, SchwabCredentials } from '../ports/credentials.ts';

export const browserCredentials: CredentialPort = {
    loadSchwab() {
        return JSON.parse(localStorage.getItem('tradingscripts.schwab') || '{}');
    },
    async saveSchwab(credentials: SchwabCredentials) {
        const existing = JSON.parse(localStorage.getItem('tradingscripts.schwab') || '{}');
        localStorage.setItem('tradingscripts.schwab', JSON.stringify({ ...existing, ...credentials }));
    },
};
