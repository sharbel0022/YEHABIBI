import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  buildCateringEmail, cateringMailto, defaultHospitalityCatalog, hospitalityCatalogSchema,
  phoneHref, publicHospitalityCatalog, publicHospitalityCatalogSchema,
} from '../packages/shared/index.ts';
import { getDishPhoto, getPlockDish, plockCategories } from '../apps/web/src/components/catering/plock-data.ts';

const clone = () => structuredClone(defaultHospitalityCatalog);
const contentMigration = readFileSync(new URL('../supabase/migrations/20261021151657_hospitality_content_catalog.sql', import.meta.url), 'utf8');
const plockMigration = readFileSync(new URL('../supabase/migrations/20261021180000_plock_dish_choices.sql', import.meta.url), 'utf8');
test('catering keeps source prices, separate grill and exact meze without inventing a plock price', () => {
  assert.equal(hospitalityCatalogSchema.safeParse(defaultHospitalityCatalog).success, true);
  assert.deepEqual(defaultHospitalityCatalog.menus.map(menu => menu.pricePerPerson), [250, 300, 399, null]);
  assert.deepEqual(defaultHospitalityCatalog.menus.map(menu => menu.meze.length), [5, 8, 10, 0]);
  assert.match(defaultHospitalityCatalog.menus[2].grill, /lammspett/);
  assert.ok(defaultHospitalityCatalog.menus.every(menu => !menu.approved));
  assert.ok(defaultHospitalityCatalog.menus.every(menu => !menu.allergensVerified && menu.allergens.length === 0));
  assert.equal(defaultHospitalityCatalog.dishes.length, 20);
  for (const id of ['meze-5', 'meze-10']) assert.equal(defaultHospitalityCatalog.dishes.find(dish => dish.id === id).category, 'Sallader');
});

test('plock dishes keep source photos and category fallbacks when the owner changes IDs or publishes new dishes', () => {
  assert.deepEqual(plockCategories.map(category => category.id), ['cold', 'salads', 'warm', 'grill', 'sides', 'dessert']);
  assert.equal(defaultHospitalityCatalog.dishes.filter(dish => getPlockDish(dish).image).length, 19);
  assert.equal(getDishPhoto('  HUMMUS  '), '/images/plock/hummus.jpg');
  assert.equal(getDishPhoto('Mixgrill Special (nöt-, kyckling- och lammspett)'), '/images/plock/mixgrill.jpg');
  assert.equal(getPlockDish({ id: 'owner-hummus', name: 'Hummus', category: 'Kalla meze', approved: true, published: true }).image, '/images/plock/hummus.jpg');
  assert.equal(getPlockDish({ id: 'owner-dish', name: 'Ägarens ris', category: 'Tillbehör', approved: true, published: true }).categoryId, 'sides');
  for (const name of ['Ny publicerad rätt', '__proto__', 'constructor']) {
    const presentation = getPlockDish({ id: 'custom', name, category: 'constructor', approved: true, published: true });
    assert.equal(presentation.categoryId, 'other'); assert.equal(presentation.image, undefined);
    assert.equal(typeof presentation.description, 'string');
  }
});

test('public catalog hides venue drafts and unverified email even when preview is requested', () => {
  const catalog = clone();
  catalog.contact.email = 'unconfirmed@example.test'; catalog.contact.emailVerified = false;
  catalog.venues[0].description = 'PRIVATE OWNER DRAFT';
  const result = publicHospitalityCatalog(catalog);
  assert.equal(result.venues.length, 0); assert.equal(result.contact.email, '');
  assert.ok(!JSON.stringify(result).includes('PRIVATE OWNER DRAFT'));
  assert.equal(publicHospitalityCatalogSchema.safeParse(result).success, true);
  assert.equal(publicHospitalityCatalogSchema.safeParse({ ...result, venues: catalog.venues }).success, false);
  assert.equal(catalog.venues.length, 4); assert.equal(catalog.contact.email, 'unconfirmed@example.test');
});

test('only fully approved venue facts can become public, and publication is independently reversible', () => {
  const catalog = clone(); const venue = catalog.venues[0];
  venue.published = true;
  assert.equal(hospitalityCatalogSchema.safeParse(catalog).success, false);
  Object.assign(venue, { name: 'Godkänt testnamn', slug: 'godkant-testnamn', description: 'Verifierad testlokal.', capacity: 60, address: 'Testadress 1', phone: '021415711', images: [{ src: '/images/verified.webp', alt: 'Testlokalens godkända foto' }], approved: true });
  assert.equal(hospitalityCatalogSchema.safeParse(catalog).success, true);
  assert.equal(publicHospitalityCatalog(catalog).venues.length, 1);
  venue.published = false; assert.equal(publicHospitalityCatalog(catalog).venues.length, 0);
});

test('draft release needs owner approval and all content uses safe, distinct public slugs and media', () => {
  const catalog = clone(); catalog.preview = false;
  assert.equal(hospitalityCatalogSchema.safeParse(catalog).success, false);
  catalog.preview = true; catalog.menus[1].slug = catalog.menus[0].slug;
  assert.equal(hospitalityCatalogSchema.safeParse(catalog).success, false);
  for (const image of ['javascript:alert(1)', 'http://insecure.example/image.jpg', '/images/../secret', 'https://user:password@example.test/image.jpg']) {
    const invalid = clone(); invalid.menus[0].image = image;
    assert.equal(hospitalityCatalogSchema.safeParse(invalid).success, false, image);
  }
});

test('catering inquiry route is reserved and only verified allergen information can be released', () => {
  const reserved = clone(); reserved.menus[0].slug = 'forfragan';
  assert.equal(hospitalityCatalogSchema.safeParse(reserved).success, false);
  const draft = clone(); draft.menus[0].allergens = ['PRIVATE UNVERIFIED ALLERGEN NOTE'];
  assert.deepEqual(publicHospitalityCatalog(draft).menus[0].allergens, []);
  const catalog = clone(); catalog.preview = false; catalog.contact.approved = true;
  for (const menu of catalog.menus) menu.approved = true;
  for (const dish of catalog.dishes) dish.approved = true;
  assert.equal(hospitalityCatalogSchema.safeParse(catalog).success, false);
  assert.equal(publicHospitalityCatalog(catalog).menus.length, 0);
  for (const menu of catalog.menus) menu.allergensVerified = true;
  catalog.menus[0].allergens = ['Sesam'];
  assert.equal(hospitalityCatalogSchema.safeParse(catalog).success, true);
  assert.deepEqual(publicHospitalityCatalog(catalog).menus[0].allergens, ['Sesam']);
  assert.equal(publicHospitalityCatalogSchema.safeParse(publicHospitalityCatalog(catalog)).success, true);
});

test('email opens an encoded customer draft with complete selections and never claims it was sent', () => {
  const body = buildCateringEmail({ name: 'Test Kund', phone: '0701234567', email: 'test@example.test', people: 30, date: '2026-12-05', time: '18:30', fulfillment: 'Leverans', menuName: 'Meny 2 – 8 Meze', extraDishes: ['Hummus', 'Ostrulle'], allergies: 'Kontakta oss om sesam', message: 'Ring före leverans' });
  const link = cateringMailto(defaultHospitalityCatalog.contact.email, 'Meny 2 – 8 Meze', body);
  const parsed = new URL(link);
  assert.equal(parsed.protocol, 'mailto:'); assert.equal(parsed.pathname, 'sharbelrasho@gmail.com');
  assert.equal(parsed.searchParams.get('subject'), 'Cateringförfrågan – Meny 2 – 8 Meze');
  assert.equal(parsed.searchParams.get('body'), body); assert.match(body, /Antal personer: 30/); assert.match(body, /Hummus, Ostrulle/);
  assert.match(body, /personliga bekräftelse/); assert.equal(cateringMailto('', 'Meny 1'), null);
  assert.equal(cateringMailto('owner@example.test\r\nBcc:attacker@example.test', 'Meny 1'), null);
  const encoded = new URL(cateringMailto('owner+test@example.test', 'Meny? & extra\nBcc: test'));
  assert.equal(encoded.searchParams.get('subject'), 'Cateringförfrågan – Meny? & extra Bcc: test');
});

test('phone links normalize the verified Swedish number and reject executable URLs', () => {
  assert.equal(phoneHref('021-41 57 11'), 'tel:+4621415711');
  assert.equal(phoneHref('+46 (21) 41 57 11'), 'tel:+4621415711');
  assert.equal(phoneHref('0046 21 41 57 11'), 'tel:+4621415711');
  for (const invalid of ['', 'javascript:alert(1)', '+46;ext=1', '021#123']) assert.equal(phoneHref(invalid), '');
});

test('additive content migration preserves history, denies public access and supports concurrent edit protection', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.orders(id text primary key, stripe_checkout_session_id text); insert into public.orders values ('historic','cs_original');`);
    await db.exec(contentMigration);
    await db.exec(plockMigration);
    const { rows } = await db.query('select catalog,revision from public.hospitality_content where id=1');
    assert.deepEqual(rows[0].catalog, defaultHospitalityCatalog);
    await db.exec(plockMigration);
    assert.deepEqual((await db.query('select catalog,revision from public.hospitality_content where id=1')).rows, rows);
    assert.deepEqual((await db.query('select * from public.orders')).rows, [{ id: 'historic', stripe_checkout_session_id: 'cs_original' }]);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.exec('select * from public.hospitality_content'), /permission denied/);
      await assert.rejects(db.exec('update public.hospitality_content set revision=2'), /permission denied/);
      await assert.rejects(db.exec('delete from public.hospitality_content'), /permission denied/);
      await assert.rejects(db.exec('insert into public.hospitality_content select * from public.hospitality_content'), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('grant usage on schema public to service_role; set role service_role');
    const edited = clone(); edited.menus[0].pricePerPerson = 275; edited.menus[0].allergens = ['Sesam']; edited.menus[0].allergensVerified = true;
    const first = await db.query('update public.hospitality_content set catalog=$1::jsonb, revision=revision+1 where id=1 and revision=$2 returning revision', [JSON.stringify(edited), rows[0].revision]);
    const stale = await db.query('update public.hospitality_content set revision=revision+1 where id=1 and revision=$1 returning revision', [rows[0].revision]);
    assert.equal(first.rows[0].revision, rows[0].revision + 1); assert.equal(stale.rows.length, 0);
    const saved = (await db.query('select catalog from public.hospitality_content where id=1')).rows[0].catalog;
    assert.equal(saved.menus[0].pricePerPerson, 275); assert.deepEqual(publicHospitalityCatalog(saved).menus[0].allergens, ['Sesam']);
    await assert.rejects(db.exec("update public.hospitality_content set catalog='{}'::jsonb"), /check constraint/);
    await assert.rejects(db.exec('delete from public.hospitality_content'), /permission denied/);
  } finally { await db.close(); }
});

test('plock catalog migration is idempotent and preserves owner edits and publication outside preview', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(contentMigration);
    const original = (await db.query('select catalog from public.hospitality_content where id=1')).rows[0].catalog;
    original.preview = false;
    original.contact.approved = true;
    for (const menu of original.menus) Object.assign(menu, { approved: true, allergensVerified: true });
    for (const dish of original.dishes) dish.approved = true;
    original.dishes[4].category = 'Ägarens sallader';
    const ownedFalafel = { id: 'meze-11', name: 'Ägarens falafel', category: 'Ägarens kategori', approved: true, published: false };
    original.dishes.push(ownedFalafel);
    assert.equal(hospitalityCatalogSchema.safeParse(original).success, true);
    await db.query('update public.hospitality_content set catalog=$1::jsonb where id=1', [JSON.stringify(original)]);
    await db.exec(plockMigration);
    const first = (await db.query('select catalog,revision from public.hospitality_content where id=1')).rows[0];
    assert.deepEqual(first.catalog.dishes.slice(0, original.dishes.length), original.dishes);
    assert.deepEqual(first.catalog.dishes.find(dish => dish.id === 'meze-11'), ownedFalafel);
    assert.equal(first.catalog.dishes.length, 20);
    assert.equal(hospitalityCatalogSchema.safeParse(first.catalog).success, true);
    for (const dish of first.catalog.dishes.slice(original.dishes.length)) {
      assert.equal(dish.published, false); assert.equal(dish.approved, false);
    }
    await db.exec(plockMigration);
    assert.deepEqual((await db.query('select catalog,revision from public.hospitality_content where id=1')).rows[0], first);
  } finally { await db.close(); }
});

test('plock migration preserves a full owner catalog within the existing dish limit', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(contentMigration);
    const catalog = clone();
    catalog.dishes = Array.from({ length: 100 }, (_, index) => ({ id: `owner-${index}`, name: `Ägarens rätt ${index}`, category: 'Ägarens kategori', approved: false, published: false }));
    await db.query('update public.hospitality_content set catalog=$1::jsonb where id=1', [JSON.stringify(catalog)]);
    const before = (await db.query('select catalog,revision from public.hospitality_content where id=1')).rows[0];
    await db.exec(plockMigration);
    assert.deepEqual((await db.query('select catalog,revision from public.hospitality_content where id=1')).rows[0], before);
  } finally { await db.close(); }
});
