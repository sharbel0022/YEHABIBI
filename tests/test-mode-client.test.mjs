import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../packages/api-client/index.ts';
import {
  calcDishTotal, localApiStorageKey, onlinePaymentMethods, paymentMethodLabel, previewCatalog, safePaymentUrl, testModeBanner,
} from '../packages/shared/index.ts';

const reference = { code: 'CM-1234567890', token: 'a'.repeat(64) };
const session = { checkout_url: '/__test/payment/opaque-simulation-id', payment_status: 'pending', test_mode: true };
const catalog = { ...previewCatalog, demo: false, orders_enabled: true, test_mode: true,
  payment_methods: ['swish', 'apple_pay', 'google_pay', 'card'] };

test('testklient: lokal HTTP kräver verifierad katalog, simulationssvar och exakt privat origin', async () => {
  const client = createApiClient({ baseUrl: 'http://10.0.2.2:3300', allowHttp: true,
    fetch: async url => Response.json(url.endsWith('/api/catalog') ? catalog : session) });
  await assert.rejects(client.createPayment(reference, 'swish'), error => error.kind === 'response');
  await client.getCatalog();
  assert.equal((await client.createPayment(reference, 'swish')).checkout_url,
    'http://10.0.2.2:3300/__test/payment/opaque-simulation-id');
  for (const url of ['http://127.0.0.1:3300/payment', 'http://10.0.2.2:3301/payment',
    'https://payment.example/pay', '//payment.example/pay', 'javascript:alert(1)',
    'http://user:password@10.0.2.2:3300/payment']) {
    assert.equal(safePaymentUrl(url, 'http://10.0.2.2:3300', true), null, url);
  }
  assert.equal(safePaymentUrl('/simulation', 'http://10.attacker.example:3300', true), null);
  assert.equal(safePaymentUrl('/simulation', 'http://payment.example:3300', true), null);
});

test('testklient: publika flaggor eller ensamt serversvar kan inte öppna simulering', async () => {
  for (const serverCatalog of [previewCatalog, { ...catalog, test_mode: false }]) {
    const client = createApiClient({ baseUrl: 'http://localhost:3300', allowHttp: true, testMode: true,
      fetch: async url => Response.json(url.endsWith('/api/catalog') ? serverCatalog : session) });
    await client.getCatalog();
    await assert.rejects(client.createPayment(reference, 'card'), error => error.kind === 'response');
  }
  const withoutResponseFlag = createApiClient({ baseUrl: 'http://localhost:3300', allowHttp: true,
    fetch: async url => Response.json(url.endsWith('/api/catalog') ? catalog : { ...session, test_mode: false }) });
  await withoutResponseFlag.getCatalog();
  await assert.rejects(withoutResponseFlag.createPayment(reference, 'card'), error => error.kind === 'response');
  assert.equal(safePaymentUrl('http://localhost:3300/pay', 'http://localhost:3300', false), null);
});

test('testklient: nätverksfel spärrar nya simulationssessioner tills servern verifierats igen', async () => {
  let offline = false;
  const client = createApiClient({ baseUrl: 'http://localhost:3300', allowHttp: true,
    fetch: async url => {
      if (url.endsWith('/api/catalog')) {
        if (offline) throw new TypeError('offline');
        return Response.json(catalog);
      }
      return Response.json(session);
    } });
  await client.getCatalog();
  assert.ok((await client.createPayment(reference, 'swish')).test_mode);
  offline = true;
  await assert.rejects(client.getCatalog());
  await assert.rejects(client.createPayment(reference, 'swish'), error => error.kind === 'response');
  offline = false;
  await client.getCatalog();
  assert.ok((await client.createPayment(reference, 'swish')).test_mode);
});

test('testklient: verkliga plånboksspärrar bevaras och simulationer märks tydligt', () => {
  const wallets = { applePay: false, googlePay: false };
  assert.deepEqual(onlinePaymentMethods(catalog.payment_methods, wallets), ['swish', 'card']);
  assert.deepEqual(onlinePaymentMethods(catalog.payment_methods, wallets, true), catalog.payment_methods);
  assert.equal(paymentMethodLabel('apple_pay', true), 'Simulerad Apple Pay');
  assert.equal(paymentMethodLabel('google_pay', false), 'Google Pay');
  assert.equal(testModeBanner, 'TESTLÄGE – INGA RIKTIGA BESTÄLLNINGAR');
});

test('testklient: fem personer, tolv ostrullar och två hummusfat ger 480 kr vid hämtning', () => {
  const quote = calcDishTotal([{ dish_id: 'rolls', quantity: 12 }, { dish_id: 'hummus', quantity: 2 }], [
    { id: 'rolls', title: 'Ostrullar', active: true, price_ore: 2500 },
    { id: 'hummus', title: 'Hummusfat', active: true, price_ore: 9000 },
  ], 5, 'pickup', 0);
  assert.equal(quote.subtotal_ore, 48000);
  assert.equal(quote.delivery_fee_ore, 0);
  assert.equal(quote.total_ore, 48000);
});

test('testklient: lokala API-origin delar aldrig privata referenser, utkast eller återförsöks-ID', () => {
  for (const key of ['cedar-mezze-orders-v1', 'cedar-mezze-selection-v4', 'cedar-mezze-request-v1']) {
    const existingProductionStorage = new Map([[key, 'synthetic-private-production-value']]);
    assert.equal(localApiStorageKey(key, 'https://catering.example'), key);
    const localKeys = ['http://127.0.0.1:3000', 'http://127.0.0.1:3300', 'http://10.0.2.2:3300']
      .map(origin => localApiStorageKey(key, origin));
    assert.equal(new Set(localKeys).size, 3);
    for (const localKey of localKeys) {
      assert.equal(existingProductionStorage.get(localKey), undefined);
      assert.match(localKey, /^[A-Za-z0-9._-]+$/, 'SecureStore tillåter endast säkra nyckeltecken');
    }
    existingProductionStorage.set(localKeys[0], 'synthetic-private-local-reference');
    assert.equal(existingProductionStorage.get(localKeys[1]), undefined);
    assert.equal(existingProductionStorage.get(localKeys[2]), undefined);
    assert.equal(existingProductionStorage.get(key), 'synthetic-private-production-value');
  }
});
