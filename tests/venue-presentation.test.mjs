import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defaultHospitalityCatalog, publicHospitalityCatalog } from '../packages/shared/index.ts';
import { findVenuePresentation, listVenuePresentations, publishedVenuePresentation, venueShowcases } from '../apps/web/src/components/venues/venue-showcases.ts';

const clone = () => structuredClone(defaultHospitalityCatalog);
const readPublic = src => readFileSync(new URL(`../apps/web/public${src}`, import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = {
  'overview-reference.png': '0541133892ff9209ba6f1450ef5c23ba43f8323df32777431431afc978bd97fd',
  'festlokal-1-reference.png': '1ece773d7d8f3f39036e3db38c2b4609985fb1db23e95fe7d0499b2af4bf4d77',
  'festlokal-2-reference.png': 'b85749dc3f1c797fa2b059228b683d8c1f275d50a57afe5fe71f18857414013d',
  'festlokal-3-reference.png': 'eb8829ce43a841c7165aa7b68193f3e1609ef52b764d95d90579574e3c70a085',
  'festlokal-4-reference.png': '7f6adb924ef6c2134c7d448bb90efdbddda90ee8d014e182d86f2e2d7b5d2453',
};

function checkCrop(crop) {
  const { left, top, width, height } = crop;
  assert.ok([left, top, width, height].every(Number.isInteger));
  assert.ok(left >= 0 && top >= 0 && width > 0 && height > 0);
  assert.ok(left + width <= 1448 && top + height <= 1086);
}

test('only preview exposes four standalone illustrations while private venue records stay hidden', () => {
  const privateCatalog = clone();
  privateCatalog.venues[0].description = 'PRIVATE OWNER NOTE';
  privateCatalog.venues[0].address = 'PRIVATE ADDRESS';
  const catalog = publicHospitalityCatalog(privateCatalog);
  assert.deepEqual(catalog.venues, []);
  assert.deepEqual(listVenuePresentations(catalog).map(venue => venue.slug), ['festlokal-1', 'festlokal-2', 'festlokal-3', 'festlokal-4']);
  for (let number = 1; number <= 4; number++) {
    const venue = findVenuePresentation(catalog, `festlokal-${number}`);
    assert.equal(venue.name, `Festlokal ${number}`);
    assert.equal(venue.illustration, true);
    assert.equal(venue.videoLabel, 'Bildspel');
    for (const fact of ['capacity', 'address', 'facilities', 'phone']) assert.equal(venue[fact], undefined);
    assert.equal(findVenuePresentation(catalog, `lokal-${number}`), undefined);
  }
  assert.equal(findVenuePresentation(catalog, 'unknown'), undefined);
  assert.ok(!JSON.stringify(listVenuePresentations(catalog)).includes('PRIVATE'));
  const released = { ...catalog, preview: false };
  assert.deepEqual(listVenuePresentations(released), []);
  for (const venue of venueShowcases) assert.equal(findVenuePresentation(released, venue.slug), undefined);
});

test('a published venue wins matching illustration slugs and retains every verified fact and photo', () => {
  const source = clone();
  const real = source.venues[0];
  Object.assign(real, { slug: 'festlokal-1', name: 'Verifierat testnamn', description: 'Verifierad syntetisk testbeskrivning.', capacity: 42, address: 'Syntetisk testadress 1', facilities: ['Syntetisk testfacilitet'], phone: '0211234567', images: [{ src: '/images/catering-fest/dukning.webp', alt: 'Verifierat testfoto 1' }, { src: '/images/catering-fest/catering.webp', alt: 'Verifierat testfoto 2' }], approved: true, published: true });
  for (const preview of [true, false]) {
    source.preview = preview;
    const catalog = publicHospitalityCatalog(source);
    const venue = findVenuePresentation(catalog, 'festlokal-1');
    assert.deepEqual(venue, publishedVenuePresentation(real));
    for (const fact of ['id', 'slug', 'name', 'description', 'capacity', 'address', 'facilities', 'phone', 'images']) assert.deepEqual(venue[fact], real[fact], fact);
    assert.deepEqual(venue.hero, real.images[0]);
    assert.equal(venue.illustration, undefined); assert.equal(venue.videoSrc, undefined);
    assert.deepEqual(listVenuePresentations(catalog), [venue]);
    assert.equal(findVenuePresentation(catalog, 'lokal-2'), undefined);
    if (!preview) assert.equal(findVenuePresentation(catalog, 'festlokal-2'), undefined);
  }
});

test('all presentation crops remain inside the untouched 1448 by 1086 reference images', () => {
  assert.equal(venueShowcases.length, 4);
  for (const [filename, expected] of Object.entries(sourceHashes)) {
    const bytes = readPublic(`/images/venues/${filename}`);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 1448); assert.equal(bytes.readUInt32BE(20), 1086);
    assert.equal(hash(bytes), expected, filename);
  }
  for (const venue of venueShowcases) {
    assert.equal(venue.images.length, 3);
    for (const asset of [venue.hero, venue.cardImage, ...venue.images]) {
      assert.ok(asset.alt.includes('inspirationsbild')); checkCrop(asset.crop);
      assert.ok(sourceHashes[asset.src.split('/').at(-1)]);
    }
  }
});

test('slideshow provenance matches source references and playable faststart MP4 files', () => {
  const manifest = JSON.parse(readPublic('/images/venues/sources.json').toString('utf8'));
  assert.equal(manifest.overview.source, 'overview-reference.png');
  assert.equal(manifest.overview.sourceSha256, sourceHashes[manifest.overview.source]);
  assert.equal(manifest.files.length, 4);
  for (const [index, entry] of manifest.files.entries()) {
    assert.equal(entry.video, venueShowcases[index].videoSrc);
    assert.equal(entry.sourceSha256, sourceHashes[entry.source]);
    assert.equal(entry.sourceWidth, 1448); assert.equal(entry.sourceHeight, 1086);
    assert.equal(entry.kind, 'slideshow'); assert.equal(entry.durationSeconds, 12);
    assert.equal(entry.videoCodec, 'h264'); assert.equal(entry.pixelFormat, 'yuv420p');
    assert.equal(entry.hasAudio, false); assert.equal(entry.frameCount, entry.frameRate * entry.durationSeconds);
    assert.equal(entry.frameCrops.length, 3);
    for (const crop of entry.frameCrops) checkCrop({ left: crop.x, top: crop.y, width: crop.width, height: crop.height });
    const bytes = readPublic(entry.video);
    assert.equal(bytes.length, entry.bytes); assert.equal(hash(bytes), entry.sha256);
    const atoms = []; let offset = 0;
    while (offset + 8 <= bytes.length) {
      const size = bytes.readUInt32BE(offset); assert.ok(size >= 8 && offset + size <= bytes.length);
      atoms.push(bytes.toString('ascii', offset + 4, offset + 8)); offset += size;
    }
    assert.equal(offset, bytes.length); assert.equal(atoms[0], 'ftyp');
    assert.ok(atoms.includes('moov') && atoms.includes('mdat') && atoms.indexOf('moov') < atoms.indexOf('mdat'));
  }
});
