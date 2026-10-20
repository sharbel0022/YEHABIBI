import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { startRemoteGateway } from '../test-support/remote/gateway.mjs';
import { remoteContract, remoteCookieName, routePolicy, rewriteCustomerUrls } from '../test-support/remote/contract.mjs';

const publicOrigin = 'https://synthetic-device.synthetic-tailnet.ts.net:8443';
const approvedLogin = 'synthetic-owner@example.test';
const secret = () => randomBytes(32).toString('base64url');
async function server(handler) {
  const instance = http.createServer(handler);
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${instance.address().port}`, close: async () => { instance.closeAllConnections(); await new Promise(resolve => instance.close(resolve)); } };
}

async function fixture() {
  const isolationId = randomUUID(), requests = [];
  let readinessId = isolationId;
  const upstream = await server(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    if (request.url === '/__test/ready') { response.setHeader('Content-Type', 'application/json'); return response.end(JSON.stringify({ isolation_id: readinessId })); }
    requests.push({ path: request.url, method: request.method, headers: request.headers, body });
    if (request.url === '/__test/login') { response.writeHead(303, { Location: `${upstream.origin}/admin/orders`, 'Set-Cookie': 'sb-test=isolated; Path=/; HttpOnly; SameSite=Strict' }); return response.end(); }
    if (request.url.startsWith('/__test/payment/')) { response.setHeader('Content-Type', 'text/html'); return response.end(`<a href="${upstream.origin}/order/CM-ABCDEF1234?token=private-test-capability">TEST</a>`); }
    if (request.url === '/api/orders') { response.setHeader('Content-Type', 'application/json'); return response.end(JSON.stringify({ code: 'CM-ABCDEF1234', tracking_url: `${upstream.origin}/order/CM-ABCDEF1234?token=private-test-capability` })); }
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ test_mode: true }));
  });
  const bridge = await server((request, response) => { response.writeHead(303, { Location: `${upstream.origin}/admin/orders`, 'Set-Cookie': 'sb-test=isolated; Path=/; HttpOnly; SameSite=Strict' }); response.end(); });
  const session = { marker: 'YEHABIBI_ISOLATED_LOCAL_TEST', isolationId, origin: upstream.origin, backendOrigin: bridge.origin, controlSecret: randomBytes(32).toString('hex') };
  session.webEnv = { APP_ENV: 'test', NODE_ENV: 'development', PAYMENTS_ENABLED: 'false', PAYMENTS_LIVE_APPROVED: 'false',
    TEST_ISOLATION_ID: isolationId, TEST_PAYMENT_SECRET: session.controlSecret, TEST_BACKEND_ORIGIN: bridge.origin,
    NEXT_PUBLIC_SUPABASE_URL: bridge.origin, NEXT_PUBLIC_SITE_URL: upstream.origin };
  const options = { session, publicOrigin, allowedLogins: [approvedLogin, 'second-owner@example.test'], accessToken: secret(), adminToken: secret(),
    phoneIps: ['100.64.1.2'], selfIps: ['100.64.1.1'] };
  const gateway = await startRemoteGateway(options);
  // Node's fetch deliberately ignores a custom Host. Native HTTP models the Serve proxy boundary.
  const call = (path, { headers = {}, body, method = body ? 'POST' : 'GET' } = {}) => new Promise((resolve, reject) => {
    const request = http.request(gateway.origin + path, { method,
      headers: { Host: new URL(publicOrigin).host, 'Tailscale-User-Login': approvedLogin, 'X-Yehabibi-Remote-Token': options.accessToken, ...headers } }, async response => {
      const chunks = []; for await (const chunk of response) chunks.push(chunk);
      const resultHeaders = new Headers();
      for (let index = 0; index < response.rawHeaders.length; index += 2) resultHeaders.append(response.rawHeaders[index], response.rawHeaders[index + 1]);
      resolve(new Response([204, 205, 304].includes(response.statusCode) ? null : Buffer.concat(chunks), { status: response.statusCode, headers: resultHeaders }));
    });
    request.once('error', reject); request.end(body?.toString());
  });
  const browserLogin = async (key, extra = {}) => {
    const response = await call('/__remote/login', { body: new URLSearchParams({ key, return_path: '/admin/orders' }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: publicOrigin, ...extra } });
    return { response, cookie: response.headers.getSetCookie()[0]?.split(';')[0] };
  };
  return { ...options, call, browserLogin, requests, diagnostics: gateway.diagnostics, setReadiness: value => { readinessId = value; },
    close: async () => { await gateway.close(); await bridge.close(); await upstream.close(); } };
}

test('private remote contract refuses production, public DB, reused keys and unapproved origins without relaxing localhost payment guards', async () => {
  const f = await fixture();
  try {
    assert.equal(remoteContract(f).publicOrigin, publicOrigin);
    for (const patch of [{ publicOrigin: 'http://synthetic-device.synthetic-tailnet.ts.net' }, { publicOrigin: 'https://public.example' },
      { publicOrigin: `${publicOrigin}/path` }, { publicOrigin: 'https://synthetic-device.synthetic-tailnet.ts.net.evil.example' },
      { allowedLogins: [] }, { accessToken: 'short' }, { adminToken: f.accessToken }, { allowedOrigins: ['https://evil.example'] },
      { session: { ...f.session, origin: 'http://0.0.0.0:3000' } },
      { session: { ...f.session, webEnv: { ...f.session.webEnv, APP_ENV: 'production' } } },
      { session: { ...f.session, webEnv: { ...f.session.webEnv, PAYMENTS_ENABLED: 'true' } } },
      { session: { ...f.session, webEnv: { ...f.session.webEnv, ADYEN_API_KEY: 'forbidden' } } },
      { session: { ...f.session, webEnv: { ...f.session.webEnv, NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.supabase.co' } } }]) assert.throws(() => remoteContract({ ...f, ...patch }));
    const guard = readFileSync(new URL('../test-support/payments/guard.ts', import.meta.url), 'utf8');
    assert.match(guard, /backend.protocol !== 'http:'/);
    assert.match(guard, /checkout.protocol !== 'http:'/);
    assert.equal(guard.includes('ts.net'), false);
  } finally { await f.close(); }
});

test('gateway observes selected-phone HTTPS separately from PC self-tests without exposing diagnostics or secrets remotely', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/api/catalog', { headers: { 'X-Forwarded-For': '100.64.1.1' } })).status, 200);
    assert.equal(f.diagnostics().selfRequests, 1);
    assert.equal(f.diagnostics().phoneRequests, 0);
    assert.equal(f.diagnostics().lastPhoneAuthenticatedApiAt, null);
    const phone = { 'X-Forwarded-For': '100.64.1.2', 'X-Yehabibi-Remote-Token': '' };
    assert.equal((await f.call('/__remote/login', { headers: phone })).status, 200);
    assert.equal(f.diagnostics().phoneRequests, 1);
    assert.equal(f.diagnostics().lastPhoneCategory, 'login');
    assert.equal(f.diagnostics().lastPhoneAuthenticatedApiAt, null);
    assert.equal((await f.call('/api/catalog', { headers: phone })).status, 401);
    assert.equal(f.diagnostics().lastPhoneRejection, 'session');
    assert.equal(f.diagnostics().lastPhoneAuthenticatedApiAt, null);
    assert.equal((await f.call('/api/catalog?private=PRIVATE_QUERY', { headers: { 'X-Forwarded-For': '100.64.1.2' } })).status, 200);
    assert.ok(f.diagnostics().lastPhoneAuthenticatedApiAt);
    assert.equal(f.diagnostics().lastPhoneCategory, 'catalog');
    assert.equal(f.diagnostics().deniedPhoneRequests, 1);
    assert.equal((await f.call('/api/catalog', { headers: { 'X-Forwarded-For': '100.64.1.2, 100.64.1.1' } })).status, 200);
    assert.equal(f.diagnostics().unknownRequests, 1, 'Forwarded chains cannot be guessed into phone evidence.');
    for (const route of ['/__remote/diagnostics', '/__remote/status']) assert.equal((await f.call(route)).status, 404);
    for (const forbidden of ['100.64.', approvedLogin, f.accessToken, f.adminToken, 'PRIVATE_QUERY', '/api/catalog', 'token=']) {
      assert.equal(JSON.stringify(f.diagnostics()).includes(forbidden), false, forbidden);
    }
    assert.equal(f.requests.at(-1).headers['x-yehabibi-remote-token'], undefined);
    assert.notEqual(f.requests.at(-1).headers['x-forwarded-for'], '100.64.1.2');
  } finally { await f.close(); }
});

test('gateway requires trusted private Host, Serve identity, independent access key and database attestation', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/api/catalog')).status, 200);
    for (const headers of [{ Host: 'localhost:8443' }, { 'Tailscale-User-Login': '' }, { 'Tailscale-User-Login': 'outside@example.test' },
      { 'X-Yehabibi-Remote-Token': '' }, { 'X-Yehabibi-Remote-Token': f.adminToken }, { 'X-Forwarded-Proto': 'http' }]) assert.ok([401, 403].includes((await f.call('/api/catalog', { headers })).status));
    const health = await f.call('/__remote/health'); assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { marker: 'YEHABIBI_PRIVATE_REMOTE_TEST_V1', isolation_id: f.session.isolationId, test_mode: true, real_payments: false });
    f.setReadiness(randomUUID());
    assert.equal((await f.call('/__remote/health')).status, 502);
  } finally { await f.close(); }
});

test('route allowlist blocks database, transport, worker, webhook, control, dev introspection and encoded bypasses', async () => {
  const f = await fixture();
  try {
    for (const path of ['/rest/v1/orders', '/auth/v1/admin/users', '/api/internal/jobs', '/api/payments/webhook', '/__test/stop',
      '/__test/ready', '/__transport/email', '/api/admin/upload', '/_next/webpack-hmr', '/_next/image?url=http://localhost',
      '/api%2Finternal/jobs', '/api/%252e%252e/internal/jobs', '/__test/payment/invalid', '/favicon.ico']) assert.ok([404, 502].includes((await f.call(path)).status), path);
    assert.equal((await f.call('/api/catalog', { method: 'POST' })).status, 404);
    assert.equal(f.requests.length, 0);
    assert.equal(routePolicy('/api/admin/settings', 'PATCH'), null);
    assert.equal(routePolicy('/api/admin/menus', 'POST'), null);
  } finally { await f.close(); }
});

test('browser elevation uses separate Secure HttpOnly cookie bound to approved identity; customer token cannot simulate payments', async () => {
  const f = await fixture();
  try {
    const payment = '/__test/payment/lt_' + 'a'.repeat(64);
    assert.equal((await f.call(payment + '/simulate', { body: '{}', headers: { 'Content-Type': 'application/json' } })).status, 401);
    const customer = await f.browserLogin(f.accessToken);
    assert.equal(customer.response.status, 303);
    assert.equal((await f.call(payment + '/simulate', { body: '{}', headers: { Cookie: customer.cookie } })).status, 401);
    const elevated = await f.browserLogin(f.adminToken);
    assert.equal(elevated.response.status, 303);
    const setCookie = elevated.response.headers.getSetCookie()[0];
    assert.match(setCookie, new RegExp(`^${remoteCookieName}=`));
    for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/']) assert.ok(setCookie.includes(attribute));
    assert.equal((await f.call(payment, { headers: { Cookie: elevated.cookie, 'X-Yehabibi-Remote-Token': '' } })).status, 200);
    assert.equal((await f.call(payment, { headers: { Cookie: elevated.cookie, 'Tailscale-User-Login': 'second-owner@example.test', 'X-Yehabibi-Remote-Token': '' } })).status, 401);
    const logout = await f.call('/__remote/logout', { method: 'POST', headers: { Cookie: elevated.cookie, Origin: publicOrigin } });
    assert.equal(logout.status, 200);
    assert.equal((await f.call(payment + '/simulate', { body: '{}', headers: { Cookie: elevated.cookie } })).status, 401);
  } finally { await f.close(); }
});

test('remote CSRF and arbitrary CORS origins cannot pair, create orders or invoke simulator', async () => {
  const f = await fixture();
  try {
    const form = await f.call('/__remote/login');
    assert.equal(form.status, 200);
    assert.equal(form.headers.get('Referrer-Policy'), 'same-origin', 'Browser form POST must retain same-origin Origin instead of null.');
    assert.equal((await f.browserLogin(f.adminToken, { Origin: 'https://evil.example' })).response.status, 403);
    assert.equal((await f.browserLogin(f.adminToken, { Origin: '' })).response.status, 403);
    assert.equal((await f.browserLogin(f.adminToken, { Origin: 'null' })).response.status, 403);
    assert.equal((await f.call('/api/orders', { body: '{}', headers: { Origin: 'https://evil.example' } })).status, 403);
    const preflight = await f.call('/api/orders', { method: 'OPTIONS', headers: { Origin: publicOrigin, 'X-Yehabibi-Remote-Token': '' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), publicOrigin);
    assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /X-Yehabibi-Remote-Token/);
    assert.equal(f.requests.length, 0);
  } finally { await f.close(); }
});

test('gateway sends only synthetic customer details and strips credentials and forged forwarding headers', async () => {
  const f = await fixture();
  try {
    const response = await f.call('/api/orders', { body: JSON.stringify({ full_name: 'Discarded input', email: 'discard@example.test', phone: 'discarded',
      address: 'Discarded address', city: 'Discarded city', notes: 'Discarded note', fulfillment: 'delivery', postal_code: '72100', request_id: randomUUID() }),
    headers: { 'Content-Type': 'application/json', Origin: publicOrigin, Authorization: 'Bearer discarded', 'X-Forwarded-Host': 'evil.example',
      Cookie: `${remoteCookieName}=discarded; sb-test=preserved` } });
    assert.equal(response.status, 200);
    assert.ok((await response.json()).tracking_url.startsWith(publicOrigin + '/order/'));
    const forwarded = f.requests.at(-1), input = JSON.parse(forwarded.body);
    assert.equal(input.full_name, 'TEST Syntetisk kund'); assert.equal(input.email, 'customer@example.test');
    assert.equal(input.phone, '0700000000'); assert.equal(input.notes, ''); assert.equal(input.address, 'Testgatan 1'); assert.equal(input.city, 'Teststad');
    assert.equal(input.postal_code, '72100');
    assert.equal(forwarded.headers['x-yehabibi-remote-token'], undefined);
    assert.equal(forwarded.headers.authorization, undefined); assert.equal(forwarded.headers['tailscale-user-login'], undefined);
    assert.equal(forwarded.headers['x-forwarded-host'], undefined); assert.equal(forwarded.headers.cookie.trim(), 'sb-test=preserved');
    assert.equal(forwarded.headers.origin, f.session.origin);
    assert.equal(forwarded.headers.host, new URL(f.session.origin).host);
  } finally { await f.close(); }
});

test('bridge login and simulator remain private while redirects and local capability URLs use exact private HTTPS', async () => {
  const f = await fixture();
  try {
    const { cookie } = await f.browserLogin(f.adminToken);
    const login = await f.call('/__test/login', { headers: { Cookie: cookie } });
    assert.equal(login.status, 303); assert.equal(login.headers.get('Location'), publicOrigin + '/admin/orders');
    assert.match(login.headers.getSetCookie()[0], /; Secure$/);
    const payment = await f.call('/__test/payment/lt_' + 'a'.repeat(64), { headers: { Cookie: cookie } });
    assert.equal(payment.headers.get('Referrer-Policy'), 'same-origin', 'Simulator form POST must retain same-origin Origin.');
    assert.ok((await payment.text()).includes(publicOrigin + '/order/CM-ABCDEF1234'));
    const contract = remoteContract(f);
    const result = rewriteCustomerUrls({ checkout_url: f.session.origin + '/__test/payment/private',
      other: f.session.origin, nested: [{ tracking_url: f.session.origin + '/order/private?token=private' }],
      foreign: { checkout_url: 'https://untrusted.example/private' }, db_url: f.session.backendOrigin + '/rest/v1' }, contract);
    assert.equal(result.checkout_url, publicOrigin + '/__test/payment/private');
    assert.equal(result.other, f.session.origin); assert.equal(result.nested[0].tracking_url, publicOrigin + '/order/private?token=private');
    assert.equal(result.foreign.checkout_url, 'https://untrusted.example/private'); assert.equal(result.db_url, f.session.backendOrigin + '/rest/v1');
  } finally { await f.close(); }
});
