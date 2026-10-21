import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defaultHospitalityCatalog, publicHospitalityCatalog } from '../packages/shared/index.ts';
import { inquiryHref, parseInquirySelection, menuDishNames, dishPreview } from '../apps/web/src/components/catering/presentation.ts';

const catalog = publicHospitalityCatalog(defaultHospitalityCatalog);
test('menu and dish choices survive a URL round trip without duplicates', () => {
  const href = inquiryHref(['meny-3', 'meny-1', 'meny-3'], ['meze-1', 'meze-8', 'meze-1']);
  const query = new URL(href, 'https://example.test').searchParams;
  const selection = parseInquirySelection(catalog, { meny: query.getAll('meny'), ratt: query.getAll('ratt') });
  assert.deepEqual(selection, { menuIds: ['meny-1', 'meny-3'], dishIds: ['meze-1', 'meze-8'] });
});
test('query choices cannot restore a hidden or unknown catalog item', () => {
  const filtered = { ...catalog, menus: catalog.menus.slice(1), dishes: catalog.dishes.slice(1) };
  assert.deepEqual(parseInquirySelection(filtered, { meny: ['meny-1', 'private-menu', 'meny-2'], ratt: ['meze-1', 'unknown', 'meze-6'] }),
    { menuIds: ['meny-2'], dishIds: ['meze-6'] });
  assert.deepEqual(parseInquirySelection(catalog, {}), { menuIds: [], dishIds: [] });
});
test('selection IDs containing punctuation are encoded and preserved independently', () => {
  const custom = { ...catalog, menus: [{ ...catalog.menus[0], id: 'a,b & c' }], dishes: [] };
  const params = new URL(inquiryHref(['a,b & c'], []), 'https://example.test').searchParams;
  assert.deepEqual(parseInquirySelection(custom, { meny: params.getAll('meny') }).menuIds, ['a,b & c']);
});
test('all supplied menu dishes have an individual photo focal point', () => {
  for (const menu of catalog.menus) for (const name of menuDishNames(menu)) assert.ok(dishPreview(name), name);
  for (const dish of catalog.dishes) assert.ok(dishPreview(dish.name), dish.name);
  assert.equal(dishPreview('Unpublished custom dish'), undefined);
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
