import type { HttpPort } from '../trading/ports/http.ts';

/** Bounded reads so a stalled health request can recover on the next check. */
export const readHttp: HttpPort = {
    async request(url, method, headers, body) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(url, { method, headers, body, signal: controller.signal });
            return { status: response.status, body: await response.text() };
        } catch {
            throw new Error(controller.signal.aborted ? 'API read timed out after 15s' : 'API read failed before a response');
        } finally { clearTimeout(timeout); }
    },
};
