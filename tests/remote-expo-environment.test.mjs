import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteExpoEnvironment } from '../test-support/remote/expo-environment.mjs';

const origin = 'https://development.synthetic-tailnet.ts.net:8443';

test('Expo fjärrmiljö: CI saknas helt så Metro kan bevaka och bygga om filer', () => {
  const environment = remoteExpoEnvironment(origin);
  assert.equal(Object.hasOwn(environment, 'CI'), false);
  assert.equal(environment.EXPO_NO_DOTENV, '1');
  assert.equal(environment.APP_ENV, 'test');
  assert.equal(environment.EXPO_PUBLIC_REMOTE_TEST, 'true');
  assert.equal(environment.EXPO_PUBLIC_API_URL, origin);
  assert.equal(remoteExpoEnvironment(origin + '/').EXPO_PUBLIC_API_URL, origin);
});

test('Expo fjärrmiljö: ärvda driftflaggor, Node-injektion och hemligheter följer inte med', () => {
  const injected = {
    CI: '1', APP_ENV: 'production', NODE_OPTIONS: '--require=synthetic-forbidden-module',
    EXPO_PUBLIC_API_URL: 'https://wrong.example', EXPO_PUBLIC_PRIVATE_SECRET: 'synthetic-private-value',
    EXPO_TOKEN: 'synthetic-expo-token', TEST_PAYMENT_SECRET: 'synthetic-payment-secret',
    ADYEN_API_KEY: 'synthetic-provider-key', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-database-key',
  };
  const previous = Object.fromEntries(Object.keys(injected).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, injected);
    const environment = remoteExpoEnvironment(origin);
    assert.equal(Object.hasOwn(environment, 'CI'), false);
    assert.equal(environment.APP_ENV, 'test');
    assert.equal(environment.EXPO_PUBLIC_API_URL, origin);
    assert.equal(environment.NODE_OPTIONS, '');
    for (const key of ['EXPO_PUBLIC_PRIVATE_SECRET', 'EXPO_TOKEN', 'TEST_PAYMENT_SECRET', 'ADYEN_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
      assert.equal(Object.hasOwn(environment, key), false, `${key} must stay out of public Metro's environment.`);
    }
    for (const [key, value] of Object.entries(injected)) assert.equal(process.env[key], value, 'Constructing the child environment must not mutate the parent.');
    assert.notEqual(remoteExpoEnvironment(origin), environment, 'Each child gets an independent environment object.');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('Expo fjärrmiljö: endast exakt privat HTTPS-origin tillåts, utan URL-hemligheter', () => {
  for (const value of [
    'http://development.synthetic-tailnet.ts.net:8443', 'https://public.example',
    'https://development.synthetic-tailnet.ts.net.attacker.example',
    origin + '/api', origin + '?token=synthetic', origin + '#synthetic',
    origin.replace('https://', 'https://synthetic:secret@'),
  ]) assert.throws(() => remoteExpoEnvironment(value), /Tailscale HTTPS/);
  assert.throws(() => remoteExpoEnvironment('not a URL'));
});
