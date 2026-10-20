import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../packages/api-client/index.ts';
import { safePaymentUrl } from '../packages/shared/pricing/index.ts';
import { createRemoteTestFetch, remoteTestConfiguration, remoteTestStorageKey } from '../apps/mobile/lib/remote-test.ts';

const origin = 'https://development.example-tailnet.ts.net:8443';
const token = 'a'.repeat(43);
const configuration = remoteTestConfiguration({ requested: true, development: true, environment: 'test', apiUrl: origin });
const catalog = { dishes: [], menus: [], campaigns: [], delivery_zones: [], payment_methods: ['card'], settings: {}, demo: false, orders_enabled: true, test_mode: true };
const reference = { code: 'CM-TEST', token: 'b'.repeat(64) };
const order = { code: reference.code, status: 'approved', payment_status: 'pending', total_ore: 12300, items: [] };
const simulatorPath = '/__test/payment/lt_' + 'c'.repeat(64);

test('fjärrmobil: explicit utvecklingsläge, APP_ENV=test och exakt privat HTTPS-origin krävs', () => {
  assert.equal(configuration.enabled, true);
  for (const override of [
    { development: false }, { environment: 'production' }, { environment: 'preview' },
    { apiUrl: 'http://development.example-tailnet.ts.net' }, { apiUrl: 'https://public.example' },
    { apiUrl: `${origin}/api` }, { apiUrl: `${origin}?token=secret` },
    { apiUrl: 'https://development.example-tailnet.ts.net.attacker.example' },
    { apiUrl: 'https://secret@development.example-tailnet.ts.net' },
  ]) {
    const result = remoteTestConfiguration({ requested: true, development: true, environment: 'test', apiUrl: origin, ...override });
    assert.equal(result.enabled, false); assert.ok(result.error);
  }
  assert.equal(remoteTestConfiguration({ requested: false, development: false, environment: 'production', apiUrl: 'https://public.example' }).error, '');
});

test('fjärrmobil: sessionsnyckeln skickas på samtliga API-anrop och lämnar aldrig godkänd origin', async () => {
  let count = 0;
  const transport = createRemoteTestFetch({ configuration, credential: () => token, onUnauthorized() {}, fetch: async (url, init) => {
    count++;
    assert.equal(new Headers(init.headers).get('X-Yehabibi-Remote-Token'), token);
    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    if (url.endsWith('/api/catalog')) return Response.json(catalog);
    if (url.includes('/api/payments/create')) return Response.json({ checkout_url: simulatorPath, payment_status: 'pending', test_mode: true });
    if (init.method === 'PATCH' && JSON.parse(init.body).action === 'register_push') return Response.json({ registered: true });
    if (url.endsWith('/api/orders') && init.method === 'POST') return Response.json({ ...reference, tracking_url: `${origin}/order/${reference.code}` });
    return Response.json({ order });
  } });
  const client = createApiClient({ baseUrl: origin, allowPrivateRemoteTest: true, fetch: transport });
  await client.getCatalog(); await client.createOrder({ request_id: 'synthetic-test' });
  await client.getOrderStatus(reference); await client.getPaymentStatus(reference);
  await client.acceptPriceChange(reference, 1); await client.registerOrderPush(reference, 'ExpoPushToken[synthetic]');
  assert.equal((await client.createPayment(reference, 'card')).checkout_url, `${origin}${simulatorPath}`);
  assert.equal(count, 7);
  for (const url of ['https://attacker.example/api/orders', `${origin}/__test/payment/anything`, `${origin.replace('https://', 'https://credential@')}/api/catalog`]) {
    await assert.rejects(transport(url), /godkända privata/);
  }
  assert.equal(count, 7);
});

test('fjärrmobil: felaktig eller saknad nyckel blockeras innan nätverket; avvisad nyckel låser appen', async () => {
  let calls = 0, locks = 0;
  const missing = createRemoteTestFetch({ configuration, credential: () => '', onUnauthorized() {}, fetch: async () => { calls++; return Response.json({}); } });
  await assert.rejects(missing(`${origin}/api/catalog`), /sessionsnyckeln/);
  assert.equal(calls, 0);
  for (const status of [401, 403]) {
    const rejected = createRemoteTestFetch({ configuration, credential: () => token, onUnauthorized() { locks++; }, fetch: async () => new Response('', { status }) });
    await assert.rejects(rejected(`${origin}/api/catalog`), error => error.status === status && /låst/.test(error.message));
  }
  assert.equal(locks, 2);
});

test('fjärrmobil: vanliga produktionsanrop får ingen sparad fjärrtestnyckel', async () => {
  let incoming;
  const disabled = remoteTestConfiguration({ requested: false, development: false, environment: 'production', apiUrl: 'https://public.example' });
  const transport = createRemoteTestFetch({ configuration: disabled, credential: () => token, onUnauthorized() {}, fetch: async (_url, init) => { incoming = init; return Response.json(catalog); } });
  await transport('https://public.example/api/catalog', { headers: { Accept: 'application/json' } });
  assert.equal(new Headers(incoming.headers).get('X-Yehabibi-Remote-Token'), null);
});

test('fjärrmobil: privata minnen isoleras från produktion och andra privata testbackender', () => {
  for (const key of ['cedar-mezze-orders-v1', 'cedar-mezze-selection-v4', 'cedar-mezze-request-v1', 'cedar-mezze-remote-session-v442']) {
    const first = remoteTestStorageKey(key, origin), second = remoteTestStorageKey(key, 'https://other.example-tailnet.ts.net:8443');
    assert.notEqual(first, key); assert.notEqual(first, second);
    assert.match(first, /^[A-Za-z0-9._-]+$/);
  }
});

test('fjärrmobil: produktionskatalog och betalning utan verifierad testkatalog blockeras', async () => {
  const client = createApiClient({ baseUrl: origin, allowPrivateRemoteTest: true, fetch: async () => Response.json({ ...catalog, test_mode: false }) });
  await assert.rejects(client.getCatalog(), /isolerat testläge/);
  await assert.rejects(client.createPayment(reference, 'card'), /verifiera testmenyn/);
});

test('fjärrmobil: gamla localhost-spärren består, privat simulator kräver separat opt-in och exakt sessionväg', () => {
  assert.equal(safePaymentUrl(simulatorPath, origin, true), null);
  assert.equal(safePaymentUrl(simulatorPath, origin, true, true), `${origin}${simulatorPath}`);
  for (const url of [`${origin}/admin`, `${origin}${simulatorPath}?token=secret`, `${origin}${simulatorPath}#fragment`, `https://other.example-tailnet.ts.net:8443${simulatorPath}`, `https://attacker.example${simulatorPath}`]) {
    assert.equal(safePaymentUrl(url, origin, true, true), null);
  }
  assert.equal(safePaymentUrl(simulatorPath, 'https://public.example', true, true), null);
  assert.equal(safePaymentUrl(simulatorPath, 'http://127.0.0.1:3000', true), `http://127.0.0.1:3000${simulatorPath}`);
});

test('fjärrmobil: anslutningsfel förklarar Tailscale och nästa anrop återhämtar sig', async () => {
  let available = false;
  const transport = createRemoteTestFetch({ configuration, credential: () => token, onUnauthorized() {}, fetch: async () => {
    if (!available) throw new TypeError('network unavailable');
    return Response.json(catalog);
  } });
  const client = createApiClient({ baseUrl: origin, allowPrivateRemoteTest: true, fetch: transport });
  await assert.rejects(client.getCatalog(), error => error.kind === 'network' && /Tailscale/.test(error.message));
  available = true;
  assert.equal((await client.getCatalog()).test_mode, true);
});
