import assert from 'node:assert/strict';
import { cleanProcessEnvironment } from '../local/environment.mjs';

/** Expo's base64url project randomness can contain an internal underscore. */
export function isExpoTunnelHost(host) {
  return typeof host === 'string' && host.length <= 253 && /^[a-z0-9][a-z0-9_-]*\.exp\.direct$/.test(host);
}

/** Metro needs watch mode; database and worker processes keep their existing CI policy. */
export function remoteExpoEnvironment(apiOrigin) {
  const url = new URL(apiOrigin);
  assert.ok(url.protocol === 'https:'
    && /^[a-z\d](?:[a-z\d-]*[a-z\d])?\.[a-z\d](?:[a-z\d-]*[a-z\d])?\.ts\.net$/i.test(url.hostname)
    && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash,
  'Expo för privat fjärrtest kräver den verkliga Tailscale HTTPS-adressen.');
  const environment = cleanProcessEnvironment();
  // CI='0' still counts as a configured CI variable in some development tooling.
  delete environment.CI;
  return {
    ...environment,
    EXPO_NO_DOTENV: '1',
    APP_ENV: 'test',
    EXPO_PUBLIC_REMOTE_TEST: 'true',
    EXPO_PUBLIC_API_URL: url.origin,
  };
}
