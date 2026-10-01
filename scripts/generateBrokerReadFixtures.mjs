import { readFileSync, writeFileSync } from 'node:fs';
import { SchwabReadApi } from '../src/trading/libraries/broker/schwab/readApi.ts';
import { projectAccount } from '../src/trading/libraries/broker/schwab/accountProjection.ts';
const scenarios = [];
const base = { currentBalances: { liquidationValue: 25000 }, positions: [
    { instrument: { symbol: 'AAPL' }, longQuantity: 100, shortQuantity: 0, averagePrice: 10 },
    { instrument: { symbol: 'TSLA' }, longQuantity: 0, shortQuantity: 50, averagePrice: 20 },
] };
const single = (id, type = 'LIMIT', status = 'WORKING', quantity = 100, opening = true) => ({
    orderId: id, orderType: type, orderStrategyType: 'SINGLE', status, quantity, price: 10, stopPrice: 9,
    orderLegCollection: [{ legId: 1, instrument: { symbol: 'AAPL', assetType: 'EQUITY' }, instruction: opening ? 'BUY' : 'SELL', positionEffect: opening ? 'OPENING' : 'CLOSING', quantity }],
});
const fill = (quantity, price, time = '2026-10-01T13:30:01Z') => ({ activityType: 'EXECUTION', executionType: 'FILL', executionLegs: [{ legId: 1, quantity, price, time }] });
function projection(name, orders, account = base) {
    const fixture = { name, kind: 'projection', args: [account, orders, '2026-10-01'] };
    try { fixture.result = projectAccount(...fixture.args, () => 11); } catch (e) { fixture.error = e.message; }
    scenarios.push(fixture);
}
projection('empty daily orders and signed positions', []);
projection('pending bracket and exit prices', [{ ...single(1), orderStrategyType: 'TRIGGER', cancelable: true, childOrderStrategies: [{ orderId: 2, orderStrategyType: 'OCO', childOrderStrategies: [single(3, 'STOP', 'AWAITING_PARENT_ORDER', 100, false), single(4, 'LIMIT', 'AWAITING_PARENT_ORDER', 100, false)] }] }]);
projection('filled bracket with working exits', [{ ...single(1, 'MARKET', 'FILLED'), orderStrategyType: 'TRIGGER', filledQuantity: 100, orderActivityCollection: [fill(100, 10)], childOrderStrategies: [{ orderId: 2, orderStrategyType: 'OCO', childOrderStrategies: [single(3, 'STOP', 'WORKING', 100, false), single(4, 'LIMIT', 'WORKING', 100, false)] }] }]);
projection('partial canceled replaced fills survive', [
    { ...single(1, 'LIMIT', 'REPLACED'), filledQuantity: 40, orderActivityCollection: [fill(20, 10), fill(20, 12)] },
    { ...single(2, 'LIMIT', 'CANCELED', 100, false), filledQuantity: 10, orderActivityCollection: [fill(10, 11, '2026-10-01T13:31:01Z')] },
]);
projection('partial entry and activated children', [{ ...single(1), orderStrategyType: 'TRIGGER', cancelable: true, filledQuantity: 40, orderActivityCollection: [fill(40, 10)], childOrderStrategies: [{ orderId: 2, orderStrategyType: 'OCO', childOrderStrategies: [single(3, 'STOP', 'WORKING', 40, false), single(4, 'LIMIT', 'WORKING', 40, false)] }] }]);
projection('partially filled exit uses remaining quantity', [{ orderId: 2, orderStrategyType: 'OCO', childOrderStrategies: [single(3, 'STOP', 'WORKING', 100, false), { ...single(4, 'LIMIT', 'PARTIALLY_FILLED', 100, false), filledQuantity: 40, orderActivityCollection: [fill(40, 11)] }] }]);
projection('nested OCO and one surviving stop', [{ orderId: 2, orderStrategyType: 'OCO', childOrderStrategies: [{ orderStrategyType: 'OCO', childOrderStrategies: [single(3, 'STOP', 'WORKING', 20, false), single(4, 'LIMIT', 'CANCELED', 20, false)] }] }]);
projection('out of date and non fill activities ignored', [{ ...single(1, 'MARKET', 'FILLED'), orderActivityCollection: [fill(100, 10, '2026-09-30T13:30:00Z'), { activityType: 'CANCEL', executionType: 'FILL' }, fill(50, 11)] }]);
projection('missing account balance is an error', [], {});
async function read(name, method, args, pages) {
    const requests = [], fixture = { name, kind: 'read', method, args, pages };
    const api = new SchwabReadApi({ request: async (url, method, headers) => {
        const u = new URL(url); requests.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), method, headers });
        const page = pages[requests.length - 1]; if (!page) throw new Error('Unexpected extra read');
        return { status: page.status ?? 200, body: typeof page.body === 'string' ? page.body : JSON.stringify(page.body) };
    } });
    try { fixture.result = await api[method](...args); } catch (e) { fixture.error = e.message; }
    fixture.requests = requests; scenarios.push(fixture);
}
await read('account read', 'getAccount', ['fake-token'], [{ body: [{ securitiesAccount: base }] }]);
await read('bad account array', 'getAccount', ['fake-token'], [{ body: [] }]);
await read('HTTP error is sanitized', 'getAccount', ['fake-token'], [{ status: 401, body: 'sensitive fake-token' }]);
await read('invalid JSON is sanitized', 'getAccount', ['fake-token'], [{ body: 'not JSON' }]);
await read('streamer info', 'getStreamerInfo', ['fake-token'], [{ body: { streamerInfo: [{ streamerSocketUrl: 'wss://test.invalid', schwabClientCustomerId: 'customer', schwabClientCorrelId: 'correl', schwabClientChannel: 'channel', schwabClientFunctionId: 'function' }] } }]);
await read('missing streamer info', 'getStreamerInfo', ['fake-token'], [{ body: {} }]);
await read('daily order read', 'getOrders', ['fake-account', 'fake-token', '2026-10-01'], [{ body: [{ orderId: 1 }, { orderID: 2 }] }]);
await read('orders wrapper', 'getOrders', ['fake-account', 'fake-token', '2026-10-01'], [{ body: { orders: [] } }]);
await read('missing order ID', 'getOrders', ['fake-account', 'fake-token', '2026-10-01'], [{ body: [{}] }]);
await read('invalid order envelope', 'getOrders', ['fake-account', 'fake-token', '2026-10-01'], [{ body: {} }]);
const capped = Array.from({ length: 500 }, (_, orderId) => ({ orderId }));
await read('daily cap subdivides and deduplicates boundaries', 'getOrders', ['fake-account', 'fake-token', '2026-10-01'], [{ body: capped }, ...Array.from({ length: 24 }, (_, hour) => ({ body: [{ orderId: hour % 2 }] }))]);
await read('one minute cap fails explicitly', 'getOrders', ['fake-account', 'fake-token', '2026-10-01'], [{ body: capped }, { body: capped }, { body: capped }, { body: capped }]);
await read('summer open uses five minute windows', 'getOrders', ['fake-account', 'fake-token', '2026-10-01', true], Array.from({ length: 30 }, () => ({ body: [] })));
await read('winter open uses five minute windows', 'getOrders', ['fake-account', 'fake-token', '2026-12-01', true], Array.from({ length: 30 }, () => ({ body: [] })));
const text = JSON.stringify(scenarios, null, 2) + '\n';
for (const url of [new URL('../src/trading/broker-read-fixtures.json', import.meta.url), new URL('../../bookmap-plugin/src/test/resources/broker-read-fixtures.json', import.meta.url)]) {
    if (process.argv.includes('--check')) { if (readFileSync(url, 'utf8') !== text) throw new Error(`Fixture drift: ${url}`); }
    else writeFileSync(url, text);
}
console.log(`Verified ${scenarios.length} Schwab read/projection scenarios through production TS.`);
