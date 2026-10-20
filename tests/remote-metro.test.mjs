import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = require('../apps/mobile/metro.config.cjs');
const blocked = filename => config.resolver.blockList.some(pattern => pattern.test(filename));

test('publik Metro blockerar ignored sessionsnycklar, databas och Git även som direkta bundleEntry-ingångar', () => {
  for (const relative of ['.tmp/remote-active.json', '.tmp/remote-credentials.txt', '.tmp/remote-database.json',
    '.tmp/test-mode-private/reusable-session.json', '.tmp/test-mode-private/private-session.json',
    '.tmp/test-mode-private/pgdata/pg_hba.conf', '.git/config', '.git/objects/private', 'apps/web/.tmp/private.json',
    'packages/shared/.git/config', '.TMP/private.json', 'apps/mobile/.GIT/config', '.ENV.local', '.env', '.env.local',
    'apps/mobile/.env', 'apps/mobile/.env.development.local', 'apps/web/.env.production']) {
    assert.equal(blocked(path.join(root, relative)), true, relative);
  }
});

test('Metro behåller Expos ordinarie blockList och tillåter app, delade paket och vanliga JSON-moduler', () => {
  const defaults = require('expo/metro-config').getDefaultConfig(path.join(root, 'apps/mobile'));
  assert.equal(new Set(config.resolver.blockList.map(pattern => pattern.flags)).size, 1, 'Expo kan bara kombinera blockList-uttryck med samma regex-flaggor.');
  for (const previous of Array.isArray(defaults.resolver.blockList) ? defaults.resolver.blockList : [defaults.resolver.blockList]) {
    assert.ok(config.resolver.blockList.some(pattern => pattern.source === previous.source && pattern.flags === previous.flags));
  }
  for (const relative of ['apps/mobile/app/index.tsx', 'apps/mobile/lib/remote-test.ts', 'apps/mobile/assets/icon.png',
    'packages/shared/index.ts', 'packages/shared/package.json', 'node_modules/expo/package.json']) {
    assert.equal(blocked(path.join(root, relative)), false, relative);
  }
});
