import type { StreamPhase } from './integrationHealth.ts';

/** Vendor statuses are observations; subscription acceptance alone never proves live trades. */
export function massiveStreamStatus(message: { status?: string; message?: string }): { phase: StreamPhase; error?: string } | undefined {
    if (message.status === 'connected') return { phase: 'authenticating' };
    if (message.status === 'auth_success') return { phase: 'subscribing' };
    if (message.status === 'success' && /subscribed to/i.test(message.message ?? '')) return { phase: 'subscribed' };
    if (['auth_failed', 'error', 'not_authorized', 'NOT_AUTHORIZED'].includes(message.status ?? '')
        || /failed|not authorized|not entitled|denied|invalid/i.test(message.message ?? ''))
        return { phase: 'failed', error: 'Massive stream authentication or subscription failed' };
    return undefined;
}
