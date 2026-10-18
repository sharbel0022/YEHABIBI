import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApiClient } from '../packages/api-client/index.ts';
import { formatScheduledTime } from '../packages/shared/scheduling/index.ts';

const availability = {
  server_now: '2026-10-25T00:00:00Z', timezone: 'Europe/Stockholm', enabled: true,
  pickup_address: 'Testgatan 1, Teststad', preparation_minutes: 15,
  delivery_zone_id: null, subtotal_ore: 50000, delivery_fee_ore: 0, total_ore: 50000,
  slots: [
    { starts_at: '2026-10-25T00:15:00Z', label: '25 okt. 02:15 CEST', event_date: '2026-10-25', event_time: '02:15', remaining_capacity: 1 },
    { starts_at: '2026-10-25T01:15:00Z', label: '25 okt. 02:15 CET', event_date: '2026-10-25', event_time: '02:15', remaining_capacity: 2 },
  ],
};
const input = { menu_id: '11111111-1111-4111-8111-111111111111', quantity: 2, fulfillment: 'pickup' };
const direct = { ...input, request_id: '22222222-2222-4222-8222-222222222222',
  scheduled_at: availability.slots[1].starts_at, expected_total_ore: availability.total_ore,
  full_name: 'Syntetisk Kund', email: 'direct@example.test', phone: '0700000000',
  notes: '', address: '', postal_code: '', city: '', payment_preference: 'swish', terms_accepted: true };
const receipt = { code: 'CM-1234567890', token: 'a'.repeat(64), tracking_url: 'https://example.test/order/CM-1234567890' };

test('V4.4 bokad tid förblir entydig i kund/admin när vintertidens klockslag upprepas', () => {
  const early = formatScheduledTime(availability.slots[0].starts_at);
  const late = formatScheduledTime(availability.slots[1].starts_at);
  assert.match(early, /02:15/); assert.match(late, /02:15/);
  assert.match(early, /GMT\+2/); assert.match(late, /GMT\+1/);
  assert.notEqual(early, late);
  assert.equal(formatScheduledTime(null), '');
});

test('V4.4 webb/Expo bevarar serverns entydiga tider under upprepad vintertidstimme', async () => {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json(availability);
  };
  const web = createApiClient({ fetch });
  const mobile = createApiClient({ baseUrl: 'https://example.test', fetch });
  assert.deepEqual(await web.getAvailability(input), availability);
  assert.deepEqual(await mobile.getAvailability(input), availability);
  assert.equal(calls[0].url, '/api/availability');
  assert.equal(calls[1].url, 'https://example.test/api/availability');
  assert.ok(calls.every(call => call.options.method === 'POST' && call.options.cache === 'no-store'));
  assert.deepEqual(calls.map(call => JSON.parse(call.options.body)), [input, input]);
});

test('V4.4 direktorder skickar paketantal, serverquote, exakt tid och samma återförsöksnyckel', async () => {
  const calls = [];
  const client = createApiClient({ fetch: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) }); return Response.json(receipt);
  } });
  assert.deepEqual(await client.createDirectOrder(direct), receipt);
  assert.deepEqual(await client.createDirectOrder(direct), receipt);
  assert.deepEqual(calls, Array.from({ length: 2 }, () => ({ url: '/api/orders/direct', body: direct })));
});

test('V4.4 ändrat pris eller full tid behåller serverns konfliktmeddelande', async () => {
  const client = createApiClient({ fetch: async () => Response.json({ error: 'Tiden har blivit fullbokad. Välj en ny tid.' }, { status: 409 }) });
  await assert.rejects(client.createDirectOrder(direct), error => error instanceof ApiError &&
    error.status === 409 && error.kind === 'http' && error.message.includes('fullbokad'));
});

test('V4.4 stängt kök kan svara med tom lista och begriplig orsak', async () => {
  const closed = { ...availability, enabled: false, slots: [], reason: 'Köket tar en paus.' };
  const client = createApiClient({ fetch: async () => Response.json(closed) });
  assert.deepEqual(await client.getAvailability(input), closed);
});

test('V4.4 klienten avvisar felaktiga tidszoner, priser och ofullständiga slot-svar', async () => {
  const invalid = [
    { ...availability, timezone: 'UTC' },
    { ...availability, total_ore: -1 },
    { ...availability, preparation_minutes: undefined },
    { ...availability, delivery_zone_id: undefined },
    { ...availability, server_now: '2026-10-25T00:00:00' },
    { ...availability, slots: [{ ...availability.slots[0], starts_at: '2026-10-25T02:15:00' }] },
    { ...availability, slots: [{ ...availability.slots[0], remaining_capacity: 0 }] },
  ];
  for (const value of invalid) {
    const client = createApiClient({ fetch: async () => Response.json(value) });
    await assert.rejects(client.getAvailability(input), error => error instanceof ApiError && error.kind === 'response');
  }
});
