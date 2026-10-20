import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { equalSecret, remoteContract, remoteCookieName, remoteMarker, remoteTokenHeader, remoteUrl, rewriteCustomerUrls, routePolicy, syntheticOrder } from './contract.mjs';

const securityHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' };
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const json = (response, status, data, headers = {}) => { response.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json', ...headers }); response.end(JSON.stringify(data)); };

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
  const contract = remoteContract(options), sessions = new Map(), failures = new Map();
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
    response.end(`<!doctype html><html lang="sv"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Privat Yehabibi-test</title><body style="font-family:system-ui;max-width:38rem;margin:3rem auto;padding:1rem"><h1>TESTLÄGE – INGA RIKTIGA PENGAR</h1><p>Privat fjärrtest via Tailscale. Ange sessionsnyckeln från datorns terminal. Testbetalning och admin kräver den separata adminnyckeln.</p><p>${escapeHtml(message)}</p><form method="post" action="/__remote/login"><input type="hidden" name="return_path" value="${escapeHtml(target)}"><label>Sessionsnyckel eller adminnyckel <input name="key" type="password" required autocomplete="off" style="display:block;width:100%;padding:.75rem"></label><button style="margin-top:1rem;padding:.75rem">Öppna privat test</button></form><p>Kunduppgifter ersätts med syntetiska testuppgifter. Inga riktiga betalningar kan genomföras.</p></body></html>`);
  };
  const server = http.createServer(async (request, response) => {
    try {
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)
        || request.headers.host?.toLowerCase() !== contract.publicHost
        || (request.headers['x-forwarded-proto'] && request.headers['x-forwarded-proto'] !== 'https')) return json(response, 403, { error: 'Privat Tailscale HTTPS krävs.' });
      const login = typeof request.headers['tailscale-user-login'] === 'string' ? request.headers['tailscale-user-login'].toLowerCase() : '';
      if (!contract.logins.has(login)) return json(response, 403, { error: 'Tailscale-identiteten är inte godkänd för denna testsession.' });
      const { pathname, target } = requestPath(request, contract), policy = routePolicy(pathname, request.method);
      if (!policy) return json(response, 404, { error: 'Resursen är blockerad i privat fjärrtest.' });
      const requestOrigin = request.headers.origin;
      if (requestOrigin && !contract.origins.has(requestOrigin)) return json(response, 403, { error: 'Otillåtet ursprung.' });
      const cors = requestOrigin ? { 'Access-Control-Allow-Origin': requestOrigin, Vary: 'Origin',
        'Access-Control-Allow-Headers': 'Content-Type, X-Yehabibi-Remote-Token', 'Access-Control-Allow-Methods': (policy.methods || ['GET', 'POST', 'PATCH']).join(', ') } : {};
      if (request.method === 'OPTIONS') return json(response, 204, null, cors);
      const cookieValue = (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${remoteCookieName}=`))?.slice(remoteCookieName.length + 1);
      const browserSession = sessions.get(cookieValue);
      const validSession = browserSession?.login === login && browserSession.expires > Date.now() ? browserSession : null;
      if (browserSession && !validSession) sessions.delete(cookieValue);
      const tokenValid = equalSecret(request.headers[remoteTokenHeader], contract.accessToken);
      const authenticated = tokenValid || Boolean(validSession);
      if (policy.level !== 'login' && (!authenticated || (policy.level === 'elevated' && validSession?.level !== 'elevated'))) {
        if (request.method === 'GET' && !pathname.startsWith('/api/') && pathname !== '/__remote/health') return loginPage(response, target);
        return json(response, 401, { error: policy.level === 'elevated' ? 'Logga in med separat adminnyckel i den privata webbläsaren.' : 'Ange fjärrtestnyckeln för denna session.' }, cors);
      }
      if (pathname === '/__remote/login') {
        if (request.method === 'GET') return loginPage(response, '/', 200);
        if (requestOrigin !== contract.publicOrigin || request.headers['sec-fetch-site'] === 'cross-site') return json(response, 403, { error: 'Öppna inloggningen via den privata HTTPS-adressen.' });
        const failed = failures.get(login);
        if (failed?.until > Date.now() && failed.count >= 8) return json(response, 429, { error: 'För många försök. Vänta en minut.' });
        if (!request.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) return json(response, 415, { error: 'Använd det privata inloggningsformuläret.' });
        const form = new URLSearchParams((await readBody(request, 4096)).toString()), key = form.get('key');
        const level = equalSecret(key, contract.adminToken) ? 'elevated' : equalSecret(key, contract.accessToken) ? 'customer' : null;
        if (!level) { failures.set(login, { count: failed?.until > Date.now() ? failed.count + 1 : 1, until: Date.now() + 60000 }); return loginPage(response, '/', 401, 'Fel sessionsnyckel.'); }
        failures.delete(login);
        for (const [id, value] of sessions) if (value.expires < Date.now()) sessions.delete(id);
        if (sessions.size >= 100) return json(response, 429, { error: 'För många aktiva testsessioner.' });
        const id = randomBytes(32).toString('base64url');
        sessions.set(id, { login, level, expires: Date.now() + 8 * 60 * 60 * 1000 });
        let returnPath = form.get('return_path') || '/';
        try { const parsed = requestPath({ url: returnPath }, contract), next = routePolicy(parsed.pathname, 'GET'); if (!next || next.level === 'login' || parsed.pathname === '/__remote/health') returnPath = '/'; }
        catch { returnPath = '/'; }
        response.writeHead(303, { ...securityHeaders, Location: returnPath,
          'Set-Cookie': `${remoteCookieName}=${id}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800` }); response.end(); return;
      }
      if (pathname === '/__remote/logout') {
        if (requestOrigin !== contract.publicOrigin) return json(response, 403, { error: 'Otillåtet ursprung.' });
        sessions.delete(cookieValue);
        return json(response, 200, { signed_out: true }, { 'Set-Cookie': `${remoteCookieName}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0` });
      }
      if (pathname === '/__remote/health') return json(response, 200, await verifyReady(), cors);
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
        if (location.startsWith('//') || location.includes('\\') || new URL(location, contract.publicOrigin).origin !== contract.publicOrigin) return json(response, 502, { error: 'Otillåten omdirigering från testbackend.' });
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
      response.writeHead(upstream.status, { ...outputHeaders, ...securityHeaders,
        ...(contentType.includes('text/html') ? { 'Referrer-Policy': 'same-origin' } : {}), ...cors }); response.end(output);
    } catch (error) {
      if (!response.headersSent) json(response, error.status || 502, { error: 'Den privata testanslutningen misslyckades. Kontrollera att datorns isolerade backend kör.' });
      else response.destroy();
    }
  });
  server.requestTimeout = 60000; server.headersTimeout = 15000;
  server.on('upgrade', (_request, socket) => socket.destroy());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, port: server.address().port, health: verifyReady,
    close: async () => { sessions.clear(); failures.clear(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
