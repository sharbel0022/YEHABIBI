import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defaultHospitalityCatalog, publicHospitalityCatalog } from '../packages/shared/index.ts';
import { inquiryHref, normalizeSelection, parseInquirySelection, menuDishNames, dishPreview } from '../apps/web/src/components/catering/presentation.ts';
import { getDishPhoto } from '../apps/web/src/components/catering/plock-data.ts';

const catalog = publicHospitalityCatalog(defaultHospitalityCatalog);
test('menu and dish choices survive a URL round trip without duplicates', () => {
  const href = inquiryHref(['meny-3', 'meny-1', 'meny-3'], ['meze-1', 'meze-8', 'meze-1'], { 'meze-1': 3, 'meze-8': 999 });
  const query = new URL(href, 'https://example.test').searchParams;
  const selection = parseInquirySelection(catalog, { meny: query.getAll('meny'), ratt: query.getAll('ratt'), antal: query.getAll('antal') });
  assert.deepEqual(query.getAll('ratt'), ['meze-1', 'meze-8']);
  assert.deepEqual(query.getAll('antal'), ['3', '999']);
  assert.deepEqual(selection, { menuIds: ['meny-1', 'meny-3'], dishIds: ['meze-1', 'meze-8'], quantities: { 'meze-1': 3, 'meze-8': 999 } });
});

test('legacy dish links with no quantity request one of each dish', () => {
  assert.deepEqual(parseInquirySelection(catalog, { ratt: 'meze-1' }), { menuIds: [], dishIds: ['meze-1'], quantities: { 'meze-1': 1 } });
  assert.deepEqual(parseInquirySelection(catalog, { ratt: ['meze-8', 'meze-1'] }), { menuIds: [], dishIds: ['meze-1', 'meze-8'], quantities: { 'meze-1': 1, 'meze-8': 1 } });
});

test('invalid counts are discarded while unknown IDs do not shift another dish quantity', () => {
  for (const antal of ['0', '-1', '1000', '1.5', 'NaN', '', 'Infinity', '1,2', '1:2', 'true']) {
    assert.deepEqual(parseInquirySelection(catalog, { ratt: 'meze-1', antal }), { menuIds: [], dishIds: [], quantities: {} }, antal);
  }
  assert.deepEqual(parseInquirySelection(catalog, { ratt: ['unknown', 'meze-1', 'meze-8'], antal: ['99', '4', '0'] }),
    { menuIds: [], dishIds: ['meze-1'], quantities: { 'meze-1': 4 } });
  assert.deepEqual(parseInquirySelection(catalog, { ratt: ['meze-1', 'meze-1', 'meze-8'], antal: ['2', '8', '3'] }),
    { menuIds: [], dishIds: ['meze-1', 'meze-8'], quantities: { 'meze-1': 2, 'meze-8': 3 } });
});
test('query choices cannot restore a hidden or unknown catalog item', () => {
  const filtered = { ...catalog, menus: catalog.menus.slice(1), dishes: catalog.dishes.slice(1) };
  assert.deepEqual(parseInquirySelection(filtered, { meny: ['meny-1', 'private-menu', 'meny-2'], ratt: ['meze-1', 'unknown', 'meze-6'] }),
    { menuIds: ['meny-2'], dishIds: ['meze-6'], quantities: { 'meze-6': 1 } });
  assert.deepEqual(parseInquirySelection(catalog, {}), { menuIds: [], dishIds: [], quantities: {} });
});
test('selection IDs containing colons and commas remain distinct when duplicated and encoded', () => {
  const menuId = 'meny:a,b & c'; const firstId = 'rätt:a,b & c'; const secondId = 'rätt:a,b';
  const custom = { ...catalog, menus: [{ ...catalog.menus[0], id: menuId }], dishes: [{ ...catalog.dishes[0], id: firstId }, { ...catalog.dishes[1], id: secondId }] };
  const params = new URL(inquiryHref([menuId, menuId], [secondId, firstId, secondId], { [firstId]: 4, [secondId]: 2 }), 'https://example.test').searchParams;
  assert.deepEqual(params.getAll('ratt'), [secondId, firstId]);
  assert.deepEqual(parseInquirySelection(custom, { meny: params.getAll('meny'), ratt: params.getAll('ratt'), antal: params.getAll('antal') }),
    { menuIds: [menuId], dishIds: [firstId, secondId], quantities: { [firstId]: 4, [secondId]: 2 } });
});

test('stored drafts whitelist public menu IDs and quantities without restoring PII or hidden dishes', () => {
  const filtered = { ...catalog, menus: catalog.menus.slice(1), dishes: catalog.dishes.slice(1) };
  const raw = {
    menuIds: ['meny-1', 'meny-2', 'private-menu', 'meny-2'],
    quantities: { 'meze-1': 2, 'meze-6': '3', 'meze-7': 0, hidden: 9 },
    dishIds: ['meze-1', 'meze-2', 'hidden'],
    name: 'PRIVATE NAME', email: 'private@example.test', phone: '0701112233', address: 'PRIVATE ADDRESS', allergies: 'PRIVATE ALLERGIES', message: 'PRIVATE MESSAGE',
  };
  const result = normalizeSelection(filtered, raw);
  assert.deepEqual(result, { menuIds: ['meny-2'], dishIds: ['meze-6'], quantities: { 'meze-6': 3 } });
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.ok(!JSON.stringify(result).includes('private@example.test'));
  assert.deepEqual(normalizeSelection(catalog, { dishIds: ['meze-1'] }), { menuIds: [], dishIds: [], quantities: {} });
  for (const invalid of [null, undefined, false, 'a draft', 2, { menuIds: 'meny-1', quantities: { 'meze-1': false, 'meze-2': [2], 'meze-3': null } }]) {
    assert.deepEqual(normalizeSelection(catalog, invalid), { menuIds: [], dishIds: [], quantities: {} });
  }
  assert.deepEqual(normalizeSelection(catalog, { quantities: Object.create({ 'meze-1': 3 }) }), { menuIds: [], dishIds: [], quantities: {} });
});
test('all supplied menu dishes have an individual photo focal point', () => {
  for (const menu of catalog.menus) for (const name of menuDishNames(menu)) assert.ok(dishPreview(name), name);
  for (const dish of catalog.dishes) assert.ok(getDishPhoto(dish.name) || dishPreview(dish.name), dish.name);
  assert.equal(dishPreview('Unpublished custom dish'), undefined);
});

test('plock photos match the documented original Word media SHA256 hashes', () => {
  const manifest = JSON.parse(readFileSync(new URL('../apps/web/public/images/plock/sources.json', import.meta.url), 'utf8'));
  assert.equal(manifest.sourceDocument, 'Yei_Habibi_Plockmeny_Bilder_och_Interaktion.docx');
  assert.equal(manifest.files.length, 18);
  assert.deepEqual(manifest.files.map(file => file.sourceMedia), Array.from({ length: 18 }, (_, index) => `word/media/image${index + 9}.jpg`));
  assert.equal(new Set(manifest.files.map(file => file.file)).size, 18);
  for (const file of manifest.files) {
    const bytes = readFileSync(new URL(`../apps/web/public/images/plock/${file.file}`, import.meta.url));
    assert.equal(bytes.length, file.bytes, file.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
  }
});
test('the four original supplied menu posters remain byte-identical', () => {
  const hashes = {
    'meny-1': 'e84f8e11d1c0ea501fe5e05ee2f246d571ecb362fe7b687715b88bb4ce72e196',
    'meny-2': 'c57bafe5154ee64c61ded17dd30f39e1537195c8e804ed3ff41eae7ebe62a557',
    'meny-3': '82f8991e9b6d5245a481f1ea7073bc23048cf1f86229528e567634ba0a99a402',
    'plockmeny': 'bc0db890d0f0ecf6a95714b8522cf31d9fd18e67d5dff0b193e7785adac5fd92',
  };
  for (const [name, hash] of Object.entries(hashes)) {
    const bytes = readFileSync(new URL(`../apps/web/public/images/catering/${name}.png`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, name);
  }
});
