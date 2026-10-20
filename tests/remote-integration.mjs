// Real loopback gateway -> Next.js -> PostgREST -> PostgreSQL. The Serve identity
// boundary is simulated by native HTTP headers; this is not a physical-phone test.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { startTestEnvironment, testPackageId } from '../test-support/local/environment.mjs';
import { startRemoteGateway } from '../test-support/remote/gateway.mjs';
import { createDeviceRegistry } from '../test-support/remote/devices.mjs';

const publicOrigin = 'https://integration-device.synthetic-tailnet.ts.net:8443';
const login = 'integration-owner@example.test';
const accessToken = randomBytes(32).toString('base64url'), adminToken = randomBytes(32).toString('base64url');
let session, gateway, elevatedCookie, adminCookie, registry, registryFile, mobileToken, enrollment;
const credential = randomBytes(32).toString('base64url');
const identity = {nodeId:'integration-phone',login};
const checks = [];
const call = (route, { method = 'GET', body, headers = {} } = {}) => new Promise((resolve, reject) => {
  const request = http.request(gateway.origin + route, { method,
    headers: { Host: new URL(publicOrigin).host, 'Tailscale-User-Login': login, 'X-Yehabibi-Remote-Token': mobileToken || accessToken,
      'X-Forwarded-For':'100.64.0.2','X-Forwarded-Proto':'https',
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers } }, async response => {
    const chunks = []; for await (const chunk of response) chunks.push(chunk);
    const resultHeaders = new Headers();
    for (let index = 0; index < response.rawHeaders.length; index += 2) resultHeaders.append(response.rawHeaders[index], response.rawHeaders[index + 1]);
    resolve(new Response([204, 205, 304].includes(response.statusCode) ? null : Buffer.concat(chunks), { status: response.statusCode, headers: resultHeaders }));
  });
  request.once('error', reject); request.end(body ? typeof body === 'string' ? body : JSON.stringify(body) : undefined);
});
const data = async (route, options, status = 200) => {
  const response = await call(route, options), value = await response.json();
  assert.equal(response.status, status, value?.error || 'Private remote API returned an unexpected status.');
  return value;
};
const boot = async options => {
  session = await startTestEnvironment(options);
  registryFile ||= path.join(session.directory,'integration-devices.json');
  registry = createDeviceRegistry({file:registryFile});
  gateway = await startRemoteGateway({ session, publicOrigin, allowedLogins: [login], accessToken, adminToken, trustVerifiedPhones:true,
    proxySecret:randomBytes(32).toString('base64url'),deviceRegistry:registry,
    resolveIdentity:async ({sourceIp})=>sourceIp==='100.64.0.2'?identity:{nodeId:'different-phone',login} });
};
const browserCookies = () => ({ Cookie: `${elevatedCookie}; ${adminCookie}` });
const orderPath = receipt => `/api/orders/${receipt.code}?token=${receipt.token}`;
const readOrder = async receipt => (await data(orderPath(receipt))).order;
const input = (quote, method, overrides = {}) => ({ request_id: randomUUID(), menu_id: testPackageId, quantity: 1,
  fulfillment: 'pickup', scheduled_at: quote.slots[0].starts_at, expected_total_ore: quote.total_ore,
  full_name: 'Discarded nonfixture test input', email: 'discarded@example.test', phone: '0701111111', notes: 'Discarded test note',
  payment_preference: method, terms_accepted: true, ...overrides });

try {
  await boot({ reusable: true });
  enrollment = await data('/__remote/device/enroll',{method:'POST',body:{credential}});
  assert.equal(enrollment.status,'approved');
  assert.equal(enrollment.comparison_code,undefined);
  mobileToken=(await data('/__remote/device/session',{method:'POST',body:{credential}})).token;
  assert.ok(!fs.readFileSync(registryFile,'utf8').includes(credential),'Only hashed credentials may reach disk.');
  await data('/__remote/device/session',{method:'POST',body:{credential},headers:{'X-Forwarded-For':'100.64.0.3'}},403);
  checks.push('Automatic verified Tailscale phone connection without comparison or manual approval; hashed credential and stolen credential denied');
  const verified = await data('/__remote/health'); assert.equal(verified.isolation_id, session.isolationId); assert.equal(verified.real_payments, false);
  const catalog = await data('/api/catalog'); assert.equal(catalog.test_mode, true); assert.equal(catalog.direct_orders_enabled, true);
  for (const method of ['swish', 'card', 'apple_pay', 'google_pay']) assert.ok(catalog.payment_methods.includes(method));
  assert.equal((await call('/api/catalog', { headers: { 'X-Yehabibi-Remote-Token': '' } })).status, 401);
  for (const route of ['/rest/v1/orders', '/api/internal/jobs', '/api/payments/webhook', '/__test/ready', '/__test/stop', '/__transport/email']) assert.equal((await call(route)).status, 404);
  checks.push('Real isolated database attestation, customer authentication and blocked internal routes');

  const pairing = await call('/__remote/login', { method: 'POST', body: new URLSearchParams({ key: adminToken, return_path: '/__test/login' }).toString(),
    headers: { Origin: publicOrigin, 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(pairing.status, 303); elevatedCookie = pairing.headers.getSetCookie()[0].split(';')[0];
  const adminLogin = await call('/__test/login', { method: 'POST', body: new URLSearchParams({ password: session.adminPassword }).toString(),
    headers: { Origin: publicOrigin, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: elevatedCookie } });
  assert.equal(adminLogin.status, 303); assert.equal(adminLogin.headers.get('Location'), `${publicOrigin}/admin/orders`);
  adminCookie = adminLogin.headers.getSetCookie()[0].split(';')[0];
  assert.equal((await call('/api/admin/kitchen')).status, 401);
  assert.equal((await call('/api/admin/kitchen', { headers: { Cookie: elevatedCookie } })).status, 401);
  await data('/api/admin/kitchen', { headers: browserCookies() });
  checks.push('Separate elevated browser session plus independent existing testadmin login');

  let retainedReceipt;
  for (const method of ['swish', 'apple_pay', 'google_pay', 'card']) {
    const quote = await data('/api/availability', { method: 'POST', body: { menu_id: testPackageId, quantity: 1, fulfillment: 'pickup' } });
    assert.ok(quote.slots.length); assert.equal(quote.total_ore, 12900);
    const request = input(quote, method);
    const receipt = await data('/api/orders/direct', { method: 'POST', body: request }, 201);
    assert.ok(receipt.tracking_url.startsWith(publicOrigin + '/order/'));
    const retry = await data('/api/orders/direct', { method: 'POST', body: request }); assert.equal(retry.code, receipt.code); assert.ok(retry.token === receipt.token, 'Order retry must preserve the private capability.');
    const row = session.rows(`select full_name,email,phone,notes from public.orders where code='${receipt.code}'`)[0];
    assert.deepEqual(row, { full_name: 'TEST Syntetisk kund', email: 'customer@example.test', phone: '0700000000', notes: '' });
    const checkout = await data('/api/payments/create', { method: 'POST', body: { code: receipt.code, token: receipt.token, payment_method: method } });
    assert.equal(checkout.test_mode, true);
    const payment = new URL(checkout.checkout_url, publicOrigin); assert.equal(payment.origin, publicOrigin);
    assert.ok(/^\/__test\/payment\/lt_[a-f\d]{64}$/.test(payment.pathname), 'Simulator path must match the private checkout contract.');
    assert.equal((await call(payment.pathname + '/simulate', { method: 'POST', body: { action: 'success' }, headers: { Origin: publicOrigin } })).status, 401);
    const simulator = await call(payment.pathname, { headers: browserCookies() }); assert.equal(simulator.status, 200); assert.ok((await simulator.text()).includes('TESTLÄGE'), 'Simulator must display the test banner.');
    await data(payment.pathname + '/simulate', { method: 'POST', body: { action: 'success' }, headers: { Origin: publicOrigin, ...browserCookies() } });
    await session.waitFor(() => session.rows(`select payment_status from public.orders where code='${receipt.code}'`)[0]?.payment_status === 'paid');
    const paid = await readOrder(receipt); assert.equal(paid.payment_status, 'paid'); assert.equal(paid.capacity_status, 'confirmed');
    if (!retainedReceipt) retainedReceipt = receipt;
    checks.push(`Simulated ${method}: idempotent synthetic order, extra simulator authentication, signed paid status`);
  }
  const delivery = await data('/api/availability', { method: 'POST', body: { menu_id: testPackageId, quantity: 1, fulfillment: 'delivery', postal_code: '72100' } });
  assert.equal(delivery.delivery_fee_ore, 10000); assert.ok(delivery.slots.length);
  const delivered = await data('/api/orders/direct', { method: 'POST', body: input(delivery, 'card', { fulfillment: 'delivery', postal_code: '72100',
    delivery_zone_id: delivery.delivery_zone_id, address: 'Discarded test address', city: 'Discarded test city' }) }, 201);
  const deliveryRow = session.rows(`select address,city,delivery_fee_ore from public.orders where code='${delivered.code}'`)[0];
  assert.deepEqual(deliveryRow, { address: 'Testgatan 1', city: 'Teststad', delivery_fee_ore: 10000 });
  const deliveryCheckout = await data('/api/payments/create', { method: 'POST', body: { code: delivered.code, token: delivered.token, payment_method: 'card' } });
  session.sql('update public.direct_order_settings set paused=true where id=1');
  await data(new URL(deliveryCheckout.checkout_url, publicOrigin).pathname + '/simulate', { method: 'POST', body: { action: 'success' }, headers: { Origin: publicOrigin, ...browserCookies() } });
  await session.waitFor(() => session.rows(`select payment_status from public.orders where code='${delivered.code}'`)[0]?.payment_status === 'paid');
  assert.equal((await readOrder(delivered)).payment_status, 'paid');
  assert.equal((await data('/api/availability', { method: 'POST', body: { menu_id: testPackageId, quantity: 1, fulfillment: 'pickup' } })).enabled, false);
  session.sql('update public.direct_order_settings set paused=false where id=1');
  const jobs = await data('/api/admin/jobs', { headers: browserCookies() });
  assert.ok(jobs.health.last_watchdog_success_at, 'Independent background worker has not completed its authenticated watchdog tick.');
  checks.push('Synthetic delivery fee/address and existing signed payment handled while new orders are paused');

  const directory = session.directory, isolationId = session.isolationId, retainedMetroPort=session.metroPort;
  await gateway.close(); gateway = null; await session.stop(); session = null;
  await boot({ restoreDirectory: directory });
  await data('/api/catalog',{},401);
  mobileToken=(await data('/__remote/device/session',{method:'POST',body:{credential}})).token;
  assert.equal(session.isolationId, isolationId);
  assert.equal(session.metroPort,retainedMetroPort,'Normal restart must preserve the Metro port used by the Expo tunnel URL.');
  const retained = await readOrder(retainedReceipt); assert.equal(retained.payment_status, 'paid');
  assert.equal(retained.capacity_status, 'confirmed');
  assert.equal((await call('/api/admin/kitchen', { headers: { Cookie: elevatedCookie } })).status, 401);
  assert.notEqual((await call(`/api/orders/${retainedReceipt.code}`)).status,200,'Device authentication cannot replace the customer order token.');
  assert.notEqual((await call(`/api/orders/${retainedReceipt.code}?token=${'0'.repeat(64)}`)).status,200);
  registry.revoke(enrollment.id);
  await data('/api/catalog',{},401);
  assert.equal((await data('/__remote/device/session',{method:'POST',body:{credential}},401)).code,'device_revoked');
  assert.equal((await data('/__remote/device/enroll',{method:'POST',body:{credential}},401)).code,'device_revoked');
  checks.push('Stop/resume retains approved device and paid orders; old session invalidated, fresh session automatic; order token separate; revoke immediate');
  console.log(`V4.4.3 remote loopback gateway integration: ${checks.length} checks passed\n${checks.map(check => '  ✓ ' + check).join('\n')}\nProxy identity is simulated here. Real Tailscale HTTPS, OS reboot, 4G/5G and physical phones are separate checks.`);
} finally { if (gateway) await gateway.close(); if (session) await session.stop(); }
