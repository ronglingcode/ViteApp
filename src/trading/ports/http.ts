/** I/O belongs to adapters; clients and the core do not access browser globals. */
export interface HttpResponse { status: number; body: string }
export interface HttpPort {
    request(url: string, method: string, headers: Record<string, string>, body?: string): Promise<HttpResponse>;
}
