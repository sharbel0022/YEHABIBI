import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApiClient } from '../packages/api-client/index.ts';

const catalog = {
  menus: [{ id: 'menu-1', slug: 'mezze', price_ore: 27900 }], dishes: [], campaigns: [],
  delivery_zones: [], settings: { brand_name: 'Cedar Mezze' }, payment_methods: ['card'],
  orders_enabled: true, demo: false,
};
const reference = { code: 'CM-1234567890', token: 'a'.repeat(64) };
const receipt = { ...reference, tracking_url: 'https://catering.example/order/CM-1234567890' };
const status = { order: {
  code: reference.code, status: 'new', payment_status: 'unpaid', total_ore: 279000,
  checkout_url: null, items: [],
} };
const json = (value, init) => Response.json(value, init);

test('V4.2 API: webb och mobil läser samma katalog och uppdaterade adminpriser utan cache', async () => {
  const calls = [];
  let current = structuredClone(catalog);
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return json(current);
  };
  const web = createApiClient({ fetch });
  const mobile = createApiClient({ baseUrl: 'https://catering.example/', requireBaseUrl: true, fetch });
  assert.deepEqual(await web.getCatalog(), await mobile.getCatalog());
  current.menus[0].price_ore = 29900;
  assert.equal((await mobile.getMenu('mezze')).price_ore, 29900);
  assert.equal((await web.getMenu('menu-1')).price_ore, 29900);
  assert.equal(await web.getMenu('avpublicerad'), null);
  assert.deepEqual(await mobile.getSettings(), current.settings);
  assert.equal(calls[0].url, '/api/catalog');
  assert.equal(calls[1].url, 'https://catering.example/api/catalog');
  assert.ok(calls.every(({ init }) => init.cache === 'no-store'));
});

test('V4.2 API: samma orderformat och återförsöksnyckel skickas oförändrade från båda plattformar', async () => {
  const bodies = [];
  const fetch = async (url, init) => {
    assert.match(url, /\/api\/orders$/);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], 'application/json');
    bodies.push(JSON.parse(init.body));
    return json(receipt, { status: bodies.length === 1 ? 201 : 200 });
  };
  const input = {
    request_id: '4b825cb6-6f82-44df-867e-1732436fbcbd', menu_id: 'menu-1', guests: 10,
    occasion: 'fest', event_date: '2026-12-10', event_time: '18:00', fulfillment: 'pickup',
    address: '', postal_code: '', city: '', full_name: 'Test Kund', email: 'test@example.se',
    phone: '0701234567', notes: '', payment_preference: 'card', terms_accepted: true,
  };
  const web = createApiClient({ fetch });
  const mobile = createApiClient({ baseUrl: 'https://catering.example', fetch });
  assert.deepEqual(await web.createOrder(input), receipt);
  assert.deepEqual(await mobile.createOrder(input), receipt);
  assert.deepEqual(bodies, [input, input]);
});

test('V4.2 API: orderstatus och prisacceptans använder privat referens och rätt revision', async () => {
  const calls = [];
  const client = createApiClient({ fetch: async (url, init) => {
    calls.push({ url, init });
    if (init.body && JSON.parse(init.body).action === 'register_push') return json({ registered: true });
    return json(status);
  } });
  assert.deepEqual(await client.getOrderStatus(reference), status);
  assert.deepEqual(await client.acceptPriceChange(reference, 3), status);
  assert.deepEqual(await client.registerOrderPush(reference, 'ExpoPushToken[example_token]'), { registered: true });
  assert.equal(calls[0].url, `/api/orders/${reference.code}?token=${reference.token}`);
  assert.deepEqual(JSON.parse(calls[1].init.body), { action: 'accept_changes', revision: 3 });
  assert.equal(calls[1].init.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[2].init.body), { action: 'register_push', push_token: 'ExpoPushToken[example_token]' });
  assert.equal(status.order.payment_status, 'unpaid');
});

test('V4.2 API: privata referenser URL-kodas utan att skapa extra sökparametrar', async () => {
  let requested;
  const client = createApiClient({ fetch: async url => { requested = url; return json(status); } });
  await client.getOrderStatus({ code: 'CM/test?', token: 'private&action=paid' });
  assert.equal(requested, '/api/orders/CM%2Ftest%3F?token=private%26action%3Dpaid');
});

test('V4.2 API: serverns konflikt och begripligt fel behålls vid ny prisrevision', async () => {
  const client = createApiClient({ fetch: async () => json({ error: 'Förslaget har ändrats. Uppdatera sidan.' }, { status: 409 }) });
  await assert.rejects(client.acceptPriceChange(reference, 2), error =>
    error instanceof ApiError && error.kind === 'http' && error.status === 409 && /Förslaget har ändrats/.test(error.message));
});

test('V4.2 API: nätverksfel, ogiltig JSON och felaktiga kontrakt ger tydliga fel', async () => {
  const offline = createApiClient({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(offline.getCatalog(), error => error.kind === 'network' && /anslutning/.test(error.message));
  const html = createApiClient({ fetch: async () => new Response('<html>Gateway error</html>') });
  await assert.rejects(html.getCatalog(), error => error.kind === 'response' && /giltiga uppgifter/.test(error.message));
  const wrong = createApiClient({ fetch: async () => json({ menus: [] }) });
  await assert.rejects(wrong.getCatalog(), error => error.kind === 'response');
  await assert.rejects(wrong.createOrder({}), error => error.kind === 'response');
  await assert.rejects(wrong.getOrderStatus(reference), error => error.kind === 'response');
  const unavailable = createApiClient({ fetch: async () => new Response('Unavailable', { status: 503 }) });
  await assert.rejects(unavailable.getCatalog(), error => error.kind === 'http' && error.status === 503);
});

const waitForAbort = async (_, { signal }) => new Promise((resolve, reject) => {
  const abort = () => reject(new DOMException('Aborted', 'AbortError'));
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
});

test('V4.2 API: långsamma anrop avbryts och kan återförsökas', async () => {
  let attempts = 0;
  const client = createApiClient({ timeoutMs: 10, fetch: async (...args) => {
    if (++attempts === 1) return waitForAbort(...args);
    return json(catalog);
  } });
  await assert.rejects(client.getCatalog(), error => error.kind === 'timeout' && /inte i tid/.test(error.message));
  assert.deepEqual(await client.getCatalog(), catalog);
});

test('V4.2 API: timeout omfattar även läsningen av svarets innehåll', async () => {
  const client = createApiClient({ timeoutMs: 10, fetch: async (url, init) => ({
    ok: true, status: 200, json: () => waitForAbort(url, init),
  }) });
  await assert.rejects(client.getCatalog(), error => error.kind === 'timeout');
});

test('V4.2 API: användarens avbrott skiljs från timeout och förstör inte nästa hämtning', async () => {
  const controller = new AbortController();
  const client = createApiClient({ fetch: waitForAbort });
  const pending = client.getCatalog({ signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error.kind === 'aborted');
  await assert.rejects(client.getCatalog({ signal: controller.signal }), error => error.kind === 'aborted');
});

test('V4.2 API: Expo kräver basadress; HTTP tillåts uttryckligen endast i utveckling', async () => {
  const fetch = async () => json(catalog);
  for (const options of [
    { requireBaseUrl: true }, { baseUrl: 'inte-en-url' }, { baseUrl: 'http://localhost:3000' },
    { baseUrl: 'https://user:password@example.se' }, { baseUrl: 'https://example.se?secret=value' },
    { baseUrl: 'https://example.se#fragment' }, { timeoutMs: 0 },
  ]) {
    await assert.rejects(createApiClient({ ...options, fetch }).getCatalog(), error => error.kind === 'configuration');
  }
  assert.deepEqual(await createApiClient({ baseUrl: 'http://localhost:3000', allowHttp: true, fetch }).getCatalog(), catalog);
});
