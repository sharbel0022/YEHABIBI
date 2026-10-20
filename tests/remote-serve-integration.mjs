// Opt-in transport test: real private Tailscale Serve, a synthetic isolated
// upstream and a disposable device registry. This does not test a phone or the full app.
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createDeviceRegistry } from '../test-support/remote/devices.mjs';
import { startRemoteGateway } from '../test-support/remote/gateway.mjs';
import { assertUnusedServePort, ownsServePort, releaseServe, tailscale, tailscaleJson } from '../test-support/remote/tailscale.mjs';

const port = 8444, secret = () => randomBytes(32).toString('base64url');
const directory = mkdtempSync(join(tmpdir(), 'yehabibi-real-serve-test-'));
let gateway, upstream, backend, lease, stage = 'initialization';

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
async function unmount() {
  if (!lease) return;
  const config = await tailscaleJson(['serve', 'status', '--json']);
  if (ownsServePort(config, lease)) await releaseServe(lease);
  else {
    // An absent lease needs no change. An externally modified port must remain untouched.
    assertUnusedServePort(config, port);
  }
  lease = null;
}

try {
  stage = 'private Tailscale readiness';
  const status = await tailscaleJson(['status', '--json']);
  const dns = String(status.Self?.DNSName || '').replace(/\.$/, '').toLowerCase();
  const login = status.User?.[String(status.Self?.UserID)]?.LoginName?.toLowerCase();
  assert.ok(status.BackendState === 'Running' && status.Self?.Online === true, 'A logged-in private Tailscale connection is required.');
  assert.ok(/^[a-z\d-]+\.[a-z\d-]+\.ts\.net$/.test(dns) && status.CertDomains?.includes(dns), 'Private MagicDNS HTTPS is required.');
  assert.ok(typeof login === 'string' && typeof status.Self.ID === 'string' && status.Self.TailscaleIPs?.length, 'The local Tailscale identity is required.');
  assertUnusedServePort(await tailscaleJson(['serve', 'status', '--json']), port);

  const publicOrigin = `https://${dns}:${port}`, isolationId = randomUUID(), registryFile = join(directory, 'devices.json');
  let registry = createDeviceRegistry({ file: registryFile });
  upstream = await listen((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/__test/ready') return response.end(JSON.stringify({ isolation_id: isolationId }));
    if (request.url === '/api/catalog') return response.end(JSON.stringify({ synthetic_transport_test: true }));
    response.statusCode = 404; response.end(JSON.stringify({ error: 'Synthetic transport test only.' }));
  });
  backend = await listen((_request, response) => { response.writeHead(404); response.end(); });
  const controlSecret = randomBytes(32).toString('hex');
  const session = { marker: 'YEHABIBI_ISOLATED_LOCAL_TEST', isolationId, origin: upstream.origin, backendOrigin: backend.origin, controlSecret,
    webEnv: { APP_ENV: 'test', NODE_ENV: 'development', PAYMENTS_ENABLED: 'false', PAYMENTS_LIVE_APPROVED: 'false',
      TEST_ISOLATION_ID: isolationId, TEST_PAYMENT_SECRET: controlSecret, TEST_BACKEND_ORIGIN: backend.origin,
      NEXT_PUBLIC_SUPABASE_URL: backend.origin, NEXT_PUBLIC_SITE_URL: upstream.origin } };
  let observedIdentity = null;
  // This resolver is solely for a PC transport self-test. Production deliberately
  // approves selected phone peers through the live netmap instead of accepting Self.
  const resolveIdentity = async ({ sourceIp, login: observedLogin }) => {
    observedIdentity = { sourceIp, login: observedLogin };
    return status.Self.TailscaleIPs.includes(sourceIp) && observedLogin === login ? { nodeId: status.Self.ID, login } : null;
  };
  async function mount() {
    assertUnusedServePort(await tailscaleJson(['serve', 'status', '--json']), port);
    gateway = await startRemoteGateway({ session, publicOrigin, allowedLogins: [login], accessToken: secret(), adminToken: secret(), trustVerifiedPhones:true,
      proxySecret: secret(), deviceRegistry: registry, resolveIdentity });
    lease = { dns, port, target: gateway.origin };
    // CLI output includes the private backend target, so it is intentionally not printed.
    await tailscale(['serve', '--bg', `--https=${port}`, gateway.origin]);
    assert.ok(ownsServePort(await tailscaleJson(['serve', 'status', '--json']), lease), 'The test must own exactly its Serve lease.');
  }
  async function request(path, { credential, token, forged = false, method } = {}) {
    const headers = { ...(credential ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Yehabibi-Remote-Token': token } : {}),
      ...(forged ? { 'Tailscale-User-Login': 'forged-user@example.test', 'Tailscale-User-Name': 'Forged User',
        'X-Forwarded-For': '100.127.255.254', 'X-Forwarded-Proto': 'http', 'Tailscale-Node-ID': 'n-forged-node', 'X-Tailscale-Node-ID': 'n-forged-node' } : {}) };
    const response = await fetch(publicOrigin + path, { method: method || (credential ? 'POST' : 'GET'), headers,
      ...(credential ? { body: JSON.stringify({ credential }) } : {}), redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    return { status: response.status, data };
  }
  stage = 'owned Serve setup';
  await mount();
  console.log('PASS: real private Serve started on an unused test port with an isolated synthetic upstream.');

  stage = 'Serve overwrites forged identity and forwarding headers';
  const credential = secret();
  const enrollment = await request('/__remote/device/enroll', { credential, forged: true });
  assert.ok(enrollment.status === 200 && enrollment.data.status === 'approved' && !enrollment.data.comparison_code, 'Real Serve must authenticate automatically without a comparison code.');
  assert.ok(observedIdentity?.login === login && status.Self.TailscaleIPs.includes(observedIdentity?.sourceIp), 'Observed identity must be the actual local Serve caller.');
  const pending = registry.list();
  assert.ok(pending.length === 1 && pending[0].nodeId === status.Self.ID && pending[0].login === login, 'Enrollment must bind only the verified caller identity.');
  const authorization = await request('/__remote/device/session', { credential, forged: true });
  assert.ok(authorization.status === 200 && typeof authorization.data.token === 'string', 'Approved local identity must obtain a customer session.');
  const initialToken = authorization.data.token;
  const catalog = await request('/api/catalog', { token: initialToken, forged: true });
  assert.ok(catalog.status === 200 && catalog.data.synthetic_transport_test === true, 'Customer session must reach the synthetic catalog through actual Serve.');
  console.log('PASS: real Serve sanitized forged headers and authenticated automatically without a code or local approval.');

  stage = 'bare loopback proxy spoofing';
  const direct = await new Promise((resolve, reject) => {
    const outgoing = http.request(new URL(gateway.origin).origin + '/api/catalog', { headers: { Host: new URL(publicOrigin).host,
      'Tailscale-User-Login': login, 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': status.Self.TailscaleIPs[0], 'X-Yehabibi-Remote-Token': initialToken } }, response => {
      response.resume(); response.once('end', () => resolve(response.statusCode));
    });
    outgoing.once('error', reject); outgoing.end();
  });
  assert.ok(direct === 403, 'Forged direct loopback headers must not cross the private Serve boundary.');
  console.log('PASS: bare loopback requests with forged trusted headers were denied.');

  stage = 'customer privilege separation';
  for (const path of ['/api/admin/settings', '/admin/orders', '/__test/login']) {
    const blocked = await request(path, { token: initialToken });
    assert.ok(blocked.status === 401, 'Registered customer devices must not receive admin authorization.');
  }
  for (const path of ['/api/internal/jobs', '/api/payments/webhook', '/rest/v1/orders']) {
    const blocked = await request(path, { token: initialToken, method: 'POST' });
    assert.ok(blocked.status === 404, 'Internal jobs, payment callbacks and database routes must remain blocked.');
  }
  const simulator = await request('/__test/payment/lt_' + 'a'.repeat(64) + '/simulate', { token: initialToken, method: 'POST' });
  assert.ok(simulator.status === 401, 'Customer registration must not authorize test payment simulation.');
  console.log('PASS: customer sessions could not reach admin, payment simulation, internal jobs or database routes.');

  stage = 'gateway and Serve restart';
  await unmount(); await gateway.close(); gateway = null;
  registry = createDeviceRegistry({ file: registryFile });
  await mount();
  const expired = await request('/api/catalog', { token: initialToken });
  assert.ok(expired.status === 401 && expired.data.code === 'remote_session_invalid', 'A restarted gateway must reject its old in-memory session.');
  const resumed = await request('/__remote/device/session', { credential });
  assert.ok(resumed.status === 200 && typeof resumed.data.token === 'string', 'Persistent device approval must issue a fresh session after restart.');
  const afterRestart = await request('/api/catalog', { token: resumed.data.token });
  assert.ok(afterRestart.status === 200, 'A resumed device must reach the catalog after gateway and Serve restart.');
  console.log('PASS: gateway and Serve restart preserved approval and issued a fresh short customer session.');

  stage = 'immediate local revocation';
  createDeviceRegistry({ file: registryFile }).revoke(enrollment.data.id);
  const revokedSession = await request('/api/catalog', { token: resumed.data.token });
  const revokedCredential = await request('/__remote/device/session', { credential });
  assert.ok(revokedSession.status === 401 && revokedSession.data.code === 'device_revoked', 'Local revoke must invalidate an active session immediately.');
  assert.ok(revokedCredential.status === 401 && revokedCredential.data.code === 'device_revoked', 'A revoked credential must remain denied.');
  const newCredential=await request('/__remote/device/enroll',{credential:secret()});
  assert.ok(newCredential.status===401&&newCredential.data.code==='device_revoked','Revoked phone must not bypass denial by generating a new credential.');
  console.log('PASS: local revocation immediately blocked both active session and persistent credential.');
} catch {
  // Error payloads and assertion values may contain private tailnet metadata.
  console.error(`FAIL: real private Serve transport test at stage: ${stage}.`);
  process.exitCode = 1;
} finally {
  let cleanupFailed = false;
  try { await unmount(); } catch { cleanupFailed = true; }
  try { await gateway?.close(); } catch { cleanupFailed = true; }
  try { await upstream?.close(); } catch { cleanupFailed = true; }
  try { await backend?.close(); } catch { cleanupFailed = true; }
  if (!cleanupFailed) {
    assert.equal(dirname(resolve(directory)),resolve(tmpdir()),'Cleanup must stay inside the test temporary directory.');
    rmSync(directory, { recursive: true, force: true });
    console.log('PASS: only the owned test Serve lease and disposable test files were removed.');
  } else {
    console.error('FAIL: test cleanup needs review; unrelated Serve configuration was left unchanged.');
    process.exitCode = 1;
  }
}
