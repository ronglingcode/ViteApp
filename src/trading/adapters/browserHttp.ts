import type { HttpPort } from '../ports/http.ts';

export const browserHttp: HttpPort = {
    async request(url, method, headers, body) {
        const response = await fetch(url, { method, headers, body });
        return { status: response.status, body: await response.text() };
    },
};
