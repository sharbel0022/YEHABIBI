import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../packages/api-client/index.ts';
import {
  availablePaymentMethods, canOfferDelivery, canPayOrder, onlinePaymentMethods, orderPaymentMethods,
  previewSettings, safeExternalUrl, settingsSchema,
} from '../packages/shared/index.ts';

const reference = { code: 'CM/43?', token: 'private&payment=paid' };
const order = { code: reference.code, status: 'approved', payment_status: 'unpaid',
  payment_preference: 'unpaid', total_ore: 150000, checkout_url: null, proposal: null, items: [] };

test('V4.3 samma betalningskontrakt används av webb och Expo utan klientbelopp', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json({ checkout_url: 'https://checkoutshopper-test.adyen.com/pay/session', payment_status: 'pending' });
  };
  const web = createApiClient({ fetch });
  const mobile = createApiClient({ baseUrl: 'https://catering.example', fetch });
  for (const method of ['swish', 'card', 'apple_pay', 'google_pay']) {
    await web.createPayment(reference, method);
    await mobile.createPayment(reference, method);
  }
  assert.equal(calls[0].url, '/api/payments/create');
  assert.equal(calls[1].url, 'https://catering.example/api/payments/create');
  assert.ok(calls.every(({ init }) => init.method === 'POST' && init.cache === 'no-store'));
  assert.deepEqual(JSON.parse(calls[0].init.body), { ...reference, payment_method: 'swish' });
  assert.ok(calls.every(({ init }) => !('amount_ore' in JSON.parse(init.body))));
});

test('V4.3 osäkra och ogiltiga betalningslänkar stoppas före browser/appöppning', async () => {
  for (const checkout_url of ['http://payment.example/session', 'javascript:alert(1)',
    'https://username:password@payment.example/session', 'not-a-url', null]) {
    const client = createApiClient({ fetch: async () => Response.json({ checkout_url, payment_status: 'pending' }) });
    await assert.rejects(client.createPayment(reference, 'card'), error => error.kind === 'response');
    assert.equal(safeExternalUrl(checkout_url), null);
  }
  const invalidStatus = createApiClient({ fetch: async () => Response.json({
    checkout_url: 'https://payment.example/session', payment_status: 'client_confirmed',
  }) });
  await assert.rejects(invalidStatus.createPayment(reference, 'card'), error => error.kind === 'response');
});

test('V4.3 status hämtas separat från backend med privat URL-kodad referens', async () => {
  let requested;
  const client = createApiClient({ fetch: async url => { requested = url; return Response.json({ order }); } });
  assert.deepEqual(await client.getPaymentStatus(reference), { order });
  assert.equal(requested, '/api/payments/status?code=CM%2F43%3F&token=private%26payment%3Dpaid');
  // En öppnad betalningssida ändrar inte den hämtade orderns status.
  assert.equal(order.payment_status, 'unpaid');
});

test('V4.3 obetald förfrågan kräver uttrycklig inställning och kontant kräver hämtning', () => {
  const catalog = { settings: { ...previewSettings, cash_enabled: true }, payment_methods: ['cash', 'unpaid'],
    delivery_zones: [{ active: true }] };
  assert.deepEqual(availablePaymentMethods(catalog, 'pickup'), ['cash']);
  assert.deepEqual(availablePaymentMethods(catalog, 'delivery'), []);
  assert.equal(canOfferDelivery(catalog), false);
  catalog.settings.allow_unpaid_requests = true;
  assert.deepEqual(availablePaymentMethods(catalog, 'delivery'), ['unpaid']);
  assert.equal(canOfferDelivery(catalog), true);
  const { allow_unpaid_requests, ...legacySettings } = previewSettings;
  assert.equal(settingsSchema.parse(legacySettings).allow_unpaid_requests, false);
});

test('V4.3 plånböcker visas bara när både backend och enheten stöder metoden', () => {
  const methods = ['cash', 'unpaid', 'card', 'swish', 'apple_pay', 'google_pay'];
  assert.deepEqual(onlinePaymentMethods(methods, { applePay: false, googlePay: false }), ['card', 'swish']);
  assert.deepEqual(onlinePaymentMethods(methods, { applePay: true, googlePay: false }), ['card', 'swish', 'apple_pay']);
  assert.deepEqual(onlinePaymentMethods(methods, { applePay: false, googlePay: true }), ['card', 'swish', 'google_pay']);
  assert.deepEqual(onlinePaymentMethods([], { applePay: true, googlePay: true }), []);
});

test('V4.3 betalning öppnas efter godkännande och uttrycklig prisacceptans; utredning stoppar nya försök', () => {
  assert.equal(canPayOrder(order), true);
  for (const change of [
    { status: 'new' }, { status: 'changes_requested' }, { status: 'cancelled' },
    { payment_preference: 'cash' }, { payment_status: 'paid' }, { payment_status: 'refunded' },
    { proposal: { revision: 2 } }, { payment_review_required: true },
  ]) assert.equal(canPayOrder({ ...order, ...change }), false, JSON.stringify(change));
  assert.equal(canPayOrder({ ...order, payment_status: 'failed' }), true);
});

test('V4.3 ett påbörjat betalningsförsök kan bara återupptas med samma metod', () => {
  const methods = ['swish', 'card', 'google_pay'];
  assert.deepEqual(orderPaymentMethods(methods, {}), methods);
  assert.deepEqual(orderPaymentMethods(methods, { payment_provider: 'adyen', payment_method: 'swish' }), ['swish']);
  assert.deepEqual(orderPaymentMethods(['card'], { payment_provider: 'adyen', payment_method: 'google_pay' }), []);
});
