// Loaded only in the ignored isolated Next checkout, never by the production app.
const nativeFetch = globalThis.fetch;
const origin = new URL(process.env.TEST_BACKEND_ORIGIN || 'http://invalid');
if (process.env.APP_ENV !== 'test' || process.env.NODE_ENV === 'production' || origin.hostname !== '127.0.0.1' || !process.env.TEST_PAYMENT_SECRET) {
  throw new Error('Isolated transport refused unsafe configuration.');
}
globalThis.fetch = (input, options = {}) => {
  const source = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const capture = source.hostname === 'api.resend.com' ? 'email' : source.hostname === 'exp.host' ? 'push' : null;
  if (capture) {
    const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('x-test-transport', process.env.TEST_PAYMENT_SECRET);
    return nativeFetch(new URL(`/__transport/${capture}${source.pathname}`, origin), { ...options, headers, redirect: 'error' });
  }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname)) {
    throw new Error('External network is disabled in the isolated test server.');
  }
  return nativeFetch(input, { ...options, redirect: 'error' });
};
