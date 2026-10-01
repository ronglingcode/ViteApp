export interface StreamerInfo {
    streamerSocketUrl: string; schwabClientCustomerId: string; schwabClientCorrelId: string;
    schwabClientChannel: string; schwabClientFunctionId: string;
}
export interface Quote { symbol: string; bidPrice?: number; askPrice?: number; bidSize?: number; askSize?: number }
function request(info: StreamerInfo, service: string, requestid: string, command: string, parameters: Record<string, string>) {
    return { service, requestid, command, SchwabClientCustomerId: info.schwabClientCustomerId, SchwabClientCorrelId: info.schwabClientCorrelId, parameters };
}
export function loginRequest(info: StreamerInfo, token: string) {
    return request(info, 'ADMIN', '1', 'LOGIN', { Authorization: token, SchwabClientChannel: info.schwabClientChannel, SchwabClientFunctionId: info.schwabClientFunctionId });
}
export function quoteSubscribeRequest(info: StreamerInfo, symbols: string[]) {
    return request(info, 'LEVELONE_EQUITIES', '2', 'SUBS', { keys: symbols.join(','), fields: '0,1,2,4,5' });
}
export function activitySubscribeRequest(info: StreamerInfo) {
    return request(info, 'ACCT_ACTIVITY', '3', 'SUBS', { keys: 'Account Activity', fields: '0,1,2,3' });
}
export function mapQuote(value: Record<string, any>): Quote {
    const quote: Quote = { symbol: value.key };
    for (const [field, name] of [['1', 'bidPrice'], ['2', 'askPrice'], ['4', 'bidSize'], ['5', 'askSize']] as const)
        if (typeof value[field] === 'number' && Number.isFinite(value[field])) quote[name] = value[field];
    return quote;
}
export function parseStreamMessage(value: Record<string, any>) {
    let login: 'success' | 'failed' | undefined;
    const quotes: Quote[] = [], activities: Record<string, any>[] = [];
    for (const response of value.response ?? []) if (response.service === 'ADMIN' && response.command === 'LOGIN')
        login = response.content?.code === 0 ? 'success' : 'failed';
    for (const data of value.data ?? []) {
        if (data.service === 'LEVELONE_EQUITIES') for (const content of data.content ?? []) if (typeof content.key === 'string') quotes.push(mapQuote(content));
        if (data.service === 'ACCT_ACTIVITY') activities.push(...(data.content ?? []));
    }
    return { ...(login ? { login } : {}), quotes, activities };
}
