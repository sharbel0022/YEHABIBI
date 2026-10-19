import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileOnlinePaymentMethods } from '../apps/mobile/lib/payment-methods.ts';

const catalog = { demo: false, payment_methods: ['swish', 'card', 'apple_pay', 'google_pay'], direct_payment_methods: ['cash'] };
test('mobile hosted flow requires actual wallet capability rather than assuming an OS proves it', () => {
  assert.deepEqual(mobileOnlinePaymentMethods(catalog), ['swish', 'card']);
  assert.deepEqual(mobileOnlinePaymentMethods(catalog, 'direct'), []);
  assert.deepEqual(mobileOnlinePaymentMethods({ ...catalog, direct_payment_methods: undefined }, 'direct'), []);
});
test('only verified simulator offers simulated wallets and direct methods stay separately authorized', () => {
  const simulation = { ...catalog, test_mode: true, direct_payment_methods: catalog.payment_methods };
  assert.deepEqual(mobileOnlinePaymentMethods(simulation), catalog.payment_methods);
  assert.deepEqual(mobileOnlinePaymentMethods(simulation, 'direct'), catalog.payment_methods);
  assert.deepEqual(mobileOnlinePaymentMethods({ ...simulation, demo: true }), []);
});
