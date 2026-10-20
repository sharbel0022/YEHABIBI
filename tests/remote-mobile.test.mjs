import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../packages/api-client/index.ts';
import { safePaymentUrl } from '../packages/shared/pricing/index.ts';
import {
  createRemoteDeviceAuth, createRemoteTestFetch, remoteDeviceCredential, remoteTestConfiguration, remoteTestStorageKey,
} from '../apps/mobile/lib/remote-test.ts';

const origin = 'https://development.example-tailnet.ts.net:8443';
const token = 'a'.repeat(43);
const credential = remoteDeviceCredential(new Uint8Array(32).fill(91));
const configuration = remoteTestConfiguration({ requested: true, development: true, environment: 'test', apiUrl: origin });
const catalog = { dishes: [], menus: [], campaigns: [], delivery_zones: [], payment_methods: ['card'], settings: {}, demo: false, orders_enabled: true, test_mode: true };
const reference = { code: 'CM-TEST', token: 'b'.repeat(64) };
const order = { code: reference.code, status: 'approved', payment_status: 'pending', total_ore: 12300, items: [] };
const simulatorPath = '/__test/payment/lt_' + 'c'.repeat(64);
const expiration = () => new Date(Date.now() + 300000).toISOString();
const enrollment = { id: 'device_approved_1', comparison_code: '12345678', status: 'pending', expires_at: expiration() };
const basicAuth = (overrides = {}) => ({
  getSessionToken: async () => token, invalidateSession() {}, markUnavailable() {}, rejectDevice() { return new Error('denied'); }, generation: () => 0, ...overrides,
});
function deviceFixture(options = {}) {
  let saved = options.saved ?? null;
  let writes = 0, removals = 0;
  const storage = { read: async () => saved, write: async value => { saved = value; writes++; }, remove: async () => { saved = null; removals++; } };
  const auth = createRemoteDeviceAuth({ configuration, native: true, storage, randomBytes: async () => new Uint8Array(32).fill(91), ...options });
  return { auth, storage, saved: () => saved, writes: () => writes, removals: () => removals };
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('automatisk anslutning: första API-anropet ansluter utan lista, kod eller användaråtgärd och överlever Expo-omstart', async () => {
  const calls=[];
  const fetch=async(url,init)=>{
    calls.push({url,credential:JSON.parse(init.body).credential});
    return Response.json(url.endsWith('/enroll')?{id:'automatic_device',status:'approved'}:{token,expires_at:expiration()});
  };
  const first=deviceFixture({automatic:true,fetch});
  assert.equal(await first.auth.getSessionToken(),token);assert.equal(first.writes(),1);
  assert.deepEqual(calls.map(call=>call.url),[origin+'/__remote/device/enroll',origin+'/__remote/device/session']);
  assert.ok(calls.every(call=>call.credential===first.saved()));
  const resumed=deviceFixture({automatic:true,fetch,saved:first.saved()});
  assert.equal(await resumed.auth.getSessionToken(),token);assert.equal(resumed.writes(),0);
});

test('automatisk anslutning: tappat första svar återanvänder credential och återkallning stoppar automatiska försök', async()=>{
  let available=false,revoked=false,calls=0;
  const device=deviceFixture({automatic:true,fetch:async url=>{
    calls++;if(!available)throw new TypeError('offline');
    if(revoked)return Response.json({code:'device_revoked'},{status:401});
    return Response.json(url.endsWith('/enroll')?{id:'automatic_device',status:'approved'}:{token,expires_at:expiration()});
  }});
  await assert.rejects(device.auth.getSessionToken(),/Tailscale/);const saved=device.saved();
  available=true;assert.equal(await device.auth.getSessionToken(),token);assert.equal(device.saved(),saved);assert.equal(device.writes(),1);
  const revokedDevice=deviceFixture({automatic:true,saved,fetch:async()=>{calls++;return Response.json({code:'device_revoked'},{status:401});}});
  revoked=true;await assert.rejects(revokedDevice.auth.getSessionToken(),/återkallat/);
  const before=calls;await assert.rejects(revokedDevice.auth.getSessionToken());assert.equal(calls,before);
});

test('fjärrmobil: explicit utvecklingsläge, APP_ENV=test och exakt privat HTTPS-origin krävs', () => {
  assert.equal(configuration.enabled, true);
  for (const override of [
    { development: false }, { environment: 'production' }, { environment: 'preview' },
    { apiUrl: 'http://development.example-tailnet.ts.net' }, { apiUrl: 'https://public.example' },
    { apiUrl: `${origin}/api` }, { apiUrl: `${origin}?token=secret` },
    { apiUrl: 'https://development.example-tailnet.ts.net.attacker.example' },
    { apiUrl: 'https://secret@development.example-tailnet.ts.net' },
  ]) {
    const result = remoteTestConfiguration({ requested: true, development: true, environment: 'test', apiUrl: origin, ...override });
    assert.equal(result.enabled, false); assert.ok(result.error);
  }
  assert.equal(remoteTestConfiguration({ requested: false, development: false, environment: 'production', apiUrl: 'https://public.example' }).error, '');
});

test('fjärrmobil: kortlivad session på samtliga API-anrop och aldrig utanför godkänd origin', async () => {
  let count = 0;
  const transport = createRemoteTestFetch({ configuration, auth: basicAuth(), fetch: async (url, init) => {
    count++;
    assert.equal(new Headers(init.headers).get('X-Yehabibi-Remote-Token'), token);
    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    if (url.endsWith('/api/catalog')) return Response.json(catalog);
    if (url.includes('/api/payments/create')) return Response.json({ checkout_url: simulatorPath, payment_status: 'pending', test_mode: true });
    if (init.method === 'PATCH' && JSON.parse(init.body).action === 'register_push') return Response.json({ registered: true });
    if (url.endsWith('/api/orders') && init.method === 'POST') return Response.json({ ...reference, tracking_url: `${origin}/order/${reference.code}` });
    return Response.json({ order });
  } });
  const client = createApiClient({ baseUrl: origin, allowPrivateRemoteTest: true, fetch: transport });
  await client.getCatalog(); await client.createOrder({ request_id: 'synthetic-test' });
  await client.getOrderStatus(reference); await client.getPaymentStatus(reference);
  await client.acceptPriceChange(reference, 1); await client.registerOrderPush(reference, 'ExpoPushToken[synthetic]');
  assert.equal((await client.createPayment(reference, 'card')).checkout_url, `${origin}${simulatorPath}`);
  assert.equal(count, 7);
  for (const url of ['https://attacker.example/api/orders', `${origin}/__test/payment/anything`, `${origin.replace('https://', 'https://credential@')}/api/catalog`]) {
    await assert.rejects(transport(url), /godkända privata/);
  }
  assert.equal(count, 7);
});

test('fjärrmobil: produktionsanrop får ingen fjärrtestbehörighet eller SecureStore-läsning', async () => {
  let incoming, reads = 0;
  const disabled = remoteTestConfiguration({ requested: false, development: false, environment: 'production', apiUrl: 'https://public.example' });
  const auth = basicAuth({ getSessionToken: async () => { reads++; return token; } });
  const transport = createRemoteTestFetch({ configuration: disabled, auth, fetch: async (_url, init) => { incoming = init; return Response.json(catalog); } });
  await transport('https://public.example/api/catalog', { headers: { Accept: 'application/json' } });
  assert.equal(new Headers(incoming.headers).get('X-Yehabibi-Remote-Token'), null);
  assert.equal(reads, 0);
  const device = deviceFixture({ configuration: disabled, storage: { read: async () => { reads++; return credential; }, write: async () => {}, remove: async () => {} } });
  await assert.rejects(device.auth.load(), /avstängd/); assert.equal(reads, 0);
});

test('fjärrmobil: privata minnen isoleras från produktion, gamla sessioner och andra testbackender', () => {
  for (const key of ['cedar-mezze-orders-v1', 'cedar-mezze-selection-v4', 'cedar-mezze-request-v1', 'cedar-mezze-remote-device-v443']) {
    const first = remoteTestStorageKey(key, origin), second = remoteTestStorageKey(key, 'https://other.example-tailnet.ts.net:8443');
    assert.notEqual(first, key); assert.notEqual(first, second);
    assert.match(first, /^[A-Za-z0-9._-]+$/);
  }
  assert.notEqual(remoteTestStorageKey('cedar-mezze-remote-device-v443', origin), remoteTestStorageKey('cedar-mezze-remote-session-v442', origin));
});

test('fjärrmobil: produktionskatalog och betalning utan verifierad testkatalog blockeras', async () => {
  const client = createApiClient({ baseUrl: origin, allowPrivateRemoteTest: true, fetch: async () => Response.json({ ...catalog, test_mode: false }) });
  await assert.rejects(client.getCatalog(), /isolerat testläge/);
  await assert.rejects(client.createPayment(reference, 'card'), /verifiera testmenyn/);
});

test('fjärrmobil: gamla localhost-spärren består och privat simulator kräver separat opt-in', () => {
  assert.equal(safePaymentUrl(simulatorPath, origin, true), null);
  assert.equal(safePaymentUrl(simulatorPath, origin, true, true), `${origin}${simulatorPath}`);
  for (const url of [`${origin}/admin`, `${origin}${simulatorPath}?token=secret`, `${origin}${simulatorPath}#fragment`, `https://other.example-tailnet.ts.net:8443${simulatorPath}`, `https://attacker.example${simulatorPath}`]) {
    assert.equal(safePaymentUrl(url, origin, true, true), null);
  }
  assert.equal(safePaymentUrl(simulatorPath, 'https://public.example', true, true), null);
  assert.equal(safePaymentUrl(simulatorPath, 'http://127.0.0.1:3000', true), `http://127.0.0.1:3000${simulatorPath}`);
});

test('enhetsregistrering: 256 bitar base64url utan padding eller Math.random', () => {
  const bytes = new Uint8Array(Array.from({ length: 32 }, (_, index) => index));
  assert.equal(remoteDeviceCredential(bytes), Buffer.from(bytes).toString('base64url'));
  assert.equal(credential.length, 43);
  assert.throws(() => remoteDeviceCredential(new Uint8Array(31)), /32/);
});

test('enhetsregistrering: explicit första anrop sparar credential före nätverket och återanvänder förlorat svar', async () => {
  let calls = 0;
  const device = deviceFixture({ fetch: async (url, init) => {
    calls++;
    assert.equal(url, `${origin}/__remote/device/enroll`);
    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    assert.equal(new Headers(init.headers).get('X-Yehabibi-Remote-Token'), null);
    assert.deepEqual(JSON.parse(init.body), { credential });
    assert.equal(device.saved(), credential);
    if (calls === 1) throw new TypeError('response lost after gateway enrollment');
    return Response.json(enrollment);
  } });
  assert.equal(await device.auth.load(), false); assert.equal(calls, 0);
  await assert.rejects(device.auth.enroll(), /Tailscale/);
  assert.equal(device.saved(), credential); assert.equal(device.writes(), 1);
  const restarted = deviceFixture({ storage: device.storage, fetch: async (url, init) => {
    assert.equal(JSON.parse(init.body).credential, credential);
    return Response.json(enrollment);
  } });
  assert.deepEqual(await restarted.auth.enroll(), enrollment);
  assert.equal(restarted.auth.getState().status, 'pending');
  assert.deepEqual(await device.auth.enroll(), enrollment); assert.equal(device.writes(), 1);
});

test('enhetsregistrering: Expo Go native krävs, ingen browser fallback och ingen automatisk nyregistrering', async () => {
  let calls = 0, writes = 0;
  const device = deviceFixture({ native: false, fetch: async () => { calls++; return Response.json(enrollment); },
    storage: { read: async () => null, write: async () => { writes++; }, remove: async () => {} } });
  await assert.rejects(device.auth.enroll(), /SecureStore/);
  await assert.rejects(device.auth.load(), /SecureStore/);
  assert.equal(calls, 0); assert.equal(writes, 0);
  const fresh = deviceFixture({ fetch: async () => { calls++; return Response.json(enrollment); } });
  await assert.rejects(fresh.auth.getSessionToken(), /första gången/);
  assert.equal(calls, 0); assert.equal(fresh.saved(), null);
});

test('enhetssession: godkänd SecureStore-credential ansluter automatiskt efter processomstart', async () => {
  let requests = 0;
  const device = deviceFixture({ saved: credential, fetch: async (url, init) => {
    requests++;
    assert.equal(url, `${origin}/__remote/device/session`);
    assert.equal(JSON.parse(init.body).credential, credential);
    return Response.json({ token, expires_at: expiration() });
  } });
  assert.equal(await device.auth.getSessionToken(), token);
  assert.equal(device.auth.getState().status, 'approved'); assert.equal(requests, 1);
  assert.equal(await device.auth.getSessionToken(), token); assert.equal(requests, 1);
  assert.equal(device.saved(), credential); assert.equal(device.writes(), 0);
  // Ny runtime simulerar app-/Expo-omstart; det är inget påstående om fysisk telefon eller Windows-omstart.
  const restarted = deviceFixture({ storage: device.storage, fetch: async () => Response.json({ token: 'b'.repeat(43), expires_at: expiration() }) });
  assert.equal(await restarted.auth.getSessionToken(), 'b'.repeat(43));
});

test('enhetssession: kortlivad session förnyas före utgång och parallella anrop delar samma förnyelse', async () => {
  let now = Date.now(), requests = 0;
  const gate = deferred();
  const device = deviceFixture({ saved: credential, now: () => now, fetch: async () => {
    requests++;
    if (requests === 2) await gate.promise;
    return Response.json({ token: String(requests).repeat(43), expires_at: new Date(now + 120000).toISOString() });
  } });
  assert.equal(await device.auth.getSessionToken(), '1'.repeat(43));
  now += 91000;
  const attempts = [device.auth.getSessionToken(), device.auth.getSessionToken(), device.auth.getSessionToken()];
  await new Promise(resolve => setImmediate(resolve)); assert.equal(requests, 2);
  gate.resolve();
  assert.deepEqual(await Promise.all(attempts), Array(3).fill('2'.repeat(43)));
  assert.equal(device.writes(), 0);
});

test('enhetssession: återkallad, ogiltig och väntande credential behålls och ger begripligt meddelande', async () => {
  for (const code of ['device_revoked', 'device_invalid', 'device_pending']) {
    let requests = 0;
    const device = deviceFixture({ saved: credential, fetch: async () => { requests++; return Response.json({ error: 'do not trust raw message', code }, { status: 401 }); } });
    await assert.rejects(device.auth.getSessionToken(), reason => reason.status === 401 && /telefon|Telefon/.test(reason.message));
    assert.equal(device.saved(), credential); assert.equal(device.removals(), 0);
    if (code !== 'device_pending') {
      await assert.rejects(device.auth.getSessionToken(), /telefon|Telefon/);
      assert.equal(requests, 1); // Ingen automatisk återregistrering av återkallad enhet.
    }
  }
});

test('enhetssession: nätverk/Tailscale/403 förlorar aldrig registreringen och nästa försök återansluter', async () => {
  for (const failure of ['network', 'tailscale']) {
    let available = false;
    const device = deviceFixture({ saved: credential, fetch: async () => {
      if (!available) {
        if (failure === 'network') throw new TypeError('offline');
        return Response.json({ error: 'missing proxy identity' }, { status: 403 });
      }
      return Response.json({ token, expires_at: expiration() });
    } });
    await assert.rejects(device.auth.getSessionToken(), /Tailscale/);
    assert.equal(device.saved(), credential); assert.equal(device.auth.getState().status, 'unavailable');
    available = true;
    assert.equal(await device.auth.getSessionToken(), token); assert.equal(device.auth.getState().status, 'approved');
  }
});

test('fjärrmobil: endast märkt gateway-401 spelas om en gång, aldrig kundorders-401 eller nätverksfel', async () => {
  let sessions = 0, invalidations = 0, requests = 0;
  const auth = basicAuth({ getSessionToken: async () => String(++sessions).repeat(43), invalidateSession: () => { invalidations++; } });
  const transport = createRemoteTestFetch({ configuration, auth, fetch: async (_url, init) => {
    requests++;
    assert.equal(JSON.parse(init.body).request_id, 'stable-request');
    if (requests === 1) return Response.json({ code: 'remote_session_invalid' }, { status: 401 });
    assert.equal(new Headers(init.headers).get('X-Yehabibi-Remote-Token'), '2'.repeat(43));
    return Response.json(catalog);
  } });
  assert.equal((await transport(`${origin}/api/orders`, { method: 'POST', body: JSON.stringify({ request_id: 'stable-request' }) })).status, 200);
  assert.equal(requests, 2); assert.equal(sessions, 2); assert.equal(invalidations, 1);
  for (const failure of ['customer-401', 'network', 'gateway-401-twice']) {
    let count = 0;
    const fetch = createRemoteTestFetch({ configuration, auth: basicAuth(), fetch: async () => {
      count++;
      if (failure === 'network') throw new TypeError('lost response');
      return Response.json({ code: failure === 'gateway-401-twice' ? 'remote_session_invalid' : 'order_token_invalid' }, { status: 401 });
    } });
    if (failure === 'customer-401') assert.equal((await fetch(`${origin}/api/orders`)).status, 401);
    else await assert.rejects(fetch(`${origin}/api/orders`), /Tailscale|Testsessionen/);
    assert.equal(count, failure === 'gateway-401-twice' ? 2 : 1);
  }
});

test('fjärrmobil: API-403 och nätverksfel låser kundskärmar utan att glömma credential', async () => {
  for (const failure of ['403', 'network']) {
    const device = deviceFixture({ saved: credential, fetch: async () => Response.json({ token, expires_at: expiration() }) });
    await device.auth.getSessionToken();
    const fetch = createRemoteTestFetch({ configuration, auth: device.auth, fetch: async () => {
      if (failure === 'network') throw new TypeError('offline');
      return Response.json({ error: 'forbidden' }, { status: 403 });
    } });
    await assert.rejects(fetch(`${origin}/api/catalog`), /Tailscale/);
    assert.equal(device.auth.getState().status, 'unavailable'); assert.equal(device.saved(), credential);
  }
});

test('enhetsregistrering: låsning och glömning vinner över försenade sessioner och registreringssvar', async () => {
  for (const operation of ['session', 'enroll']) {
    const gate = deferred();
    const device = deviceFixture({ saved: credential, fetch: async () => {
      await gate.promise;
      return Response.json(operation === 'session' ? { token, expires_at: expiration() } : enrollment);
    } });
    const pending = operation === 'session' ? device.auth.getSessionToken() : device.auth.enroll();
    await new Promise(resolve => setImmediate(resolve));
    await device.auth.forget();
    gate.resolve();
    await assert.rejects(pending, reason => reason.kind === 'aborted');
    assert.equal(device.saved(), null); assert.equal(device.auth.getState().status, 'unregistered');
  }
  const gate = deferred();
  const device = deviceFixture({ saved: credential, fetch: async () => { await gate.promise; return Response.json({ token, expires_at: expiration() }); } });
  const pending = device.auth.getSessionToken(); await new Promise(resolve => setImmediate(resolve));
  device.auth.lock(); gate.resolve();
  await assert.rejects(pending, reason => reason.kind === 'aborted');
  assert.equal(device.auth.getState().status, 'locked'); assert.equal(device.saved(), credential);
});

test('enhetsregistrering: glömning väntar på pågående SecureStore-skrivning så hemligheten verkligen tas bort', async () => {
  const gate = deferred();
  let saved = null, requests = 0;
  const device = deviceFixture({ storage: {
    read: async () => null,
    write: async value => { await gate.promise; saved = value; },
    remove: async () => { saved = null; },
  }, fetch: async () => { requests++; return Response.json(enrollment); } });
  const enrollmentAttempt = device.auth.enroll(); await new Promise(resolve => setImmediate(resolve));
  const forgetAttempt = device.auth.forget(); gate.resolve();
  await assert.rejects(enrollmentAttempt, reason => reason.kind === 'aborted');
  await forgetAttempt;
  assert.equal(saved, null); assert.equal(requests, 0); assert.equal(device.auth.getState().status, 'unregistered');
});

test('fjärrmobil: en försenad API-förfrågan kan inte återansluta efter att appen låsts', async () => {
  const gate = deferred();
  const device = deviceFixture({ saved: credential, fetch: async () => Response.json({ token, expires_at: expiration() }) });
  const fetch = createRemoteTestFetch({ configuration, auth: device.auth, fetch: async () => { await gate.promise; return Response.json(catalog); } });
  const pending = fetch(`${origin}/api/catalog`); await new Promise(resolve => setImmediate(resolve));
  device.auth.lock(); gate.resolve();
  await assert.rejects(pending, reason => reason.kind === 'aborted');
  assert.equal(device.auth.getState().status, 'locked');
});

test('enhetsregistrering: godkänd enroll utan jämförelsekod går direkt till kortlivad session', async () => {
  const device = deviceFixture({ saved: credential, fetch: async url => Response.json(url.endsWith('/enroll')
    ? { id: enrollment.id, status: 'approved' } : { token, expires_at: expiration() }) });
  assert.deepEqual(await device.auth.enroll(), { id: enrollment.id, status: 'approved' });
  assert.equal(await device.auth.getSessionToken(), token);
});

test('fjärrmobil: återkallelse på ett pågående kund-API låser appen omedelbart utan replay', async () => {
  let requests = 0;
  const device = deviceFixture({ saved: credential, fetch: async () => Response.json({ token, expires_at: expiration() }) });
  await device.auth.getSessionToken();
  const late = deferred();
  const fetch = createRemoteTestFetch({ configuration, auth: device.auth, fetch: async url => {
    requests++;
    if (url.endsWith('/catalog')) return Response.json({ code: 'device_revoked' }, { status: 401 });
    await late.promise;
    return Response.json({ order });
  } });
  const older = fetch(`${origin}/api/orders/CM-TEST`);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(fetch(`${origin}/api/catalog`), reason => reason.status === 401 && /återkallat/.test(reason.message));
  late.resolve();
  await assert.rejects(older, reason => reason.kind === 'aborted');
  assert.equal(device.auth.getState().status, 'revoked'); assert.equal(device.saved(), credential); assert.equal(requests, 2);
});

test('enhetsregistrering: glömning blockerar unlock och förnyelse tills SecureStore-radering har avslutats', async () => {
  const gate = deferred();
  let saved = credential, requests = 0;
  const device = deviceFixture({ storage: {
    read: async () => saved,
    write: async value => { saved = value; },
    remove: async () => { await gate.promise; saved = null; },
  }, fetch: async () => { requests++; return Response.json({ token, expires_at: expiration() }); } });
  await device.auth.getSessionToken();
  assert.equal(requests, 1);
  const forgetting = device.auth.forget();
  device.auth.unlock();
  assert.equal(device.auth.getState().status, 'locked');
  assert.equal(device.auth.getState().forgetting, true);
  await assert.rejects(device.auth.load(), /tas bort/);
  await assert.rejects(device.auth.enroll(), /tas bort/);
  await assert.rejects(device.auth.getSessionToken(), /tas bort/);
  assert.equal(requests, 1);
  gate.resolve(); await forgetting;
  assert.equal(saved, null); assert.equal(device.auth.getState().forgetting, false);
  assert.equal(device.auth.getState().status, 'unregistered');
  await assert.rejects(device.auth.getSessionToken(), /första gången/);
  assert.equal(requests, 1);
});

test('fjärrmobil: försenad 401-body kan inte återkalla eller ändra låst/glömd app', async () => {
  for (const phase of ['first', 'second']) {
    for (const action of ['lock', 'forget']) {
      const body = deferred();
      const reading = deferred();
      let requests = 0;
      const device = deviceFixture({ saved: credential, fetch: async () => Response.json({ token, expires_at: expiration() }) });
      const fetch = createRemoteTestFetch({ configuration, auth: device.auth, fetch: async () => {
        requests++;
        if (phase === 'second' && requests === 1) return Response.json({ code: 'remote_session_invalid' }, { status: 401 });
        return { status: 401, clone: () => ({ json: async () => { reading.resolve(); await body.promise; return { code: 'device_revoked' }; } }) };
      } });
      const pending = fetch(`${origin}/api/catalog`);
      await reading.promise;
      if (action === 'forget') await device.auth.forget();
      else device.auth.lock();
      const previous = device.auth.getState();
      body.resolve();
      await assert.rejects(pending, reason => reason.kind === 'aborted');
      assert.equal(device.auth.getState(), previous);
      assert.equal(device.auth.getState().status, action === 'forget' ? 'unregistered' : 'locked');
      assert.equal(device.saved(), action === 'forget' ? null : credential);
    }
  }
});
