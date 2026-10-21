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

function renderedHtml(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

function visibleText(html) {
  return renderedHtml(html).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

async function verifyPublicPage(route) {
  const response = await request(route);
  assert.equal(response.status, 200, `${route}: sidan ska svara 200.`);
  assert.match(response.headers.get('content-type') || '', /text\/html/i, `${route}: HTML saknas.`);
  const html = await response.text();
  assert.ok(/<html\b[^>]*\blang="sv"/i.test(html), `${route}: svenskt dokumentspråk saknas.`);
  assert.ok(/<title>[^<]*Yei Habibi[^<]*<\/title>/i.test(html), `${route}: sidtitel med rätt varumärke saknas.`);
  const description = contentOf(html, 'meta', 'name', 'description', 'content');
  assert.ok(description?.length >= 20, `${route}: metabeskrivning saknas.`);
  const canonical = contentOf(html, 'link', 'rel', 'canonical', 'href');
  assert.ok(canonical, `${route}: canonical saknas.`);
  assert.equal(new URL(canonical).href, new URL(route, origin).href, `${route}: fel canonical.`);
  assert.ok(/<main\b[^>]*\bid="main"/i.test(html) && /<h1\b/i.test(html), `${route}: serverrenderat huvudinnehåll saknas.`);
  const rendered = renderedHtml(html);
  assert.doesNotMatch(rendered, /href="\/(?:bestall(?:-nu)?|menyer)(?:[?"#])/i,
    `${route}: den publika kundupplevelsen får inte länka till äldre kassa eller menybyggare.`);
  assert.doesNotMatch(rendered, /href="[^\"]*(?:\/api\/payments|\/checkout|\/__test\/payment)/i,
    `${route}: betalning och testsimulator ska inte vara publika kontaktvägar.`);
  assert.doesNotMatch(visibleText(html), /Cedar Mezze|Apple Pay|Google Pay|Stripe|Swish/i,
    `${route}: äldre varumärke eller betalningsmetoder får inte visas.`);
  return html;
}

try {
  await waitForServer();
  const routes = ['/', '/catering', '/catering/meny-1', '/catering/meny-2', '/catering/meny-3',
    '/catering/plockmeny', '/catering/forfragan', '/festlokal', '/om-oss', '/kontakt',
    '/festcatering-vasteras', '/foretagscatering-vasteras', '/integritet', '/villkor'];
  routes.push(...[1, 2, 3, 4].map(number => `/festlokal/festlokal-${number}`));
  const pages = new Map();
  for (const route of routes) pages.set(route, await verifyPublicPage(route));

  const home = renderedHtml(pages.get('/'));
  for (const href of ['/catering', '/festlokal']) {
    assert.ok(home.includes(`href="${href}"`), `${href}: startsidans huvudval ska kunna öppnas utan JavaScript.`);
  }
  const menuHtml = renderedHtml(pages.get('/catering'));
  assert.equal((menuHtml.match(/<article\b[^>]*\bdata-catering-menu=/g) || []).length,
    4, 'Cateringsidan ska serverrendera tre fasta menyer och en plockmeny.');
  for (const poster of ['meny-1', 'meny-2', 'meny-3', 'plockmeny']) {
    assert.ok(menuHtml.includes(`/images/catering/${poster}.png`), `${poster}: användarens menybild saknas.`);
  }
  assert.equal((menuHtml.match(/<article\b[^>]*\bdata-plock-dish=/g) || []).length, 20,
    'Plockmenyn ska serverrendera alla publika rätter inklusive de nya Word-förslagen.');
  for (const photo of ['hummus', 'muhammara', 'baklava', 'kycklingspett', 'ris']) {
    assert.ok(menuHtml.includes(`/images/plock/${photo}.jpg`), `${photo}: separat rättbild saknas.`);
  }
  const selectedResponse = await request('/catering/forfragan?ratt=meze-1&antal=3&ratt=dessert-1&antal=2');
  assert.equal(selectedResponse.status, 200);
  const selectedInquiry = visibleText(await selectedResponse.text());
  assert.match(selectedInquiry, /Hummus\s+3\s+× önskat antal/);
  assert.match(selectedInquiry, /Baklava\s+2\s+× önskat antal/);
  const menuExpectations = [
    ['/catering/meny-1', 'Lilla Meny 1', '250 kr/person', ['Hummus', 'Muhammara', 'Baba Ganoush', 'Labne', 'Fatoush', 'Mixgrill']],
    ['/catering/meny-2', 'Meny 2', '300 kr/person', ['Hummus', 'Ostrulle', 'Sambosak', 'Kubbe', 'Mixgrill']],
    ['/catering/meny-3', 'Meny 3', '399 kr/person', ['Tarator Djaj', 'Tabbouleh', 'Kubbe', 'Ostrulle', 'Sambosak', 'Mixgrill Special', 'lammspett']],
    ['/catering/plockmeny', 'Plockmeny', 'Pris enligt offert', []],
  ];
  for (const [route, name, price, dishes] of menuExpectations) {
    const text = visibleText(pages.get(route));
    assert.ok(text.includes(name), `${route}: menynamnet ska finnas utan JavaScript.`);
    assert.ok(text.includes(price), `${route}: rätt prisstatus ska visas.`);
    for (const dish of dishes) assert.ok(text.includes(dish), `${route}: ${dish} saknas i menyinnehållet.`);
    assert.ok(text.includes('Välj denna meny'), `${route}: kunden ska kunna välja menyn.`);
    assert.match(renderedHtml(pages.get(route)), /href="mailto:sharbelrasho@gmail\.com\?subject=/,
      `${route}: menyknappen ska öppna ett utkast till ägarens bekräftade cateringadress.`);
  }
  const inquiry = renderedHtml(pages.get('/catering/forfragan'));
  for (const name of ['name', 'phone', 'email', 'people', 'date', 'time', 'fulfillment', 'menu', 'allergies', 'message']) {
    assert.ok(new RegExp(`\\bname="${name}"`).test(inquiry), `Cateringförfrågan: fältet ${name} saknas.`);
  }
  assert.match(visibleText(inquiry), /Du (?:behöver |skickar )?själv|Du behöver själv skicka mejlet/,
    'Det ska framgå att kunden själv skickar mejlet från sitt e-postprogram.');
  assert.doesNotMatch(visibleText(inquiry), /din (?:bokning|förfrågan) är (?:klar|skickad)/i,
    'Ett oskickat mejlutkast får inte beskrivas som skickat eller bokat.');

  const venuesHtml = renderedHtml(pages.get('/festlokal'));
  assert.ok(venuesHtml.includes('tel:+4621415711'), 'Festkontakt ska använda verifierat telefonnummer.');
  assert.doesNotMatch(venuesHtml, /href="mailto:|<form\b|<input\b[^>]*type="date"/i,
    'Festbokning ska endast gå via telefon, utan mejlbokning, formulär eller kalender.');
  assert.doesNotMatch(visibleText(venuesHtml), /Lokal [1-4]|\b(?:250|120|80|100) gäster\b/,
    'Interna lokalutkast och konstruerade gästantal får inte visas som verkliga lokaler.');
  assert.equal((venuesHtml.match(/\bdata-venue-card=/g) || []).length, 4, 'Översikten ska serverrendera fyra separata inspirationskort.');
  assert.match(visibleText(venuesHtml), /Inspirationsbilder/, 'Illustrationerna ska beskrivas som inspiration.');
  for (const number of [1, 2, 3, 4]) {
    const route = `/festlokal/festlokal-${number}`;
    assert.ok(venuesHtml.includes(`href="${route}"`), `${route}: inspirationskortet ska ha en egen sida.`);
    const html = renderedHtml(pages.get(route));
    assert.match(visibleText(html), new RegExp(`Festlokal ${number}`));
    assert.match(visibleText(html), /Inspirationsbilder/);
    assert.match(contentOf(pages.get(route), 'meta', 'name', 'robots', 'content') || '', /noindex/i, `${route}: inspirationssidan ska inte indexeras.`);
    assert.ok(html.includes('tel:+4621415711'), `${route}: verifierad telefonkontakt saknas.`);
    assert.doesNotMatch(html, /href="mailto:|<form\b|<input\b[^>]*type="date"/i, `${route}: bokning ska gå via telefon.`);
    assert.doesNotMatch(visibleText(html), /Maxkapacitet|\b(?:250|120|80|100) gäster\b/, `${route}: obekräftade lokalfakta får inte hittas på.`);
    assert.equal((html.match(/\bdata-venue-thumbnail=/g) || []).length, 3, `${route}: tre bildknappar ska serverrenderas.`);
    const video = (html.match(/<video\b[^>]*>/gi) || [])[0] || '';
    assert.match(video, /\bcontrols(?:\s|=|>)/i); assert.match(video, /\bplaysinline(?:\s|=|>)/i);
    assert.ok(video.includes(`/videos/venues/festlokal-${number}.mp4`), `${route}: spelbart bildspel saknas.`);
    assert.match(visibleText(html), /Bildspel/i);
    const media = await request(`/videos/venues/festlokal-${number}.mp4`, { headers: { Range: 'bytes=0-31' } });
    assert.equal(media.status, 206, `${route}: MP4 ska stödja delvis uppspelning.`);
    assert.match(media.headers.get('content-type') || '', /video\/mp4/i);
    assert.equal(Buffer.from(await media.arrayBuffer()).subarray(4, 8).toString('ascii'), 'ftyp');
  }
  for (const route of ['/festlokal/lokal-1', '/festlokal/lokal-2', '/festlokal/lokal-3', '/festlokal/lokal-4', '/festlokal/okand-lokal', '/catering/okand-meny']) {
    assert.equal((await request(route)).status, 404, `${route}: opublicerat eller okänt innehåll ska inte bli en publik detaljsida.`);
  }

  for (const route of ['/menyer', '/menyer?val=bygg', '/bestall', '/bestall-nu']) {
    const response = await request(route, { redirect: 'manual' });
    assert.ok([307, 308].includes(response.status), `${route}: äldre publik kassa ska omdirigeras.`);
    const location = response.headers.get('location');
    assert.ok(location, `${route}: omdirigeringens mål saknas.`);
    assert.equal(new URL(location, origin).origin, origin, `${route}: omdirigeringen ska stanna på webbplatsen.`);
    assert.ok(['/catering', '/catering/forfragan', '/kontakt'].includes(new URL(location, origin).pathname),
      `${route}: omdirigeringen ska leda till den nya kontaktupplevelsen.`);
  }

  for (const route of ['/api/hospitality', '/api/hospitality?preview=true']) {
    const response = await request(route);
    assert.equal(response.status, 200, `${route}: gemensam Catering & Fest-katalog ska kunna läsas.`);
    assert.match(response.headers.get('cache-control') || '', /no-store/i, 'Adminändringar får inte döljas av gammal katalogcache.');
    const hospitality = await response.json();
    assert.deepEqual(hospitality.menus.map(menu => menu.pricePerPerson), [250, 300, 399, null], 'Webb och mobil ska läsa källornas priser och offertstatus.');
    assert.deepEqual(hospitality.menus.map(menu => menu.meze.length), [5, 8, 10, 0], 'Grillraden ska bevaras separat från antalet meze.');
    assert.equal(hospitality.contact.email, 'sharbelrasho@gmail.com', 'Endast ägarens bekräftade cateringadress ska visas.');
    assert.equal(hospitality.contact.emailVerified, true, 'Mottagaradressen ska vara verifierad av ägaren.');
    assert.equal(hospitality.contact.phone, '021-41 57 11', 'Gemensamma telefonuppgiften ska följa källan.');
    assert.equal(hospitality.preview, true, 'Ofullständigt innehåll ska vara märkt som utkast.');
    assert.deepEqual(hospitality.venues, [], 'Fyra interna lokalutkast får inte läcka till webb eller Expo.');
    assert.doesNotMatch(JSON.stringify(hospitality), /lokal-[1-4]|SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|payment_methods|checkout_url/,
      'Innehållskatalogen får inte exponera opublicerade lokalposter, hemligheter eller betalningsfunktioner.');
  }

  const catalogResponse = await request('/api/catalog');
  assert.equal(catalogResponse.status, 200, 'Katalog-API ska svara 200.');
  const catalog = await catalogResponse.json();
  assert.equal(catalog.demo, true, 'Röktestet ska använda demonstrationskatalogen.');
  assert.equal(catalog.orders_enabled, false, 'Beställningar ska vara avstängda.');
  assert.equal(catalog.direct_orders_enabled, false, 'Direktbeställningar ska vara avstängda publikt.');
  assert.equal(catalog.dishes.length, 11, 'Det äldre interna katalogkontraktets elva demorätter ska bevaras.');
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

  for (const method of ['GET', 'PATCH']) {
    const response = await request('/api/admin/hospitality', { method,
      ...(method === 'PATCH' ? { headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{}' } : {}) });
    assert.equal(response.status, 401, `Catering & Fest-innehåll: ${method} kräver adminsession.`);
  }
  const foreignMutation = await request('/api/admin/hospitality', { method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.example' }, body: '{}' });
  assert.equal(foreignMutation.status, 403, 'Innehållsändringar från främmande webbsida ska avvisas före databasanrop.');
  const contentAdmin = await request('/admin/innehall');
  assert.equal(contentAdmin.status, 200, 'Skyddad innehållssida ska erbjuda ägarinloggning.');
  const adminHtml = renderedHtml(await contentAdmin.text());
  assert.match(visibleText(adminHtml), /Logga in/, 'Obehöriga ska få inloggning i stället för innehållsredigering.');
  assert.doesNotMatch(adminHtml, /lokal-[1-4]|Lokal [1-4]|name="capacity"|Publicera lokalen/,
    'Inloggningssidan får inte serverrendera privata lokalutkast eller redigeringskontroller.');

  const robots = await request('/robots.txt');
  assert.equal(robots.status, 200, 'robots.txt ska svara 200.');
  assert.ok(/Disallow:\s*\/\s*(?:\r?\n|$)/i.test(await robots.text()), 'Demonstrationen ska blockera indexering.');
  const sitemap = await request('/sitemap.xml');
  assert.equal(sitemap.status, 200, 'sitemap.xml ska svara 200.');
  const sitemapXml = await sitemap.text();
  assert.ok(/<urlset\b/i.test(sitemapXml), 'Sitemap ska vara XML.');
  assert.equal(/<loc>/i.test(sitemapXml), false, 'Avstängd indexering ska ge en tom sitemap.');
  process.stdout.write(`PRODUCTION WEB SMOKE PASSED ${JSON.stringify({ pages: routes.length, serverRenderedMenus: 4, unpublishedVenuesHidden: 4, legacyCatalogPreserved: true, protectedContentAdmin: true, demo: true, externalServices: false })}\n`);
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
