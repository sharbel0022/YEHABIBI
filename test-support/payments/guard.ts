import { createHash, timingSafeEqual } from 'node:crypto';

type Environment = Record<string, string | undefined>;
export type IsolationSettings = {id: string; secret: string; backendOrigin: string; checkoutOrigin: string};
function privateHost(host: string) {
  return host === '127.0.0.1' || host === 'localhost' || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
    || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
}
/** TEST_PAYMENT_SIMULATOR_OVERLAY: this module is copied only into an ignored isolated checkout. */
export function testEnvironmentSettings(env: Environment = process.env): IsolationSettings {
  if (env.APP_ENV !== 'test' || !['development', 'test'].includes(env.NODE_ENV || '')
    || env.PAYMENTS_ENABLED !== 'false' || env.PAYMENTS_LIVE_APPROVED === 'true'
    || env.ADYEN_API_KEY || env.ADYEN_HMAC_KEY || env.ADYEN_MERCHANT_ACCOUNT
    || !/^[a-f\d]{64}$/i.test(env.TEST_PAYMENT_SECRET || '')
    || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(env.TEST_ISOLATION_ID || '')) throw new Error('Isolerat testläge är inte verifierat.');
  const backend = new URL(env.TEST_BACKEND_ORIGIN || ''), database = new URL(env.NEXT_PUBLIC_SUPABASE_URL || '');
  const checkout = new URL(env.NEXT_PUBLIC_SITE_URL || '');
  if (backend.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(backend.hostname)
    || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash
    || database.origin !== backend.origin || database.pathname !== '/' || database.search || database.hash || database.username || database.password
    || checkout.protocol !== 'http:' || !privateHost(checkout.hostname) || checkout.username || checkout.password
    || checkout.pathname !== '/' || checkout.search || checkout.hash) throw new Error('Testbetalningar kräver en isolerad lokal backend.');
  return {id: env.TEST_ISOLATION_ID!, secret: env.TEST_PAYMENT_SECRET!, backendOrigin: backend.origin, checkoutOrigin: checkout.origin};
}
export async function assertTestIsolation(readGuard: () => Promise<{isolation_id?: string; secret_hash?: string} | null>, env: Environment = process.env) {
  const settings = testEnvironmentSettings(env), marker = await readGuard();
  const expected = createHash('sha256').update(settings.secret).digest();
  const actual = /^[a-f\d]{64}$/i.test(marker?.secret_hash || '') ? Buffer.from(marker!.secret_hash!, 'hex') : Buffer.alloc(0);
  if (marker?.isolation_id !== settings.id || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Testdatabasens isoleringsmarkör kunde inte verifieras.');
  return settings;
}
