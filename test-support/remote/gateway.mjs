import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { equalSecret, remoteContract, remoteCookieName, remoteMarker, remoteTokenHeader, remoteUrl, rewriteCustomerUrls, routePolicy, syntheticOrder } from './contract.mjs';
import { createIngressRecorder } from './diagnostics.mjs';
import { deviceError } from './devices.mjs';

const securityHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' };
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const json = (response, status, data, headers = {}) => { response.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json', ...headers }); response.end(JSON.stringify(data)); };
const routeFamily = pathname => pathname.startsWith('/__remote/login') || pathname === '/__remote/logout' ? 'login'
  : pathname.startsWith('/__remote/device/') ? 'login'
  : pathname === '/api/catalog' ? 'catalog' : pathname === '/api/availability' ? 'availability'
  : pathname.startsWith('/api/orders') || pathname.startsWith('/order/') ? 'orders'
  : pathname.startsWith('/api/payments/') || pathname.startsWith('/__test/payment/') ? 'payment'
  : pathname.startsWith('/admin') || pathname.startsWith('/api/admin/') || pathname === '/__test/login' ? 'admin'
  : pathname === '/__remote/health' || pathname === '/api/health' ? 'health' : 'other';

async function readBody(request, limit = 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) { const error = new Error('För stort testanrop.'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function requestPath(request, contract) {
  if (!request.url?.startsWith('/') || request.url.startsWith('//')) throw new Error('Ogiltig sökväg.');
  const rawPath = request.url.split('?')[0];
  if (/%(?:2f|5c|25|00)/i.test(rawPath) || rawPath.includes('\\')) throw new Error('Otillåten kodad sökväg.');
  const decoded = decodeURIComponent(rawPath);
  if (decoded.split('/').some(part => part === '.' || part === '..') || /[\x00-\x20]/.test(decoded)) throw new Error('Ogiltig sökväg.');
  const url = new URL(request.url, contract.publicOrigin);
  return { pathname: decoded, target: url.pathname + url.search };
}

/** Target only this loopback listener with private Tailscale Serve, never Funnel.
 * Serve removes incoming identity spoofing headers before setting Tailscale-User-Login.
 * https://tailscale.com/docs/features/tailscale-serve#identity-headers
 */
export async function startRemoteGateway(options) {
  const contract = remoteContract(options), sessions = new Map(), failures = new Map(), deviceSessions = new Map(), enrollmentAttempts = new Map(), sessionAttempts = new Map();
  const { deviceRegistry, resolveIdentity, proxySecret } = options;
  if ((proxySecret && !/^[A-Za-z\d_-]{43}$/.test(proxySecret)) || (deviceRegistry && !proxySecret)) throw new Error('En privat Tailscale Serve-proxynyckel krävs för enhetsregistrering.');
  const proxyPrefix = proxySecret ? `/__serve/${proxySecret}` : '';
  const verifiedIdentity = async (sourceIp, login, request) => {
    if (!deviceRegistry || typeof resolveIdentity !== 'function' || !sourceIp || !isIP(sourceIp)
      || request.headers['x-forwarded-proto'] !== 'https') throw deviceError('device_identity', 403);
    let identity;
    try { identity = await resolveIdentity({ sourceIp, login }); } catch { throw deviceError('device_identity', 403); }
    if (!identity || identity.login !== login || !contract.logins.has(identity.login)
      || typeof identity.nodeId !== 'string' || !/^[A-Za-z\d_-]{1,200}$/.test(identity.nodeId)) throw deviceError('device_identity', 403);
    return { nodeId: identity.nodeId, login: identity.login };
  };
  const ingress = createIngressRecorder({ phoneIps: options.phoneIps, selfIps: options.selfIps });
  const verifyReady = async () => {
    const result = await fetch(`${contract.localWeb}/__test/ready`, { signal: AbortSignal.timeout(15000) });
    if (!result.ok || (await result.json()).isolation_id !== contract.isolationId) throw new Error('Den isolerade backendens databas kunde inte verifieras.');
    return { marker: remoteMarker, isolation_id: contract.isolationId, test_mode: true, real_payments: false };
  };
  await verifyReady();
  const loginPage = (response, target = '/', status = 401, message = '') => {
    // Fetch serializes Origin as null for non-CORS form POST under no-referrer.
    // same-origin preserves our CSRF check while still hiding private paths from other sites.
    // https://fetch.spec.whatwg.org/#append-a-request-origin-header
    response.writeHead(status, { ...securityHeaders, 'Referrer-Policy': 'same-origin', 'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
    response.end(`<!doctype html><html lang="sv"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Privat Yehabibi-test</title><body style="font-family:system-ui;max-width:38rem;margin:3rem auto;padding:1rem"><h1>TESTLÄGE – INGA RIKTIGA PENGAR</h1><p>Privat fjärrtest via Tailscale. Godkända telefoner återansluter automatiskt i appen. Den separata webbläsarnyckeln finns i datorns lokala fil <code>.tmp/remote-credentials.txt</code>. Testbetalning och admin kräver förhöjd webbläsarbehörighet.</p><p>${escapeHtml(message)}</p><form method="post" action="/__remote/login"><input type="hidden" name="return_path" value="${escapeHtml(target)}"><label>Webbläsarnyckel <input name="key" type="password" required autocomplete="off" style="display:block;width:100%;padding:.75rem"></label><button style="margin-top:1rem;padding:.75rem">Öppna privat test</button></form><p>Kunduppgifter ersätts med syntetiska testuppgifter. Inga riktiga betalningar kan genomföras.</p></body></html>`);
  };
  const server = http.createServer(async (request, response) => {
    let sourceIp, family = 'other', rejection = 'none', authenticatedApi = false;
    // The recorder keeps masked diagnostic categories. Device authorization separately
    // verifies this Serve source against the live local Tailscale netmap below.
    response.once('finish', () => ingress.record({ sourceIp, routeFamily: family, status: response.statusCode, rejection, authenticatedApi }));
    try {
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)
        || request.headers.host?.toLowerCase() !== contract.publicHost
        || (request.headers['x-forwarded-proto'] && request.headers['x-forwarded-proto'] !== 'https')) { rejection = 'host'; return json(response, 403, { error: 'Privat Tailscale HTTPS krävs.' }); }
      // Serve alone receives this opaque backend path. Bare loopback requests with forged
      // identity headers cannot pass the proxy boundary, even when the attacker knows the public hostname.
      if (proxyPrefix) {
        if (!request.url?.startsWith(`${proxyPrefix}/`)) { rejection = 'identity'; return json(response, 403, { error: 'Privat Tailscale Serve krävs.', code: 'device_identity' }); }
        request.url = request.url.slice(proxyPrefix.length);
      }
      // Serve overwrites X-Forwarded-For with the tailnet source IP. Reject lists
      // for attribution rather than accepting an arbitrary caller-selected entry.
      sourceIp = typeof request.headers['x-forwarded-for'] === 'string' ? request.headers['x-forwarded-for'] : undefined;
      const login = typeof request.headers['tailscale-user-login'] === 'string' ? request.headers['tailscale-user-login'].toLowerCase() : '';
      if (!contract.logins.has(login)) { rejection = 'identity'; return json(response, 403, { error: 'Tailscale-identiteten är inte godkänd för denna testsession.' }); }
      rejection = 'malformed';
      const { pathname, target } = requestPath(request, contract), policy = routePolicy(pathname, request.method);
      rejection = 'none';
      family = routeFamily(pathname);
      if (!policy) { rejection = 'route'; return json(response, 404, { error: 'Resursen är blockerad i privat fjärrtest.' }); }
      const requestOrigin = request.headers.origin;
      if (requestOrigin && !contract.origins.has(requestOrigin)) { rejection = 'origin'; return json(response, 403, { error: 'Otillåtet ursprung.' }); }
      const cors = requestOrigin ? { 'Access-Control-Allow-Origin': requestOrigin, Vary: 'Origin',
        'Access-Control-Allow-Headers': 'Content-Type, X-Yehabibi-Remote-Token', 'Access-Control-Allow-Methods': (policy.methods || ['GET', 'POST', 'PATCH']).join(', ') } : {};
      if (request.method === 'OPTIONS') return json(response, 204, null, cors);
      if (policy.level === 'device') {
        const identity = await verifiedIdentity(sourceIp, login, request);
        if (request.headers['sec-fetch-site'] === 'cross-site') { rejection = 'origin'; return json(response, 403, { error: 'Öppna den privata anslutningen i appen.' }, cors); }
        if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') return json(response, 415, { error: 'Enhetsregistrering kräver JSON.' }, cors);
        const input = JSON.parse((await readBody(request, 512)).toString());
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.credential !== 'string') throw deviceError('device_invalid');
        if (pathname === '/__remote/device/enroll') {
          const key = `${identity.nodeId}\0${identity.login}`, time = Date.now();
          for (const [id, attempt] of enrollmentAttempts) if (attempt.until <= time) enrollmentAttempts.delete(id);
          const attempt = enrollmentAttempts.get(key), fingerprint = createHash('sha256').update(input.credential).digest('hex');
          const seen = attempt?.credentials.has(fingerprint);
          if (!seen && ((attempt?.credentials.size || 0) >= 12 || enrollmentAttempts.size >= 1000 && !attempt)) throw deviceError('enrollment_limit', 429);
          const credentials = attempt?.credentials || new Set(); credentials.add(fingerprint);
          enrollmentAttempts.set(key, { credentials, until: attempt?.until || time + 10 * 60 * 1000 });
          return json(response, 200, deviceRegistry.requestEnrollment({ credential: input.credential, identity }), cors);
        }
        const attemptKey = `${identity.nodeId}\0${identity.login}`, attemptTime = Date.now();
        for (const [id, attempt] of sessionAttempts) if (attempt.until <= attemptTime) sessionAttempts.delete(id);
        const attempt = sessionAttempts.get(attemptKey);
        if ((attempt?.count || 0) >= 60 || sessionAttempts.size >= 1000 && !attempt) throw deviceError('device_rate_limited', 429);
        sessionAttempts.set(attemptKey, { count: (attempt?.count || 0) + 1, until: attempt?.until || attemptTime + 60000 });
        const device = deviceRegistry.authenticate(input.credential, identity);
        if (!device) throw deviceError('device_invalid');
        const time = Date.now();
        for (const [id, session] of deviceSessions) if (session.expires <= time) deviceSessions.delete(id);
        if (deviceSessions.size >= 1000) throw deviceError('enrollment_limit', 429);
        const token = randomBytes(32).toString('base64url'), expires = time + 5 * 60 * 1000;
        deviceSessions.set(token, { deviceId: device.id, ...identity, expires });
        return json(response, 200, { token, expires_at: new Date(expires).toISOString() }, cors);
      }
      const cookieValue = (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${remoteCookieName}=`))?.slice(remoteCookieName.length + 1);
      const browserSession = sessions.get(cookieValue);
      const validSession = browserSession?.login === login && browserSession.expires > Date.now() ? browserSession : null;
      if (browserSession && !validSession) sessions.delete(cookieValue);
      const tokenValid = equalSecret(request.headers[remoteTokenHeader], contract.accessToken);
      const deviceToken = request.headers[remoteTokenHeader], deviceSession = typeof deviceToken === 'string' ? deviceSessions.get(deviceToken) : undefined;
      let deviceValid = false;
      if (deviceSession) {
        if (deviceSession.expires <= Date.now()) deviceSessions.delete(deviceToken);
        else {
          const identity = await verifiedIdentity(sourceIp, login, request);
          if (deviceSession.nodeId !== identity.nodeId || deviceSession.login !== identity.login) throw deviceError('device_identity', 403);
          const device = deviceRegistry.list().find(item => item.id === deviceSession.deviceId);
          if (device?.status === 'revoked') { deviceSessions.delete(deviceToken); throw deviceError('device_revoked'); }
          deviceValid = device?.status === 'approved' && device.nodeId === identity.nodeId && device.login === identity.login;
        }
      }
      const authenticated = tokenValid || deviceValid || Boolean(validSession);
      if (policy.level !== 'login' && (!authenticated || (policy.level === 'elevated' && validSession?.level !== 'elevated'))) {
        rejection = 'session';
        if (request.method === 'GET' && !pathname.startsWith('/api/') && pathname !== '/__remote/health') return loginPage(response, target);
        return json(response, 401, { error: policy.level === 'elevated' ? 'Logga in med separat adminnyckel i den privata webbläsaren.' : 'Telefonens session har gått ut. Återansluter med den godkända enheten.',
          code: policy.level === 'elevated' ? 'remote_elevation_required' : 'remote_session_invalid' }, cors);
      }
      if (pathname === '/__remote/login') {
        if (request.method === 'GET') return loginPage(response, '/', 200);
        if (requestOrigin !== contract.publicOrigin || request.headers['sec-fetch-site'] === 'cross-site') { rejection = 'origin'; return json(response, 403, { error: 'Öppna inloggningen via den privata HTTPS-adressen.' }); }
        const failed = failures.get(login);
        if (failed?.until > Date.now() && failed.count >= 8) { rejection = 'rate_limit'; return json(response, 429, { error: 'För många försök. Vänta en minut.' }); }
        if (!request.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) return json(response, 415, { error: 'Använd det privata inloggningsformuläret.' });
        const form = new URLSearchParams((await readBody(request, 4096)).toString()), key = form.get('key');
        const level = equalSecret(key, contract.adminToken) ? 'elevated' : equalSecret(key, contract.accessToken) ? 'customer' : null;
        if (!level) { rejection = 'session'; failures.set(login, { count: failed?.until > Date.now() ? failed.count + 1 : 1, until: Date.now() + 60000 }); return loginPage(response, '/', 401, 'Fel sessionsnyckel.'); }
        failures.delete(login);
        for (const [id, value] of sessions) if (value.expires < Date.now()) sessions.delete(id);
        if (sessions.size >= 100) { rejection = 'rate_limit'; return json(response, 429, { error: 'För många aktiva testsessioner.' }); }
        const id = randomBytes(32).toString('base64url');
        sessions.set(id, { login, level, expires: Date.now() + 8 * 60 * 60 * 1000 });
        let returnPath = form.get('return_path') || '/';
        try { const parsed = requestPath({ url: returnPath }, contract), next = routePolicy(parsed.pathname, 'GET'); if (!next || next.level === 'login' || parsed.pathname === '/__remote/health') returnPath = '/'; }
        catch { returnPath = '/'; }
        response.writeHead(303, { ...securityHeaders, Location: returnPath,
          'Set-Cookie': `${remoteCookieName}=${id}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800` }); response.end(); return;
      }
      if (pathname === '/__remote/logout') {
        if (requestOrigin !== contract.publicOrigin) { rejection = 'origin'; return json(response, 403, { error: 'Otillåtet ursprung.' }); }
        sessions.delete(cookieValue);
        return json(response, 200, { signed_out: true }, { 'Set-Cookie': `${remoteCookieName}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0` });
      }
      if (pathname === '/__remote/health') return json(response, 200, await verifyReady(), cors);
      authenticatedApi = authenticated && policy.api === true && request.method !== 'OPTIONS';
      let body = await readBody(request);
      if (['/api/orders', '/api/orders/direct'].includes(pathname) && request.method === 'POST') {
        if (!request.headers['content-type']?.includes('application/json')) return json(response, 415, { error: 'Testbeställningar kräver JSON.' }, cors);
        body = Buffer.from(JSON.stringify(syntheticOrder(JSON.parse(body.toString()))));
      }
      if (/^\/api\/orders\/CM-/.test(pathname) && request.method === 'PATCH') {
        const input = JSON.parse(body.toString());
        if (input.action === 'register_push') { input.push_token = 'ExpoPushToken[isolated_remote_test_device]'; body = Buffer.from(JSON.stringify(input)); }
      }
      if (/^\/api\/admin\/orders\//.test(pathname) && request.method === 'PATCH') {
        const input = JSON.parse(body.toString());
        if ('admin_note' in input) input.admin_note = 'TEST Syntetisk administratörsanteckning';
        if ('kitchen_note' in input) input.kitchen_note = 'TEST Syntetisk köksanteckning';
        body = Buffer.from(JSON.stringify(input));
      }
      const upstreamOrigin = policy.bridge ? contract.localBackend : contract.localWeb;
      // Never forward caller-controlled forwarding/auth headers, gateway keys or cookies upstream.
      const headers = { host: new URL(upstreamOrigin).host, 'accept-encoding': 'identity',
        'x-forwarded-for': createHash('sha256').update(login).digest('hex') };
      for (const name of ['content-type', 'accept', 'rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-url']) {
        if (request.headers[name]) headers[name] = request.headers[name];
      }
      if (requestOrigin) headers.origin = contract.localWeb;
      const upstreamCookie = (request.headers.cookie || '').split(';').filter(value => !value.trim().startsWith(`${remoteCookieName}=`)).join(';');
      if (upstreamCookie) headers.cookie = upstreamCookie;
      const upstream = await fetch(new URL(target, upstreamOrigin), { method: request.method, headers,
        ...(body.length ? { body } : {}), redirect: 'manual', signal: AbortSignal.timeout(45000) });
      const outputHeaders = {};
      for (const name of ['content-type', 'content-disposition', 'vary']) if (upstream.headers.has(name)) outputHeaders[name] = upstream.headers.get(name);
      if (upstream.headers.has('location')) {
        const location = remoteUrl(upstream.headers.get('location'), contract);
        if (location.startsWith('//') || location.includes('\\') || new URL(location, contract.publicOrigin).origin !== contract.publicOrigin) { rejection = 'upstream'; return json(response, 502, { error: 'Otillåten omdirigering från testbackend.' }); }
        outputHeaders.Location = location;
      }
      const cookies = upstream.headers.getSetCookie();
      if (cookies.length) outputHeaders['Set-Cookie'] = cookies.map(cookie => `${cookie.replace(/;\s*Domain=[^;]+/gi, '')}${/;\s*Secure(?:;|$)/i.test(cookie) ? '' : '; Secure'}`);
      const chunks = []; let size = 0;
      for await (const chunk of upstream.body || []) {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) throw new Error('För stort svar från testbackend.');
        chunks.push(chunk);
      }
      let output = Buffer.concat(chunks);
      const contentType = upstream.headers.get('content-type') || '';
      if (contentType.includes('application/json') && output.length) output = Buffer.from(JSON.stringify(rewriteCustomerUrls(JSON.parse(output.toString()), contract)));
      if (contentType.includes('text/html')) output = Buffer.from(output.toString().replaceAll(contract.localWeb, contract.publicOrigin).replaceAll(contract.localBackend, contract.publicOrigin));
      if (upstream.status >= 400) rejection = 'upstream';
      response.writeHead(upstream.status, { ...outputHeaders, ...securityHeaders,
        ...(contentType.includes('text/html') ? { 'Referrer-Policy': 'same-origin' } : {}), ...cors }); response.end(output);
    } catch (error) {
      rejection = error.code?.startsWith('device_') ? 'session' : error.code === 'enrollment_limit' ? 'rate_limit' : rejection === 'malformed' || error instanceof URIError || error instanceof SyntaxError || error.status === 413 ? 'malformed' : 'upstream';
      if (!response.headersSent) json(response, error.status || (error instanceof SyntaxError ? 400 : 502), error.code && ['device_invalid', 'device_pending', 'device_revoked', 'device_identity', 'device_rate_limited', 'enrollment_limit'].includes(error.code)
        ? { error: error.message, code: error.code } : { error: 'Den privata testanslutningen misslyckades. Kontrollera att datorns isolerade backend kör.' });
      else response.destroy();
    }
  });
  server.requestTimeout = 60000; server.headersTimeout = 15000;
  server.on('upgrade', (_request, socket) => socket.destroy());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}${proxyPrefix}`, port: server.address().port, health: verifyReady, diagnostics: () => ingress.snapshot(),
    close: async () => { sessions.clear(); failures.clear(); deviceSessions.clear(); enrollmentAttempts.clear(); sessionAttempts.clear(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
