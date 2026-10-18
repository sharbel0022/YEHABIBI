import test from 'node:test';
import assert from 'node:assert/strict';
import { directOrderStatus, directReorderDraft } from '../packages/shared/scheduling/index.ts';
import { canPayOrder } from '../packages/shared/ordering/index.ts';

const order = { order_type: 'direct', status: 'approved', payment_preference: 'swish', payment_status: 'unpaid', capacity_status: 'held',
  items: [{ menu_id: '66666666-6666-4666-8666-666666666666', dish_id: null, quantity: 2, unit_price_ore: 12900, total_ore: 25800 },
    { menu_id: null, dish_id: '44444444-4444-4444-8444-000000000001', quantity: 3, unit_price_ore: 2500, total_ore: 7500 }], fulfillment: 'pickup' };

test('direktkund: intern acceptans och reserverad tid är inte en kundbekräftelse', () => {
  assert.equal(directOrderStatus(order).confirmed, false);
  assert.equal(directOrderStatus(order).progress, 0);
  assert.match(directOrderStatus(order).label, /betalningen/);
  assert.equal(directOrderStatus({ ...order, payment_status: 'paid' }).confirmed, false);
  assert.equal(directOrderStatus({ ...order, capacity_status: 'confirmed' }).confirmed, false);
  assert.equal(directOrderStatus({ ...order, capacity_status: null, payment_status: 'paid' }).confirmed, false);
});

test('direktkund: verifierad betalning och kapacitet följer kökets fyra tydliga steg', () => {
  const paid = { ...order, capacity_status: 'confirmed', payment_status: 'paid' };
  for (const [status, label, progress] of [['approved', 'Bekräftad', 1], ['preparing', 'Tillagas', 2], ['ready', 'Klar för hämtning', 3], ['completed', 'Slutförd', 4]]) {
    assert.deepEqual([directOrderStatus({ ...paid, status }).label, directOrderStatus({ ...paid, status }).progress], [label, progress]);
  }
  assert.equal(directOrderStatus({ ...paid, status: 'dispatched', fulfillment: 'delivery' }).label, 'På väg');
});

test('direktkund: sen verifierad betalning utan kapacitet lovar ingen tid', () => {
  for (const capacity_status of ['review', 'released']) {
    const status = directOrderStatus({ ...order, payment_status: 'paid', capacity_status, payment_review_required: true, payment_review_reason: 'capacity_unavailable_after_payment' });
    assert.equal(status.confirmed, false); assert.equal(status.progress, 0);
    assert.match(status.detail, /ny tid eller återbetalning/);
  }
  assert.equal(directOrderStatus({ ...order, payment_status: 'refunded', capacity_status: 'released' }).label, 'Återbetald');
});

test('direktkund: kontantregeln kräver serverbekräftad kapacitet och påstår inte betald', () => {
  assert.equal(directOrderStatus({ ...order, payment_preference: 'cash' }).confirmed, false);
  const cash = directOrderStatus({ ...order, payment_preference: 'cash', capacity_status: 'confirmed' });
  assert.equal(cash.confirmed, true); assert.match(cash.detail, /Betala kontant/);
});

test('direktkund: en obetald utgången reservation erbjuder inget gammalt betalningsförsök', () => {
  const expired = { ...order, capacity_status: 'released' };
  assert.equal(canPayOrder(expired), false);
  assert.match(directOrderStatus(expired).detail, /Starta en ny beställning/);
  assert.equal(canPayOrder({ ...expired, payment_status: 'failed' }), true);
  assert.match(directOrderStatus({ ...expired, payment_status: 'failed' }).detail, /återförsök/);
});

test('återbeställning kopierar endast matreferenser och antal från avslutad direktorder', () => {
  const previous = { ...order, status: 'completed', scheduled_at: '2026-10-25T01:30:00Z', payment_status: 'paid', total_ore: 33300,
    token: 'private', checkout_url: 'https://example.test/pay', campaign_id: 'old-campaign', hold_expires_at: 'old-hold', full_name: 'Tidigare kund' };
  assert.deepEqual(directReorderDraft(previous), { menu_id: order.items[0].menu_id, quantity: 2, addons: [{ dish_id: order.items[1].dish_id, quantity: 3 }] });
  assert.equal(directReorderDraft(order), null);
  assert.equal(directReorderDraft({ ...previous, order_type: 'catering' }), null);
  assert.equal(directReorderDraft({ ...previous, items: [] }), null);
  assert.equal(directReorderDraft({ ...previous, items: [...order.items, order.items[0]] }), null);
  assert.equal(directReorderDraft({ ...previous, items: [{ ...order.items[0], quantity: 101 }] }), null);
});
