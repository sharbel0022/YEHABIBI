import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';

export const remoteTokenHeader = 'x-yehabibi-remote-token';
export const remoteCookieName = '__Host-yehabibi_remote';
export const remoteMarker = 'YEHABIBI_PRIVATE_REMOTE_TEST_V1';

export function equalSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function localOrigin(value) {
  const url = new URL(value);
  assert.ok(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port
    && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash,
  'Fjärrtest får bara ansluta till den egna loopbackmiljön.');
  return url.origin;
}

/** Separate gateway contract. The payment overlay retains its original localhost guards. */
export function remoteContract({ session, publicOrigin, allowedLogins, accessToken, adminToken, allowedOrigins = [] }) {
  assert.equal(session?.marker, 'YEHABIBI_ISOLATED_LOCAL_TEST', 'Okänd isolerad testsession.');
  assert.match(session.isolationId || '', /^[a-f\d-]{36}$/i);
  const localWeb = localOrigin(session.origin), localBackend = localOrigin(session.backendOrigin);
  assert.notEqual(localWeb, localBackend);
  const env = session.webEnv;
  assert.ok(env?.APP_ENV === 'test' && ['development', 'test'].includes(env.NODE_ENV)
    && env.PAYMENTS_ENABLED === 'false' && env.PAYMENTS_LIVE_APPROVED !== 'true'
    && !env.ADYEN_API_KEY && !env.ADYEN_HMAC_KEY && !env.ADYEN_MERCHANT_ACCOUNT
    && env.TEST_ISOLATION_ID === session.isolationId && /^[a-f\d]{64}$/i.test(env.TEST_PAYMENT_SECRET || '')
    && env.TEST_BACKEND_ORIGIN === localBackend && env.NEXT_PUBLIC_SUPABASE_URL === localBackend
    && env.NEXT_PUBLIC_SITE_URL === localWeb,
  'Fjärrtest kräver samma verifierade isolerade backend och avstängda riktiga betalningar.');
  const publicUrl = new URL(publicOrigin);
  assert.ok(publicUrl.protocol === 'https:' && /^[a-z\d](?:[a-z\d-]*[a-z\d])?\.[a-z\d](?:[a-z\d-]*[a-z\d])?\.ts\.net$/i.test(publicUrl.hostname)
    && !publicUrl.username && !publicUrl.password && publicUrl.pathname === '/' && !publicUrl.search && !publicUrl.hash,
  'Fjärrtest kräver den verkliga privata Tailscale HTTPS-adressen.');
  assert.match(accessToken || '', /^[A-Za-z\d_-]{43,128}$/, 'En separat slumpmässig fjärrtestnyckel krävs.');
  assert.match(adminToken || '', /^[A-Za-z\d_-]{43,128}$/, 'En separat slumpmässig adminnyckel krävs.');
  assert.ok(!equalSecret(accessToken, adminToken) && !equalSecret(accessToken, session.controlSecret)
    && !equalSecret(adminToken, session.controlSecret), 'Fjärrtestnycklar får inte återanvändas.');
  const logins = new Set((allowedLogins || []).map(login => String(login).trim().toLowerCase()).filter(Boolean));
  assert.ok(logins.size && [...logins].every(login => /^[^\s,;<>]{1,200}$/.test(login)), 'Godkända Tailscale-identiteter krävs.');
  const origins = new Set([publicUrl.origin]);
  for (const value of allowedOrigins) {
    const origin = new URL(value);
    assert.ok(!origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash
      && ((origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)) || origin.origin === publicUrl.origin),
    'Endast uttryckliga lokala Expo Web-ursprung får läggas till.');
    origins.add(origin.origin);
  }
  return { marker: remoteMarker, isolationId: session.isolationId, localWeb, localBackend,
    publicOrigin: publicUrl.origin, publicHost: publicUrl.host.toLowerCase(), logins, origins, accessToken, adminToken };
}

export function routePolicy(pathname, method) {
  const read = method === 'GET' || method === 'HEAD';
  if (['/__remote/device/enroll', '/__remote/device/session'].includes(pathname) && ['POST', 'OPTIONS'].includes(method)) return { level: 'device', local: true, methods: ['POST'] };
  if (pathname === '/__remote/login' && ['GET', 'POST'].includes(method)) return { level: 'login' };
  if (pathname === '/__remote/logout' && method === 'POST') return { level: 'customer', local: true };
  if (pathname === '/__remote/health' && method === 'GET') return { level: 'customer', local: true };
  if (pathname === '/__test/login' && ['GET', 'POST'].includes(method)) return { level: 'elevated', bridge: true };
  if (pathname === '/__test/inbox' && read) return { level: 'elevated', bridge: true };
  if (/^\/__test\/payment\/lt_[a-f\d]{64}$/.test(pathname) && read) return { level: 'elevated' };
  if (/^\/__test\/payment\/lt_[a-f\d]{64}\/simulate$/.test(pathname) && method === 'POST') return { level: 'elevated' };
  const customerApis = new Map([
    ['/api/catalog', ['GET', 'HEAD']], ['/api/health', ['GET', 'HEAD']],
    ['/api/availability', ['POST']], ['/api/orders', ['POST']], ['/api/orders/direct', ['POST']],
    ['/api/payments/create', ['POST']], ['/api/payments/status', ['GET', 'HEAD']],
  ]);
  const methods = customerApis.get(pathname) || (/^\/api\/orders\/CM-[A-F\d]{10}$/.test(pathname) ? ['GET', 'HEAD', 'PATCH'] : null);
  if (methods && (methods.includes(method) || method === 'OPTIONS')) return { level: 'customer', api: true, methods };
  if ((/^\/admin(?:\/[a-z\d-]+)*(?:\/print)?$/i.test(pathname) && read)
    || (/^\/api\/admin\/(?:catalog|settings|scheduling|kitchen|jobs|capacity|menus|items)$/.test(pathname) && read)
    || (/^\/api\/admin\/orders\/[a-f\d-]{36}$/.test(pathname) && method === 'PATCH')) return { level: 'elevated' };
  if ((read && ['/', '/bestall', '/bestall-nu', '/menyer', '/kontakt', '/om-oss', '/villkor', '/integritet',
    '/foretagscatering-vasteras', '/festcatering-vasteras', '/brand-mark.svg', '/icon-180.png', '/icon-192.png', '/icon-512.png'].includes(pathname))
    || (read && /^\/order\/CM-[A-F\d]{10}$/.test(pathname))
    || (read && /^\/(?:_next\/static|images)\/[\w.\-/[\]()]+$/.test(pathname))) return { level: 'customer' };
  return null;
}

/** Only exact local web capabilities are translated; DB and provider endpoints never move. */
export function remoteUrl(value, contract) {
  if (typeof value !== 'string') return value;
  if (value.startsWith(`${contract.localWeb}/`) || value.startsWith(`${contract.localBackend}/__test/`)) {
    const url = new URL(value);
    return contract.publicOrigin + url.pathname + url.search + url.hash;
  }
  return value;
}

export function rewriteCustomerUrls(value, contract) {
  if (Array.isArray(value)) return value.map(item => rewriteCustomerUrls(item, contract));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, ['checkout_url', 'tracking_url', 'return_url'].includes(key) ? remoteUrl(item, contract) : rewriteCustomerUrls(item, contract)]));
  return value;
}

export function syntheticOrder(input) {
  assert.ok(input && typeof input === 'object' && !Array.isArray(input), 'Ogiltig testbeställning.');
  return { ...input, full_name: 'TEST Syntetisk kund', email: 'customer@example.test', phone: '0700000000', notes: '',
    address: input.fulfillment === 'delivery' ? 'Testgatan 1' : '', city: input.fulfillment === 'delivery' ? 'Teststad' : '' };
}
