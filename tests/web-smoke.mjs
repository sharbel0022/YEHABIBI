// Produktionsbyggets HTTP/SSR-kontroll. Ingen databas eller extern tjänst ansluts.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps/web');
assert.ok(existsSync(path.join(web, '.next/BUILD_ID')), 'Kör npm run build före test:web.');

const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`;

// Explicita tomma värden vinner över eventuella lokala .env-filer.
const env = {
  ...process.env,
  NODE_ENV: 'production', NODE_OPTIONS: '', NEXT_TELEMETRY_DISABLED: '1',
  // Even deliberate test flags cannot install the local-only source overlay.
  APP_ENV: 'test', NEXT_PUBLIC_TEST_MODE: 'true', EXPO_PUBLIC_TEST_MODE: 'true',
  NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_INDEXABLE: 'false',
  NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '',
  SUPABASE_URL: '', SUPABASE_ANON_KEY: '', ADMIN_EMAILS: '',
  ORDERS_ENABLED: 'false', PAYMENTS_ENABLED: 'false',
  PAYMENT_PROVIDER: 'local_test', ADYEN_ENVIRONMENT: 'test', ADYEN_CAPTURE_MODE: '',
  ADYEN_API_KEY: '', ADYEN_MERCHANT_ACCOUNT: '', ADYEN_HMAC_KEY: '', ADYEN_ENABLED_METHODS: '',
  RESEND_API_KEY: '', EMAIL_FROM: '', OWNER_NOTIFICATION_EMAIL: '',
  ORDER_LINK_SECRET: '', ORDER_RATE_LIMIT_SECRET: '',
  OWNER_PUSH_ENABLED: 'false', CUSTOMER_PUSH_ENABLED: 'false', EXPO_ACCESS_TOKEN: '',
  MOBILE_WEB_ORIGINS: '', YEHABIBI_TEST_BRIDGE: '',
  GOOGLE_REVIEW_URL: '', GOOGLE_MAPS_URL: '', INSTAGRAM_URL: '', FACEBOOK_URL: '', TIKTOK_URL: '',
};
const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'),
  'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: web, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
let startError;
server.on('error', error => { startError = error; });
for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', chunk => { log = (log + chunk.toString()).slice(-2000); });
}

async function request(route, options = {}) {
  return fetch(`${origin}${route}`, { ...options, signal: AbortSignal.timeout(10000) });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startError) throw new Error(`Next start: ${startError.message}`);
    assert.equal(server.exitCode, null, `Next avslutades före testet: ${log}`);
    try { if ((await request('/api/health')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Produktionsservern startade inte. ${log}`);
}

function contentOf(html, tagName, key, value, attribute) {
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) || [];
  const tag = tags.find(candidate => new RegExp(`\\b${key}="${value}"`, 'i').test(candidate));
  return tag?.match(new RegExp(`\\b${attribute}="([^"]*)"`, 'i'))?.[1];
}

async function verifyPublicPage(route) {
  const response = await request(route);
  assert.equal(response.status, 200, `${route}: sidan ska svara 200.`);
  assert.match(response.headers.get('content-type') || '', /text\/html/i, `${route}: HTML saknas.`);
  const html = await response.text();
  assert.ok(/<html\b[^>]*\blang="sv"/i.test(html), `${route}: svenskt dokumentspråk saknas.`);
  assert.ok(/<title>[^<]*Cedar Mezze[^<]*<\/title>/i.test(html), `${route}: sidtitel saknas.`);
  const description = contentOf(html, 'meta', 'name', 'description', 'content');
  assert.ok(description?.length >= 20, `${route}: metabeskrivning saknas.`);
  const canonical = contentOf(html, 'link', 'rel', 'canonical', 'href');
  assert.ok(canonical, `${route}: canonical saknas.`);
  assert.equal(new URL(canonical).href, new URL(route, origin).href, `${route}: fel canonical.`);
  assert.ok(/<main\b[^>]*\bid="main"/i.test(html) && /<h1\b/i.test(html), `${route}: serverrenderat huvudinnehåll saknas.`);
  return html;
}

try {
  await waitForServer();
  const routes = ['/', '/menyer', '/bestall', '/bestall-nu', '/om-oss', '/kontakt',
    '/festcatering-vasteras', '/foretagscatering-vasteras', '/integritet', '/villkor'];
  for (const route of routes) await verifyPublicPage(route);

  const menuResponse = await request('/menyer?val=bygg');
  assert.equal(menuResponse.status, 200, 'Menybyggaren ska svara 200.');
  const menuHtml = (await menuResponse.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  assert.equal((menuHtml.match(/<article\b[^>]*class="[^"]*\bdish-card\b/g) || []).length,
    11, 'Menybyggaren ska serverrendera elva demorätter.');
  for (const title of ['Hummus', 'Ostrullar', 'Kycklingspett', 'Dessert']) {
    assert.ok(menuHtml.includes(`<h3>${title}</h3>`), `${title}: rättnamnet ska finnas utan JavaScript.`);
  }

  const catalogResponse = await request('/api/catalog');
  assert.equal(catalogResponse.status, 200, 'Katalog-API ska svara 200.');
  const catalog = await catalogResponse.json();
  assert.equal(catalog.demo, true, 'Röktestet ska använda demonstrationskatalogen.');
  assert.equal(catalog.orders_enabled, false, 'Beställningar ska vara avstängda.');
  assert.equal(catalog.direct_orders_enabled, false, 'Direktbeställningar ska vara avstängda publikt.');
  assert.equal(catalog.dishes.length, 11, 'API och SSR ska visa samma elva rätter.');
  assert.ok(catalog.dishes.every(dish => dish.price_ore === 0), 'Demorätter ska sakna fastställda priser.');
  assert.ok(catalog.menus.length > 0 && catalog.menus.every(menu => menu.price_ore === 0), 'Demopaket ska sakna fastställda priser.');
  assert.deepEqual(catalog.payment_methods, [], 'Inget betalsätt ska vara aktiverat.');
  assert.notEqual(catalog.test_mode, true, 'Testflaggor får inte göra produktion till en simulator.');

  // The test adapter and routes are copied only into an ignored local workspace.
  function checkProductionFiles(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, item.name);
      if (item.isDirectory()) checkProductionFiles(filename);
      else if (/\.(?:js|json|html)$/.test(item.name)) {
        const content = readFileSync(filename, 'utf8');
        assert.equal(/TestPaymentProvider|TEST_PAYMENT_SIMULATOR_OVERLAY|TEST_PAYMENT_SECRET|test_environment_guard|local-test-payment-v1/.test(content), false,
          'Produktionsbygget får inte innehålla testadaptern eller simuleringsservern.');
      }
    }
  }
  checkProductionFiles(path.join(web, '.next/server'));
  for (const route of ['/__test/payment/missing', '/__test/payment/missing/simulate', '/__test/ready']) {
    for (const method of ['GET', 'POST']) {
      const response = await request(route, { method });
      assert.equal(response.status, 404, 'Produktionsappen får inte exponera någon betalsimulator.');
    }
  }

  const disabledOrder = await request('/api/orders', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(disabledOrder.status, 503, 'Avstängd beställning ska avvisas före databasåtkomst.');
  for (const route of ['/api/orders/direct', '/api/availability']) {
    const disabledDirect = await request(route, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(disabledDirect.status, 503, `${route}: publik direktbeställning ska vara avstängd.`);
  }
  for (const method of ['GET', 'PATCH']) {
    const scheduling = await request('/api/admin/scheduling', { method,
      ...(method === 'PATCH' ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}) });
    assert.equal(scheduling.status, 401, 'Tidsinställningar kräver adminsession.');
  }
  const unauthorized = await request('/api/admin/settings', { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unauthorized.status, 401, 'Adminändring utan session ska avvisas.');

  const robots = await request('/robots.txt');
  assert.equal(robots.status, 200, 'robots.txt ska svara 200.');
  assert.ok(/Disallow:\s*\/\s*(?:\r?\n|$)/i.test(await robots.text()), 'Demonstrationen ska blockera indexering.');
  const sitemap = await request('/sitemap.xml');
  assert.equal(sitemap.status, 200, 'sitemap.xml ska svara 200.');
  const sitemapXml = await sitemap.text();
  assert.ok(/<urlset\b/i.test(sitemapXml), 'Sitemap ska vara XML.');
  assert.equal(/<loc>/i.test(sitemapXml), false, 'Avstängd indexering ska ge en tom sitemap.');
  process.stdout.write(`PRODUCTION WEB SMOKE PASSED ${JSON.stringify({ pages: routes.length, serverRenderedDishes: 11, demo: true, externalServices: false })}\n`);
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise(resolve => server.once('exit', resolve));
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    else server.kill('SIGTERM');
    await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 5000).unref())]);
    if (server.exitCode === null && server.signalCode === null) {
      server.kill('SIGKILL');
      await stopped;
    }
  }
}
