// Real local PostgreSQL/PostgREST/Next roundtrip. No production credentials or provider network.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { startTestEnvironment } from '../test-support/local/environment.mjs';

const isolated = await startTestEnvironment();
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };
const call = async (route, method = 'GET', body, authenticated = false, extraHeaders = {}) => {
  const response = await fetch(new URL(route, isolated.origin), {
    method, redirect: 'manual', signal: AbortSignal.timeout(60000),
    headers: { 'Content-Type': 'application/json', Origin: isolated.origin, ...(authenticated ? { Cookie: isolated.adminCookie } : {}), ...extraHeaders },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  return { status: response.status, data, text };
};
let record;
async function save(catalog, extra = {}) {
  const result = await call('/api/admin/hospitality', 'PATCH', { catalog, revision: record.revision, ...extra }, true);
  if (result.status === 200) record = result.data;
  return result;
}
async function assertMissing(route, detailClass) {
  const response = await call(route);
  const rendered = response.text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  check(response.status === 404 && !rendered.includes(`class="${detailClass}"`), `Unpublished ${route} returns HTTP404 without detail content (received ${response.status})`);
}

try {
  check((await call('/api/admin/hospitality')).status === 401, 'Private content GET requires an admin session');
  check((await call('/api/admin/hospitality', 'PATCH', {})).status === 401, 'Content mutation requires an admin session');
  check((await call('/api/admin/hospitality', 'PATCH', {}, true, { Origin: 'https://foreign.example.test' })).status === 403, 'A foreign origin cannot mutate content');
  const initial = await call('/api/hospitality');
  check(initial.status === 200 && initial.data.preview && initial.data.venues.length === 0, 'Public draft catalog never exposes four private venue slots');
  assert.deepEqual(initial.data.menus.map(menu => menu.pricePerPerson), [250, 300, 399, null]); assertions++;
  const inspirationOverview = await call('/festlokal');
  check(inspirationOverview.status === 200 && (inspirationOverview.text.match(/\bdata-venue-card=/g) || []).length === 4 && inspirationOverview.text.includes('Inspirationsbilder'), 'Preview renders four explicitly illustrated venue cards without publishing private records');
  for (let number = 1; number <= 4; number++) {
    const inspiration = await call(`/festlokal/festlokal-${number}`);
    const rendered = inspiration.text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    check(inspiration.status === 200 && rendered.includes(`Festlokal ${number}`) && rendered.includes('Inspirationsbilder') && rendered.includes(`/videos/venues/festlokal-${number}.mp4`), 'Each preview inspiration has its own page and real slideshow asset');
    check(/<meta\b(?=[^>]*\bname="robots")(?=[^>]*\bcontent="[^"]*noindex)[^>]*>/i.test(rendered), 'Illustrated venue pages are noindex');
    check(rendered.includes('tel:+4621415711') && !/href="mailto:|<form\b/i.test(rendered), 'Illustrated venue booking uses only the verified business phone');
    await assertMissing(`/festlokal/lokal-${number}`, 'venue-detail');
  }
  const admin = await call('/api/admin/hospitality', 'GET', undefined, true);
  check(admin.status === 200 && admin.data.persistent && admin.data.catalog.venues.length === 4, 'Authenticated editor reads the common database and four drafts');
  record = admin.data;
  let catalog = structuredClone(record.catalog); catalog.menus[0].pricePerPerson = 275;
  check((await save(catalog)).status === 200, 'Authenticated price change is saved');
  check((await call('/api/hospitality')).data.menus[0].pricePerPerson === 275, 'Price change reaches the same public catalog used by mobile');
  const menuPage = await call('/catering/meny-1');
  check(menuPage.status === 200 && /275/.test(menuPage.text), 'Server rendered menu reads the edited database value');
  catalog = structuredClone(record.catalog); catalog.menus[0].published = false;
  check((await save(catalog)).status === 200, 'A menu can be unpublished');
  check(!(await call('/api/hospitality')).data.menus.some(menu => menu.id === 'meny-1'), 'Unpublished menu is removed from the public catalog');
  await assertMissing('/catering/meny-1', 'menu-detail');
  catalog = structuredClone(record.catalog); catalog.menus[0].published = true;
  catalog.venues[0].published = true;
  check((await save(catalog)).status === 400, 'Incomplete and unapproved venue publication is rejected');
  catalog = structuredClone(record.catalog);
  Object.assign(catalog.venues[0], { slug: 'syntetisk-testlokal-1', name: 'SYNTHETIC testlokal 1', description: 'Isolerat testunderlag, ingen verklig lokal.', capacity: 42, address: 'Syntetisk testadress 1', facilities: ['Syntetisk testfacilitet'], phone: '0211234567', images: [{ src: '/images/catering-fest/dukning.webp', alt: 'Syntetiskt testfoto 1' }, { src: '/images/catering-fest/catering.webp', alt: 'Syntetiskt testfoto 2' }], approved: true, published: true });
  check((await save(catalog)).status === 200, 'Complete verified venue record can be published');
  check((await call('/api/hospitality')).data.venues.length === 1, 'Only the single approved venue reaches the public API');
  const venuePage = await call('/festlokal/syntetisk-testlokal-1');
  check(venuePage.status === 200 && venuePage.text.includes('tel:+46211234567') && venuePage.text.includes('42'), 'Venue detail uses its own verified phone and capacity');
  check(venuePage.text.includes('Syntetisk testadress 1') && venuePage.text.includes('Syntetisk testfacilitet'), 'Published venue detail preserves its own verified address and facilities');
  catalog = structuredClone(record.catalog); catalog.venues[0].slug = 'festlokal-1';
  check((await save(catalog)).status === 200, 'A verified venue can use a slug also present in the illustration set');
  const matchingSlug = await call('/festlokal/festlokal-1');
  check(matchingSlug.status === 200 && matchingSlug.text.includes('SYNTHETIC testlokal 1') && matchingSlug.text.includes('tel:+46211234567') && matchingSlug.text.includes('Syntetisk testadress 1') && !matchingSlug.text.includes('Inspirationsbilder'), 'A published venue wins a matching illustration slug and renders its own verified facts');
  catalog = structuredClone(record.catalog); catalog.venues[0].slug = 'syntetisk-testlokal-1';
  check((await save(catalog)).status === 200, 'The isolated venue fixture can restore its original slug');
  catalog = structuredClone(record.catalog);
  for (let index = 1; index < 4; index++) Object.assign(catalog.venues[index], { ...catalog.venues[0], id: catalog.venues[index].id, slug: `syntetisk-testlokal-${index + 1}`, name: `SYNTHETIC testlokal ${index + 1}`, address: `Syntetisk testadress ${index + 1}`, capacity: 42 + index });
  check((await save(catalog)).status === 200, 'Four synthetic venue fixtures are published only inside the isolated test database');
  check((await call('/api/hospitality')).data.venues.length === 4, 'All four independently published fixtures reach the catalog');
  for (let index = 0; index < 4; index++) {
    const detail = await call(`/festlokal/syntetisk-testlokal-${index + 1}`);
    check(detail.status === 200 && detail.text.includes(`SYNTHETIC testlokal ${index + 1}`) && (detail.text.match(/\bdata-venue-thumbnail=/g) || []).length === catalog.venues[index].images.length && detail.text.includes('Syntetiskt testfoto 2'), 'Every fixture detail renders every image button, its gallery alt text and its own name');
  }
  const browserCheckAt = process.argv.indexOf('--browser-check');
  if (browserCheckAt >= 0) {
    const browserCheck = await import(pathToFileURL(path.resolve(process.argv[browserCheckAt + 1])).href);
    await browserCheck.run({ origin: isolated.origin, cookie: isolated.adminCookie });
  }
  catalog = structuredClone(record.catalog); catalog.venues[0].published = false;
  for (const venue of catalog.venues) venue.published = false;
  check((await save(catalog)).status === 200, 'A venue can be unpublished');
  await assertMissing('/festlokal/syntetisk-testlokal-1', 'venue-detail');
  const preview = await call('/api/hospitality?preview=true');
  check(preview.data.venues.length === 0 && !JSON.stringify(preview.data).includes('Syntetisk testadress'), 'A preview query cannot bypass private venue filtering');
  catalog = structuredClone(record.catalog); catalog.menus[0].slug = 'forfragan';
  check((await save(catalog)).status === 400, 'Menu slugs cannot shadow the inquiry route');
  catalog = structuredClone(record.catalog); catalog.contact.email = 'new-owner@example.test';
  check((await save(catalog)).status === 400, 'A changed address cannot inherit the previous verified email flag');
  catalog.contact.emailVerified = false;
  check((await save(catalog)).status === 200, 'An unverified recipient can be saved privately for review');
  check((await call('/api/hospitality')).data.contact.email === '', 'Unverified recipient never appears in the public API');
  const unverifiedContact = await call('/kontakt');
  check(unverifiedContact.status === 200 && !unverifiedContact.text.includes('new-owner@example.test') && !unverifiedContact.text.includes('href="mailto:'), 'Contact page never exposes an unverified recipient or email action');
  catalog = structuredClone(record.catalog); catalog.contact.email = 'approved-owner@example.test'; catalog.contact.emailVerified = true;
  check((await save(catalog, { emailVerificationConfirmed: true })).status === 200, 'Changed recipient can be explicitly confirmed');
  check((await call('/api/hospitality')).data.contact.email === 'approved-owner@example.test', 'Explicitly confirmed recipient reaches customers');
  const verifiedContact = await call('/kontakt');
  check(verifiedContact.status === 200 && verifiedContact.text.includes('href="mailto:approved-owner@example.test'), 'Contact page uses the newly confirmed recipient without a rebuild');
  const revision = record.revision;
  const left = structuredClone(record.catalog); left.menus[1].pricePerPerson = 301;
  const right = structuredClone(record.catalog); right.menus[1].pricePerPerson = 302;
  const simultaneous = await Promise.all([
    call('/api/admin/hospitality', 'PATCH', { catalog: left, revision }, true),
    call('/api/admin/hospitality', 'PATCH', { catalog: right, revision }, true),
  ]);
  assert.deepEqual(simultaneous.map(result => result.status).sort(), [200, 409]); assertions++;
  record = simultaneous.find(result => result.status === 200).data;
  catalog = structuredClone(record.catalog); catalog.preview = false; catalog.contact.approved = true;
  for (const menu of catalog.menus) menu.approved = true;
  for (const dish of catalog.dishes) dish.approved = true;
  check((await save(catalog)).status === 400, 'Final release requires verified allergen information');
  for (const menu of catalog.menus) menu.allergensVerified = true;
  check((await save(catalog)).status === 200, 'Owner can release verified catering while incomplete venues stay unpublished');
  const released = await call('/api/hospitality');
  check(released.data.preview === false && released.data.venues.length === 0, 'Release never publishes incomplete venues');
  for (let number = 1; number <= 4; number++) await assertMissing(`/festlokal/festlokal-${number}`, 'venue-detail');
  await assertMissing('/festlokal/festlokal-1?preview=true', 'venue-detail');
  const releasedOverview = await call('/festlokal');
  check(releasedOverview.status === 200 && !releasedOverview.text.includes('data-venue-card=') && !releasedOverview.text.includes('Inspirationsbilder'), 'Released overview cannot fall back to illustrations when no venue is published');
  check(isolated.rows('select count(*)::int n from public.orders')[0].n === 0, 'Content edits create no customer orders');
  check(isolated.rows('select count(*)::int n from public.payment_attempts')[0].n === 0, 'Content edits create no payment attempts');
  check(isolated.mails.size === 0, 'Content editing sends no provider emails');
  process.stdout.write(`HOSPITALITY HTTP INTEGRATION PASSED ${JSON.stringify({ assertions, realLocalPostgres: true, authenticatedEdits: true, publishedViews: true, externalNetwork: false })}\n`);
} finally { await isolated.stop(); }
