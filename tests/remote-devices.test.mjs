import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createDeviceRegistry } from '../test-support/remote/devices.mjs';
import { startRemoteGateway } from '../test-support/remote/gateway.mjs';

const secret = () => randomBytes(32).toString('base64url');
const login = 'device-owner@example.test';
const phone = { nodeId: 'n-synthetic-phone', login };
const otherPhone = { nodeId: 'n-other-phone', login };
const publicOrigin = 'https://synthetic-device.synthetic-tailnet.ts.net:8443';
const errorCode = code => error => error.code === code;

function registryFixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'yehabibi-device-test-')), file = join(directory, 'devices.json');
  return { directory, file, registry: createDeviceRegistry({ file, ...options }),
    close: () => { assert.equal(dirname(resolve(directory)),resolve(tmpdir())); rmSync(directory, { recursive: true, force: true }); } };
}
function approve(registry, credential = secret(), identity = phone) {
  const pending = registry.requestEnrollment({ credential, identity });
  registry.approve(pending.id, pending.comparison_code);
  return { ...pending, credential };
}

test('first registration needs matching local comparison code; only hashes persist and pending requests are stable', () => {
  const f = registryFixture(), credential = secret();
  try {
    const pending = f.registry.requestEnrollment({ credential, identity: phone });
    assert.equal(pending.status, 'pending');
    assert.deepEqual(f.registry.requestEnrollment({ credential, identity: phone }), pending);
    assert.throws(() => f.registry.authenticate(credential, phone), errorCode('device_pending'));
    assert.throws(() => f.registry.approve(pending.id, '0000-0000-0000'), errorCode('invalid_registration'));
    const approved = f.registry.approve(pending.id, pending.comparison_code);
    assert.equal(approved.status, 'approved');
    assert.equal(f.registry.authenticate(credential, phone).id, pending.id);
    assert.deepEqual(f.registry.requestEnrollment({ credential, identity: phone }), { id: pending.id, status: 'approved' });
    assert.equal(readFileSync(f.file, 'utf8').includes(credential), false);
    for (const forbidden of ['credential_hash', 'binding_hash', credential, pending.comparison_code]) assert.equal(JSON.stringify(f.registry.list()).includes(forbidden), false);
    assert.equal(readFileSync(f.file, 'utf8').includes('"credential_hash"'), true);
  } finally { f.close(); }
});

test('registry survives process reconstruction, reloads external revocation, and never re-enrolls a revoked secret', () => {
  const f = registryFixture();
  try {
    const registration = approve(f.registry);
    const restarted = createDeviceRegistry({ file: f.file });
    assert.equal(restarted.authenticate(registration.credential, phone).id, registration.id);
    restarted.revoke(registration.id);
    assert.throws(() => f.registry.authenticate(registration.credential, phone), errorCode('device_revoked'));
    assert.throws(() => restarted.requestEnrollment({ credential: registration.credential, identity: phone }), errorCode('device_revoked'));
    assert.throws(() => restarted.requestEnrollment({ credential: registration.credential, identity: otherPhone }), errorCode('device_revoked'));
    const replacement = approve(restarted);
    assert.notEqual(replacement.id, registration.id);
    assert.equal(restarted.revokeAll(), 2);
    assert.throws(() => restarted.authenticate(replacement.credential, phone), errorCode('device_revoked'));
  } finally { f.close(); }
});

test('stolen credential cannot authenticate or enroll under another stable node or Tailscale user', () => {
  const f = registryFixture();
  try {
    const registration = approve(f.registry);
    for (const identity of [otherPhone, { ...phone, login: 'other@example.test' }]) {
      assert.throws(() => f.registry.authenticate(registration.credential, identity), errorCode('device_identity'));
      assert.throws(() => f.registry.requestEnrollment({ credential: registration.credential, identity }), errorCode('device_identity'));
    }
    assert.equal(f.registry.authenticate(secret(), phone), null);
    for (const credential of ['', 'short', secret() + 'x', {}, 'a'.repeat(43)]) assert.throws(() => f.registry.authenticate(credential, phone), errorCode('device_invalid'));
    assert.throws(() => f.registry.authenticate(registration.credential, { ...phone, nodeId: '../forged' }), errorCode('device_identity'));
  } finally { f.close(); }
});

test('expired pending enrollment cannot be approved, and pending registry is bounded', () => {
  let time = Date.now();
  const f = registryFixture({ now: () => time });
  try {
    const credential = secret(), pending = f.registry.requestEnrollment({ credential, identity: phone });
    time += 10 * 60 * 1000;
    assert.throws(() => f.registry.approve(pending.id, pending.comparison_code), errorCode('enrollment_expired'));
    const replacement = f.registry.requestEnrollment({ credential, identity: phone });
    assert.notEqual(replacement.id, pending.id);
    for (let index = 1; index < 25; index++) f.registry.requestEnrollment({ credential: secret(), identity: phone });
    assert.throws(() => f.registry.requestEnrollment({ credential: secret(), identity: phone }), errorCode('enrollment_limit'));
    assert.equal(f.registry.list().length, 25);
    time += 10 * 60 * 1000;
    f.registry.requestEnrollment({ credential: secret(), identity: phone });
    assert.equal(f.registry.list().length, 1);
  } finally { f.close(); }
});

test('registry corruption fails closed instead of silently forgetting approval or revocation', () => {
  const f = registryFixture();
  try {
    const approved = approve(f.registry);
    writeFileSync(f.file, '{invalid json');
    assert.throws(() => f.registry.authenticate(approved.credential, phone));
    assert.throws(() => f.registry.list());
    assert.throws(() => f.registry.requestEnrollment({ credential: secret(), identity: phone }));
    assert.equal(readFileSync(f.file, 'utf8'), '{invalid json');
  } finally { f.close(); }
});

test('a proven OS boot change recovers stale lock even when Windows has reused its PID', () => {
  const f = registryFixture({ bootId: 'current-verified-os-boot' });
  try {
    writeFileSync(`${f.file}.lock`, JSON.stringify({ pid: process.pid, bootId: 'previous-verified-os-boot' }));
    const registration = approve(f.registry);
    assert.equal(f.registry.authenticate(registration.credential, phone).id, registration.id);
    writeFileSync(`${f.file}.lock`, JSON.stringify({ pid: process.pid, bootId: 'current-verified-os-boot' }));
    assert.throws(() => f.registry.revoke(registration.id), /registret är låst/);
    assert.equal(f.registry.authenticate(registration.credential, phone).status, 'approved');
  } finally { f.close(); }
});

async function listen(handler) {
  const instance = http.createServer(handler);
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${instance.address().port}`, close: async () => { instance.closeAllConnections(); await new Promise(resolve => instance.close(resolve)); } };
}
async function gatewayFixture({ configureDevices = true, configureResolver = true, trustVerifiedPhones = false } = {}) {
  const f = registryFixture(), requests = [], isolationId = randomUUID();
  const upstream = await listen((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/__test/ready') return response.end(JSON.stringify({ isolation_id: isolationId }));
    requests.push({ url: request.url, headers: request.headers });
    if (request.url.startsWith('/api/orders/')) response.statusCode = 401;
    response.end(JSON.stringify(request.url.startsWith('/api/orders/') ? { error: 'Order capability required.' } : { test_mode: true }));
  });
  const backend = await listen((_request, response) => { response.end('{}'); });
  const session = { marker: 'YEHABIBI_ISOLATED_LOCAL_TEST', isolationId, origin: upstream.origin, backendOrigin: backend.origin, controlSecret: randomBytes(32).toString('hex') };
  session.webEnv = { APP_ENV: 'test', NODE_ENV: 'development', PAYMENTS_ENABLED: 'false', PAYMENTS_LIVE_APPROVED: 'false', TEST_ISOLATION_ID: isolationId,
    TEST_PAYMENT_SECRET: session.controlSecret, TEST_BACKEND_ORIGIN: backend.origin, NEXT_PUBLIC_SUPABASE_URL: backend.origin, NEXT_PUBLIC_SITE_URL: upstream.origin };
  const options = { session, publicOrigin, allowedLogins: [login], accessToken: secret(), adminToken: secret(), proxySecret: secret(), trustVerifiedPhones,
    ...(configureDevices ? { deviceRegistry: f.registry } : {}),
    ...(configureResolver ? { resolveIdentity: async ({ sourceIp, login: claimed }) => {
      if (claimed !== login) return null;
      if (['100.64.1.2', 'fd7a:115c:a1e0::2'].includes(sourceIp)) return phone;
      if (sourceIp === '100.64.1.3') return otherPhone;
      return null;
    } } : {}) };
  let gateway = await startRemoteGateway(options);
  const call = (path, { token, headers = {}, method, body, bare = false } = {}) => new Promise((resolve, reject) => {
    const address = bare ? new URL(gateway.origin).origin : gateway.origin;
    const request = http.request(address + path, { method: method || (body ? 'POST' : 'GET'), headers: {
      Host: new URL(publicOrigin).host, 'Tailscale-User-Login': login, 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '100.64.1.2',
      ...(token ? { 'X-Yehabibi-Remote-Token': token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers,
    } }, async response => {
      const chunks = []; for await (const chunk of response) chunks.push(chunk);
      const output = Buffer.concat(chunks).toString();
      resolve({ status: response.statusCode, body: response.headers['content-type']?.includes('application/json') ? JSON.parse(output || 'null') : output, headers: response.headers });
    });
    request.once('error', reject); request.end(body ? JSON.stringify(body) : undefined);
  });
  return { ...f, call, requests, options, restart: async () => {
    await gateway.close(); gateway = await startRemoteGateway({ ...options, accessToken: secret(), adminToken: secret(), proxySecret: secret(), deviceRegistry: createDeviceRegistry({ file: f.file }) });
  }, close: async () => { await gateway.close(); await backend.close(); await upstream.close(); f.close(); } };
}

test('automatic trusted-phone connection needs no comparison or approval and revocation cannot be bypassed by a new credential', async () => {
  const f = await gatewayFixture({trustVerifiedPhones:true}), credential=secret();
  try {
    const enrolled=await f.call('/__remote/device/enroll',{body:{credential}});
    assert.equal(enrolled.status,200);assert.equal(enrolled.body.status,'approved');
    assert.equal(enrolled.body.comparison_code,undefined);
    const session=await f.call('/__remote/device/session',{body:{credential}});
    assert.equal(session.status,200);
    assert.equal((await f.call('/api/catalog',{token:session.body.token})).status,200);
    assert.equal((await f.call('/api/admin/settings',{token:session.body.token})).status,401);
    assert.equal((await f.call('/__remote/device/enroll',{body:{credential},headers:{'X-Forwarded-For':'100.64.1.3'}})).status,403);
    await f.restart();
    assert.equal((await f.call('/__remote/device/session',{body:{credential}})).status,200);
    f.registry.revoke(enrolled.body.id);
    const bypass=await f.call('/__remote/device/enroll',{body:{credential:secret()}});
    assert.equal(bypass.status,401);assert.equal(bypass.body.code,'device_revoked');
    assert.equal((await f.call('/__remote/device/session',{body:{credential}})).body.code,'device_revoked');
    assert.equal((await f.call('/__remote/device/enroll',{body:{credential:secret()},bare:true})).status,403);
  }finally{await f.close();}
});

test('gateway explicit enrollment, approval and automatic short session resume survive gateway reconstruction', async () => {
  const f = await gatewayFixture(), credential = secret();
  try {
    const enrollment = await f.call('/__remote/device/enroll', { body: { credential } });
    assert.equal(enrollment.status, 200); assert.equal(enrollment.body.status, 'pending');
    assert.equal((await f.call('/__remote/device/session', { body: { credential } })).body.code, 'device_pending');
    f.registry.approve(enrollment.body.id, enrollment.body.comparison_code);
    const authorization = await f.call('/__remote/device/session', { body: { credential } });
    assert.equal(authorization.status, 200);
    assert.ok(Date.parse(authorization.body.expires_at) - Date.now() <= 5 * 60 * 1000);
    assert.ok(Date.parse(authorization.body.expires_at) - Date.now() > 4 * 60 * 1000);
    assert.equal((await f.call('/api/catalog', { token: authorization.body.token })).status, 200);
    assert.equal(f.requests.at(-1).headers['x-yehabibi-remote-token'], undefined);
    assert.equal(f.requests.at(-1).headers['tailscale-user-login'], undefined);
    await f.restart();
    const stale = await f.call('/api/catalog', { token: authorization.body.token });
    assert.equal(stale.status, 401); assert.equal(stale.body.code, 'remote_session_invalid');
    const resumed = await f.call('/__remote/device/session', { body: { credential } });
    assert.equal(resumed.status, 200); assert.notEqual(resumed.body.token, authorization.body.token);
    assert.equal((await f.call('/api/catalog', { token: resumed.body.token })).status, 200);
  } finally { await f.close(); }
});

test('device sessions enforce node identity, revocation, customer order capabilities and separate elevation', async () => {
  const f = await gatewayFixture();
  try {
    const registration = approve(f.registry);
    const { body: authorization } = await f.call('/__remote/device/session', { body: { credential: registration.credential } });
    const token = authorization.token;
    // Changing Wi-Fi/cellular does not change the Tailscale node. The resolver can return its stable ID for either address family.
    assert.equal((await f.call('/api/catalog', { token, headers: { 'X-Forwarded-For': 'fd7a:115c:a1e0::2' } })).status, 200);
    assert.equal((await f.call('/api/catalog', { token, headers: { 'X-Forwarded-For': '100.64.1.3' } })).body.code, 'device_identity');
    assert.equal((await f.call('/__remote/device/session', { body: { credential: registration.credential }, headers: { 'X-Forwarded-For': '100.64.1.3' } })).body.code, 'device_identity');
    const order = await f.call('/api/orders/CM-ABCDEF1234', { token });
    assert.equal(order.status, 401); assert.equal(order.body.code, undefined, 'Upstream order denial must never be treated as expired gateway authentication.');
    for (const path of ['/api/admin/settings', '/admin/orders', '/__test/login', '/__test/payment/lt_' + 'a'.repeat(64)]) {
      const denied = await f.call(path, { token });
      assert.equal(denied.status, 401, path);
    }
    assert.equal((await f.call('/__test/payment/lt_' + 'a'.repeat(64) + '/simulate', { token, body: {} })).status, 401);
    for (const path of ['/api/internal/jobs', '/api/payments/webhook', '/__test/stop', '/rest/v1/orders', '/__remote/device/approve', '/__remote/device/revoke']) assert.equal((await f.call(path, { token, body: {} })).status, 404, path);
    createDeviceRegistry({ file: f.file }).revoke(registration.id);
    const revoked = await f.call('/api/catalog', { token });
    assert.equal(revoked.status, 401); assert.equal(revoked.body.code, 'device_revoked');
    for (const endpoint of ['session', 'enroll']) assert.equal((await f.call('/__remote/device/' + endpoint, { body: { credential: registration.credential } })).body.code, 'device_revoked');
  } finally { await f.close(); }
});

test('untrusted proxy paths, forged headers, malformed addresses, missing Tailscale and invalid credentials fail closed', async () => {
  const f = await gatewayFixture(), credential = secret();
  try {
    const request = { body: { credential } };
    const forged = await f.call('/__remote/device/enroll', { ...request, bare: true });
    assert.equal(forged.status, 403); assert.equal(forged.body.code, 'device_identity');
    for (const headers of [{ 'X-Forwarded-For': '100.64.1.2, 100.64.1.3' }, { 'X-Forwarded-For': '' }, { 'X-Forwarded-For': '127.0.0.1' },
      { 'X-Forwarded-For': '100.64.99.99' }, { 'Tailscale-User-Login': 'outsider@example.test' }, { 'Tailscale-User-Login': login + ',evil@example.test' },
      { 'X-Forwarded-Proto': '' }, { Host: 'localhost' }]) assert.equal((await f.call('/__remote/device/enroll', { ...request, headers })).status, 403);
    assert.equal((await f.call('/__remote/device/enroll', { ...request, headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await f.call('/__remote/device/enroll', { ...request, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await f.call('/__remote/device/enroll', { ...request, headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await f.call('/__remote/device/enroll', { body: { credential, nodeId: phone.nodeId } })).body.code, 'device_invalid');
    assert.equal((await f.call('/__remote/device/session', { body: { credential: secret() } })).body.code, 'device_invalid');
    assert.equal((await f.call('/__remote/device/session', { body: { credential: 'invalid' } })).body.code, 'device_invalid');
    assert.equal(f.registry.list().length, 0);
    assert.equal(f.requests.length, 0);
  } finally { await f.close(); }
});

test('enrollment rate limit bounds requests and absent registry or resolver grants no device authorization', async () => {
  const f = await gatewayFixture();
  try {
    for (let index = 0; index < 12; index++) assert.equal((await f.call('/__remote/device/enroll', { body: { credential: secret() } })).status, 200);
    const limited = await f.call('/__remote/device/enroll', { body: { credential: secret() } });
    assert.equal(limited.status, 429); assert.equal(limited.body.code, 'enrollment_limit');
    assert.equal(f.registry.list().length, 12);
  } finally { await f.close(); }
  for (const options of [{ configureDevices: false }, { configureResolver: false }]) {
    const unavailable = await gatewayFixture(options);
    try { assert.equal((await unavailable.call('/__remote/device/enroll', { body: { credential: secret() } })).status, 403); }
    finally { await unavailable.close(); }
  }
});
