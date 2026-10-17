import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availablePaymentMethods, buildOrderPayload, canOfferDelivery, canPayOrder, categoryLabels,
  designColors, findDeliveryZone, formatSek, itemsFromQuantities, minimumGuestsFor, newOrderSchema,
  orderContactError, orderDetailsError, orderLimits, orderProgress, orderSteps, orderTimelineLabels,
  parseSelectionDraft, previewCatalog, previewDishes, previewItems, previewMenus, quoteSelection,
  reconcileSelection, suggestedQuantity,
} from '../packages/shared/index.ts';

const dishId = '44444444-4444-4444-8444-000000000001';
const secondDishId = '44444444-4444-4444-8444-000000000002';
const menuId = '11111111-1111-4111-8111-111111111111';
const zoneId = '55555555-5555-4555-8555-555555555555';
const catalog = {
  ...previewCatalog, demo: false, orders_enabled: true,
  settings: { ...previewCatalog.settings, cash_enabled: true, custom_min_people: 5 },
  dishes: [
    { ...previewDishes[0], id: dishId, price_ore: 2500, suggested_per_person: 2 },
    { ...previewDishes[1], id: secondDishId, price_ore: 9000, suggested_per_person: 0.3 },
  ],
  menus: [{ ...previewMenus[0], id: menuId, price_ore: 27900, min_people: 10 }],
  delivery_zones: [{ id: zoneId, name: 'Västerås', postal_prefixes: ['722'], fee_ore: 9900, active: true }],
  payment_methods: ['card', 'swish', 'cash'],
};
const selection = { menuId: null, quantities: { [dishId]: 12, [secondDishId]: 2 }, guests: 5, occasion: 'hemma' };
const contact = {
  event_date: '2026-10-20', event_time: '12:30', fulfillment: 'delivery',
  address: 'Testgatan 1', postal_code: '722 12', city: 'Västerås',
  full_name: 'Test Kund', email: 'kund@example.se', phone: '0701234567', notes: '',
  payment_preference: 'card', terms_accepted: true, delivery_zone_id: zoneId,
};
const now = new Date('2026-10-17T10:00:00Z');

test('V4.2: webb och mobil har en gemensam demo utan säljbara exempelpriser', () => {
  assert.equal(previewCatalog.menus, previewMenus);
  assert.equal(previewCatalog.dishes, previewDishes);
  assert.equal(previewCatalog.orders_enabled, false);
  assert.equal(previewCatalog.demo, true);
  assert.deepEqual(previewCatalog.payment_methods, []);
  assert.ok(previewCatalog.menus.every(menu => menu.price_ore === 0));
  assert.ok(previewCatalog.dishes.every(dish => dish.price_ore === 0));
  assert.deepEqual(previewItems.map(item => item.id), previewDishes.map(dish => dish.id));
  assert.ok(previewItems.every(item => item.unit_price_ore === 0));
});

test('V4.2: portionsförslag avrundas likadant och begränsas till beställningsbara mängder', () => {
  assert.equal(suggestedQuantity(5, 0.3), 2);
  assert.equal(suggestedQuantity(100, 0.07), 7);
  assert.equal(suggestedQuantity(11, 0.1), 2);
  assert.equal(suggestedQuantity(1000, 20), orderLimits.maxQuantity);
  for (const value of [undefined, 0, -1, NaN, Infinity]) assert.equal(suggestedQuantity(5, value), 0);
  for (const guests of [0, -1, 1.2, 1001, Infinity]) assert.equal(suggestedQuantity(guests, 2), 0);
});

test('V4.2: samma matval ger samma styckpris, paketpris, minimiantal och leverans', () => {
  const quote = quoteSelection(catalog, selection, 'delivery', 9900);
  assert.equal(quote.subtotal_ore, 48000);
  assert.equal(quote.total_ore, 57900);
  assert.equal(quote.price_per_person_ore, 11580);
  assert.equal(quoteSelection(catalog, selection).delivery_fee_ore, 0);
  assert.equal(quoteSelection(catalog, { ...selection, guests: 4 }), null);
  assert.equal(minimumGuestsFor(null, 5), 5);
  assert.equal(minimumGuestsFor(catalog.menus[0], 5), 10);
  const packageChoice = { ...selection, menuId, guests: 10 };
  assert.equal(quoteSelection(catalog, packageChoice, 'delivery', 9900).total_ore, 288900);
  assert.equal(quoteSelection(catalog, { ...packageChoice, guests: 9 }), null);
  assert.equal(quoteSelection(catalog, { ...packageChoice, guests: 1001 }), null);
  assert.equal(quoteSelection(catalog, { ...selection, quantities: { [dishId]: 1001 } }), null);
  assert.equal(quoteSelection({ ...catalog, dishes: [{ ...catalog.dishes[0], active: false }] }, selection), null);
});

test('V4.2: leverans matchar samma mest specifika aktiva zon utan att mutera katalogen', () => {
  const zones = [catalog.delivery_zones[0], { ...catalog.delivery_zones[0], id: menuId, postal_prefixes: ['7221'], fee_ore: 15000 }];
  assert.equal(findDeliveryZone(zones, '722 12').id, menuId);
  assert.deepEqual(zones.map(zone => zone.id), [zoneId, menuId]);
  assert.equal(findDeliveryZone(zones, '722 12', zoneId), null);
  assert.equal(findDeliveryZone(zones, '99999'), null);
});

test('V4.2: adminprisändringar uppdaterar nästa offert men lämnar historiska rader orörda', () => {
  const historical = structuredClone(quoteSelection(catalog, selection));
  const updated = { ...catalog, dishes: catalog.dishes.map(dish => ({ ...dish, price_ore: dish.price_ore + 1000 })) };
  assert.equal(quoteSelection(updated, selection).subtotal_ore, 62000);
  assert.equal(historical.subtotal_ore, 48000);
  assert.equal(historical.lines.find(line => line.dish_id === dishId).unit_price_ore, 2500);
});

test('V4.2: kanoniskt orderformat fungerar oberoende av plattform och ordningen i utkastet', () => {
  const webPayload = buildOrderPayload(selection, contact);
  const mobilePayload = buildOrderPayload({ ...selection, quantities: { [secondDishId]: 2, [dishId]: 12 } }, contact);
  assert.deepEqual(webPayload, mobilePayload);
  const parsed = newOrderSchema.parse(webPayload);
  assert.deepEqual(parsed.items, itemsFromQuantities(selection.quantities));
  assert.equal(parsed.delivery_zone_id, zoneId);
  assert.equal(parsed.menu_id, undefined);
  const packagePayload = buildOrderPayload({ ...selection, menuId }, { ...contact, fulfillment: 'pickup' });
  assert.equal(packagePayload.items, undefined);
  assert.equal(packagePayload.delivery_zone_id, undefined);
  assert.equal(packagePayload.menu_id, menuId);
  assert.equal(newOrderSchema.safeParse(packagePayload).success, true);
  const untrusted = buildOrderPayload(selection, { ...contact, total_ore: 1, payment_status: 'paid' });
  assert.equal('total_ore' in untrusted, false);
  assert.equal('payment_status' in untrusted, false);
});

test('V4.2: utkast begränsas utan att spara kontaktuppgifter eller priser', () => {
  const parsed = parseSelectionDraft({ ...selection, email: 'privat@example.se', price_ore: 1,
    quantities: { [dishId]: 2, bad: 1001, decimal: 0.5, text: '3', negative: -1 } });
  assert.deepEqual(parsed, { ...selection, quantities: { [dishId]: 2 } });
  assert.equal(Object.keys(parseSelectionDraft({ quantities: Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`dish-${i}`, 1])) }).quantities).length, 50);
  for (const invalid of [null, 42, 'bad', [], { guests: Infinity, quantities: 'bad', occasion: 'other' }]) {
    assert.deepEqual(parseSelectionDraft(invalid), { menuId: null, quantities: {}, guests: 10, occasion: 'hemma' });
  }
});

test('V4.2: kataloguppdatering rensar avpublicerade rätter men aldrig ett utkast vid demo/offline', () => {
  assert.equal(reconcileSelection(previewCatalog, selection), selection);
  assert.equal(reconcileSelection(catalog, selection), selection);
  const changed = reconcileSelection({ ...catalog, dishes: [catalog.dishes[0]] }, selection);
  assert.deepEqual(changed.quantities, { [dishId]: 12 });
  assert.equal(changed.guests, selection.guests);
  const packageChoice = { ...selection, menuId };
  assert.equal(reconcileSelection({ ...catalog, menus: [] }, packageChoice).menuId, null);
});

test('V4.2: betalningsmetoder följer hämtning, kontantinställning och aktiva leveranszoner', () => {
  assert.deepEqual(availablePaymentMethods(catalog, 'pickup'), ['card', 'swish', 'cash']);
  assert.deepEqual(availablePaymentMethods(catalog, 'delivery'), ['card', 'swish']);
  assert.deepEqual(availablePaymentMethods({ ...catalog, settings: { ...catalog.settings, cash_enabled: false } }, 'pickup'), ['card', 'swish']);
  assert.equal(canOfferDelivery(catalog), true);
  assert.equal(canOfferDelivery({ ...catalog, payment_methods: ['cash'] }), false);
  assert.equal(canOfferDelivery({ ...catalog, delivery_zones: [{ ...catalog.delivery_zones[0], active: false }] }), false);
});

test('V4.2: datum och leverans kontrolleras med samma rena funktion även vid slutlig sändning', () => {
  assert.equal(orderDetailsError(contact, catalog.settings, catalog.delivery_zones, now), '');
  assert.match(orderDetailsError({ ...contact, event_date: '2026-10-18' }, catalog.settings, catalog.delivery_zones, now), /datum/);
  assert.match(orderDetailsError({ ...contact, event_time: '25:00' }, catalog.settings, catalog.delivery_zones, now), /tid/);
  assert.match(orderDetailsError({ ...contact, address: '  ' }, catalog.settings, catalog.delivery_zones, now), /fullständig/);
  assert.match(orderDetailsError({ ...contact, postal_code: '99999' }, catalog.settings, catalog.delivery_zones, now), /leveranszoner/);
  assert.match(orderDetailsError(contact, { ...catalog.settings, delivery_enabled: false }, catalog.delivery_zones, now), /inte tillgänglig/);
  assert.equal(orderDetailsError({ ...contact, fulfillment: 'pickup', address: '', postal_code: '' }, catalog.settings, [], now), '');
  assert.match(orderDetailsError({ ...contact, fulfillment: 'pickup' }, { ...catalog.settings, pickup_enabled: false }, [], now), /inte tillgänglig/);
});

test('V4.2: formulär delar kontaktvalidering och svenska felmeddelanden', () => {
  assert.equal(orderContactError(contact), '');
  assert.match(orderContactError({ ...contact, full_name: ' ' }), /namn/);
  assert.match(orderContactError({ ...contact, email: 'wrong' }), /e-post/);
  assert.match(orderContactError({ ...contact, phone: 'abc' }), /telefonnummer/);
  assert.match(orderContactError({ ...contact, notes: 'x'.repeat(1001) }), /1 000/);
});

test('V4.2: betalningslänk kräver godkänd order, obekräftad betalning och säker Stripe-adress', () => {
  const order = { status: 'approved', payment_status: 'pending', payment_preference: 'card', checkout_url: 'https://checkout.stripe.com/c/pay/test', proposal: null };
  assert.equal(canPayOrder(order), true);
  for (const status of ['new', 'reviewing', 'changes_requested', 'rejected', 'cancelled', 'completed', 'dispatched']) assert.equal(canPayOrder({ ...order, status }), false);
  for (const payment_status of ['paid', 'refunded']) assert.equal(canPayOrder({ ...order, payment_status }), false);
  assert.equal(canPayOrder({ ...order, payment_preference: 'cash' }), false);
  assert.equal(canPayOrder({ ...order, proposal: { revision: 2 } }), false);
  for (const checkout_url of [null, 'javascript:alert(1)', 'http://checkout.stripe.com/pay', 'https://example.com/pay', 'https://checkout.stripe.com.evil.example/pay']) assert.equal(canPayOrder({ ...order, checkout_url }), false);
});

test('V4.2: gemensamt kundflöde, statusnamn, kategorier och varumärkesfärger', () => {
  const flow = [['new', 'unpaid', 1], ['reviewing', 'unpaid', 2], ['changes_requested', 'unpaid', 2],
    ['approved', 'pending', 4], ['approved', 'paid', 5], ['preparing', 'paid', 6], ['ready', 'paid', 7],
    ['dispatched', 'paid', 7], ['completed', 'paid', 8], ['rejected', 'unpaid', 0], ['cancelled', 'unpaid', 0]];
  for (const [status, payment_status, expected] of flow) assert.equal(orderProgress({ status, payment_status }), expected);
  assert.equal(orderTimelineLabels({ fulfillment: 'pickup', payment_preference: 'cash' })[3], 'Betalning vid hämtning');
  assert.equal(orderTimelineLabels({ fulfillment: 'delivery', payment_preference: 'card' })[6], 'På väg');
  assert.equal(orderSteps.length, 4);
  assert.equal(categoryLabels.brod_saser, 'Bröd & såser');
  assert.equal(designColors.green, '#155A43');
  assert.equal(designColors.red, '#B63842');
  assert.equal(designColors.soft, '#F7F5F2');
  assert.match(formatSek(57900), /579.*kr/);
});
