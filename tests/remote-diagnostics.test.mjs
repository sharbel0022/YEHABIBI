import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPhoneConnection, createIngressRecorder } from '../test-support/remote/diagnostics.mjs';

const now = Date.parse('2026-10-20T12:00:00Z');
const online = { Online: true, Active: true, LastHandshake: '0001-01-01T00:00:00Z', RxBytes: 0, TxBytes: 312 };
const observed = { lastPhoneRequestAt: new Date(now - 1000).toISOString(), lastPhoneAuthenticatedApiAt: new Date(now - 1000).toISOString(), lastPhoneStatus: 200 };

test('datorns samtliga självkontroller kan aldrig ensamma verifiera telefonen', () => {
  const result = classifyPhoneConnection({ peer: online, pcHttpsSelfCheck: true, now });
  assert.equal(result.pcHttpsSelfCheck, true); assert.equal(result.ready, false);
  assert.equal(result.code, 'phone_not_verified'); assert.equal(result.phoneHttpObserved, false);
  assert.ok(result.blockers.length);
});

test('offline och saknad telefon blockerar även efter tidigare lyckade anrop eller lyckad peer-ping', () => {
  for (const peer of [null, { ...online, Online: false, Active: true }]) {
    const result = classifyPhoneConnection({ peer, pcHttpsSelfCheck: true, transportReachable: true, transportCheckedAt: now,
      ingress: observed, now });
    assert.equal(result.ready, false); assert.ok(result.blockers.length);
    assert.equal(result.code, peer ? 'phone_offline' : 'phone_missing');
  }
});

test('aktuell krypterad peer-transport verifierar inte Safari eller autentiserat API; gammal ping ignoreras', () => {
  const transport = classifyPhoneConnection({ peer: online, transportReachable: true, transportCheckedAt: now, now });
  assert.equal(transport.transportVerified, true); assert.equal(transport.ready, false);
  assert.equal(transport.code, 'phone_transport_only');
  assert.equal(transport.authenticatedPhoneApiObserved, false);
  const stale = classifyPhoneConnection({ peer: online, transportReachable: true, transportCheckedAt: now - 121000, now });
  assert.equal(stale.transportVerified, false); assert.equal(stale.code, 'phone_not_verified');
});

test('telefonens HTTPS-ankomst, nekat sessionsskydd och lyckat autentiserat API ger skilda utfall', () => {
  const incoming = classifyPhoneConnection({ peer: online, ingress: { lastPhoneRequestAt: observed.lastPhoneRequestAt, lastPhoneStatus: 200 }, now });
  assert.equal(incoming.code, 'phone_https_observed'); assert.equal(incoming.ready, false);
  const denied = classifyPhoneConnection({ peer: online, ingress: { ...observed, lastPhoneStatus: 401 }, now });
  assert.equal(denied.code, 'phone_gateway_denied'); assert.equal(denied.ready, false);
  const badBackend = classifyPhoneConnection({ peer: online, ingress: { ...observed, lastPhoneStatus: 502 }, now });
  assert.equal(badBackend.code, 'phone_backend_error'); assert.equal(badBackend.ready, false);
  const working = classifyPhoneConnection({ peer: online, ingress: observed, now });
  assert.equal(working.code, 'authenticated_api_observed'); assert.equal(working.ready, true);
  assert.match(working.message, /inte Expo Go eller ett fysiskt/);
});

test('gamla och framtida telefonobservationer kan inte ge godkänt resultat', () => {
  for (const offset of [-121000, 60000]) {
    const at = new Date(now + offset).toISOString();
    const result = classifyPhoneConnection({ peer: online, ingress: { ...observed, lastPhoneRequestAt: at, lastPhoneAuthenticatedApiAt: at }, now });
    assert.equal(result.ready, false); assert.equal(result.authenticatedPhoneApiObserved, false);
  }
  const malformed = classifyPhoneConnection({ peer: online, ingress: { lastPhoneRequestAt: 1e100, lastPhoneAuthenticatedApiAt: 'PRIVATE_TOKEN' }, now });
  assert.equal(malformed.ready, false); assert.equal(malformed.lastPhoneRequestAt, null);
  assert.equal(JSON.stringify(malformed).includes('PRIVATE_TOKEN'), false);
});

test('ingress skiljer telefon, PC och okänd källa utan att spara IP, URL, headers, nycklar eller användaridentitet', () => {
  let clock = now;
  const recorder = createIngressRecorder({ phoneIps: ['100.64.1.2', 'fd7a:115c:a1e0::2'], selfIps: ['100.64.1.1'], now: () => clock });
  recorder.record({ sourceIp: '100.64.1.1', routeFamily: 'catalog', status: 200, authenticatedApi: true });
  assert.equal(recorder.snapshot().lastPhoneAuthenticatedApiAt, null, 'PC-självtest får inte räknas som telefonanrop.');
  recorder.record({ sourceIp: '::ffff:100.64.1.2', routeFamily: 'login', status: 200, authenticatedApi: true });
  assert.equal(recorder.snapshot().lastPhoneAuthenticatedApiAt, null, 'Inloggningssidan är inte ett autentiserat kund-API.');
  clock++;
  recorder.record({ sourceIp: '100.64.1.2', routeFamily: 'catalog', status: 401, rejection: 'session', authenticatedApi: true });
  assert.equal(recorder.snapshot().lastPhoneAuthenticatedApiAt, null, 'Nekad åtkomst får inte räknas som autentiserat API.');
  clock++;
  recorder.record({ sourceIp: 'fd7a:115c:a1e0:0:0:0:0:2', routeFamily: 'catalog', status: 200, authenticatedApi: true });
  recorder.record({ sourceIp: '100.64.1.2, 100.64.1.1', routeFamily: '/order/private?token=VERY_PRIVATE',
    status: 403, rejection: 'SECRET_LOGIN@example.test', headers: { token: 'PRIVATE_KEY' } });
  const snapshot = recorder.snapshot();
  assert.equal(snapshot.phoneRequests, 3); assert.equal(snapshot.selfRequests, 1); assert.equal(snapshot.unknownRequests, 1);
  assert.equal(snapshot.deniedPhoneRequests, 1); assert.equal(snapshot.lastPhoneStatus, 200);
  assert.equal(snapshot.lastPhoneAuthenticatedApiAt, new Date(clock).toISOString());
  for (const forbidden of ['100.64.', 'fd7a:', 'VERY_PRIVATE', 'SECRET_LOGIN', 'PRIVATE_KEY', '/order/', 'token=']) {
    assert.equal(JSON.stringify(snapshot).includes(forbidden), false, forbidden);
  }
});

test('ingresshistoriken är begränsad och snapshot kan inte ändra intern evidens', () => {
  const recorder = createIngressRecorder({ phoneIps: ['100.64.1.2'], now: () => now });
  for (let n = 0; n < 100; n++) recorder.record({ sourceIp: '100.64.1.2', routeFamily: 'catalog', status: 200, authenticatedApi: true });
  const first = recorder.snapshot(); assert.equal(first.recent.length, 20); assert.equal(first.phoneRequests, 100);
  first.recent[0].category = 'tampered'; first.phoneRequests = 0;
  assert.equal(recorder.snapshot().recent[0].category, 'catalog'); assert.equal(recorder.snapshot().phoneRequests, 100);
});
