import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { InvalidPaymentEventError } from '../provider.ts';
import type { HostedPayment, OnlinePaymentMethod, PaymentAttempt, PaymentEnvironment, PaymentEvent, PaymentProvider, RefundAttempt } from '../provider.ts';

type Environment = Record<string, string | undefined>;
type Fetcher = typeof fetch;
const METHOD_TYPES: Record<OnlinePaymentMethod, string> = { swish: 'swish', card: 'scheme', apple_pay: 'applepay', google_pay: 'googlepay' };
const METHODS = Object.keys(METHOD_TYPES) as OnlinePaymentMethod[];
export { InvalidPaymentEventError };

/** Fixed official European endpoint structure. No configurable origin, port, path or protocol. */
export function adyenApiBaseUrl(env: Environment): string | null {
  if (env.ADYEN_ENVIRONMENT === 'test') return 'https://checkout-test.adyen.com/v71';
  const prefix = env.ADYEN_LIVE_URL_PREFIX || '';
  // The prefix plus '-checkout-live' must form a DNS label of at most 63 characters.
  if (env.ADYEN_ENVIRONMENT !== 'live' || env.PAYMENTS_LIVE_APPROVED !== 'true'
    || prefix.length > 49 || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(prefix)) return null;
  return `https://${prefix}-checkout-live.adyenpayments.com/checkout/v71`;
}

export function adyenVerificationConfigured(env: Environment = process.env) {
  return env.PAYMENT_PROVIDER === 'adyen' && adyenApiBaseUrl(env) !== null && env.ADYEN_CAPTURE_MODE === 'automatic'
    && !!env.ADYEN_MERCHANT_ACCOUNT && /^[a-f\d]{64}$/i.test(env.ADYEN_HMAC_KEY || '');
}

/** Production requires a separate explicit approval gate; defaults never activate payments. */
export function adyenConfigured(env: Environment = process.env) {
  return env.PAYMENTS_ENABLED === 'true' && env.PAYMENT_PROVIDER === 'adyen'
    && adyenApiBaseUrl(env) !== null && env.ADYEN_CAPTURE_MODE === 'automatic'
    && !!env.ADYEN_API_KEY && !!env.ADYEN_MERCHANT_ACCOUNT
    && /^[a-f\d]{64}$/i.test(env.ADYEN_HMAC_KEY || '')
    && configuredMethods(env).length > 0;
}
export function configuredMethods(env: Environment): OnlinePaymentMethod[] {
  const selected = (env.ADYEN_ENABLED_METHODS || '').split(',').map(value => value.trim());
  return METHODS.filter(method => selected.includes(method));
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ogiltigt leverantörssvar.');
  return value as Record<string, unknown>;
}
function string(value: unknown) { return typeof value === 'string' ? value : ''; }
function integer(value: unknown) { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }

/** Adyen's Standard webhook canonical fields. Escape backslashes BEFORE colons. */
export function standardHmacPayload(item: Record<string, unknown>) {
  const amount = record(item.amount);
  return [item.pspReference, item.originalReference, item.merchantAccountCode, item.merchantReference,
    amount.value, amount.currency, item.eventCode, item.success]
    .map(value => value === undefined || value === null ? '' : String(value))
    .map(value => value.replace(/\\/g, '\\\\').replace(/:/g, '\\:')).join(':');
}
export function validStandardHmac(item: Record<string, unknown>, key: string) {
  if (!/^[a-f\d]{64}$/i.test(key)) return false;
  try {
    const signature = string(record(item.additionalData).hmacSignature);
    if (!/^[A-Za-z\d+/]{43}=$/.test(signature)) return false;
    const expected = createHmac('sha256', Buffer.from(key, 'hex')).update(standardHmacPayload(item), 'utf8').digest();
    const actual = Buffer.from(signature, 'base64');
    return actual.length === expected.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}

export class AdyenProvider implements PaymentProvider {
  readonly name = 'adyen' as const;
  readonly environment: PaymentEnvironment;
  private env: Environment;
  private fetcher: Fetcher;
  constructor(env: Environment = process.env, fetcher: Fetcher = fetch, purpose: 'payments' | 'verification' = 'payments') {
    if (!(purpose === 'verification' ? adyenVerificationConfigured(env) : adyenConfigured(env))) throw new Error('Onlinebetalningar är avstängda. Företagets verifierade konto och rätt miljö krävs.');
    this.env = {...env}; this.fetcher = fetcher;
    this.environment = env.ADYEN_ENVIRONMENT as PaymentEnvironment;
  }
  private async request(path: string, method: 'GET' | 'POST', body?: unknown, idempotencyKey?: string): Promise<Record<string, unknown>> {
    if (!adyenConfigured(this.env)) throw new Error('Onlinebetalningar är avstängda.');
    const response = await this.fetcher(adyenApiBaseUrl(this.env)! + path, {
      method, headers: {'x-api-key': this.env.ADYEN_API_KEY!, 'content-type': 'application/json',
        ...(idempotencyKey ? {'idempotency-key': idempotencyKey} : {})},
      ...(body ? {body: JSON.stringify(body)} : {}), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    // No raw response/error bodies: provider responses can contain customer or credential details.
    if (!response.ok) throw new Error(`Betaltjänsten kunde inte svara (${response.status}). Försök igen med samma betalning.`);
    return record(await response.json());
  }
  async availableMethods(amountOre = 1000): Promise<OnlinePaymentMethod[]> {
    if (!integer(amountOre)) throw new Error('Ogiltigt betalningsbelopp.');
    const response = await this.request('/paymentMethods', 'POST', {
      merchantAccount: this.env.ADYEN_MERCHANT_ACCOUNT, countryCode: 'SE',
      amount: {value: amountOre, currency: 'SEK'}, channel: 'Web', shopperLocale: 'sv-SE',
      allowedPaymentMethods: configuredMethods(this.env).map(method => METHOD_TYPES[method])
    });
    if (!Array.isArray(response.paymentMethods)) throw new Error('Betalningsmetoder kunde inte verifieras.');
    const types = response.paymentMethods.map(item => record(item));
    return configuredMethods(this.env).filter(method => types.some(item => item.type === METHOD_TYPES[method]
      && (method !== 'card' || Array.isArray(item.brands) && item.brands.some(brand => brand === 'visa' || brand === 'mc'))));
  }
  private payment(response: Record<string, unknown>): HostedPayment {
    const amount = record(response.amount), url = new URL(string(response.url));
    // The host is fixed by Adyen; an API response cannot redirect a customer to an arbitrary site.
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || url.hostname !== (this.environment === 'test' ? 'test.adyen.link' : 'eu.adyen.link')
      || url.pathname !== '/' + string(response.id) || url.search || url.hash
      || !integer(amount.value) || amount.currency !== 'SEK' || !string(response.id)
      || response.merchantAccount !== this.env.ADYEN_MERCHANT_ACCOUNT
      || response.manualCapture === true || response.captureDelayHours !== undefined && response.captureDelayHours !== 0
      || !string(response.reference) || !Number.isFinite(Date.parse(string(response.expiresAt)))
      || !['active', 'completed', 'paid', 'expired', 'paymentPending'].includes(string(response.status))) throw new Error('Betalningslänken kunde inte verifieras.');
    return {environment: this.environment, id: string(response.id), url: url.href, amount_ore: amount.value as number, currency: 'SEK',
      reference: string(response.reference), merchant_account: string(response.merchantAccount),
      expires_at: string(response.expiresAt), status: response.status as HostedPayment['status']};
  }
  async createPayment(attempt: PaymentAttempt, returnUrl: string) {
    if (attempt.environment !== this.environment) throw new Error('Betalningen tillhör en annan leverantörsmiljö.');
    const method = METHOD_TYPES[attempt.method];
    if (!method || !configuredMethods(this.env).includes(attempt.method)) throw new Error('Betalningsmetoden är inte aktiverad.');
    const url = new URL(returnUrl);
    if (url.protocol !== 'https:') throw new Error('Betalningen kräver en HTTPS-returadress.');
    const created = await this.request('/paymentLinks', 'POST', {
      merchantAccount: this.env.ADYEN_MERCHANT_ACCOUNT, reference: attempt.provider_reference,
      amount: {value: attempt.amount_ore, currency: 'SEK'}, countryCode: 'SE', shopperLocale: 'sv-SE',
      allowedPaymentMethods: [method], ...(attempt.method === 'card' ? {allowedPaymentMethods: ['visa', 'mc']} : {}),
      reusable: false, returnUrl: url.href,
      // Explicitly select immediate automatic capture. The verified merchant account must use this policy.
      manualCapture: false, captureDelayHours: 0, expiresAt: new Date(Date.parse(attempt.created_at) + 24 * 3600000).toISOString(),
      description: 'Cateringbeställning', metadata: {order_id: attempt.order_id, quote_revision: String(attempt.quote_revision)}
    }, attempt.idempotency_key);
    // POST has no status field. Read the created link through the authenticated status API.
    const payment = await this.getPayment(string(created.id));
    if (payment.id !== created.id) throw new Error('Betalningslänken kunde inte verifieras.');
    return payment;
  }
  async getPayment(id: string) {
    if (!/^[A-Za-z\d_-]{1,100}$/.test(id)) throw new Error('Ogiltig betalningsreferens.');
    return this.payment(await this.request(`/paymentLinks/${encodeURIComponent(id)}`, 'GET'));
  }
  verifyEvents(payload: unknown): PaymentEvent[] {
    const envelope = record(payload);
    if (envelope.live !== (this.environment === 'live' ? 'true' : 'false') || !Array.isArray(envelope.notificationItems)
      || envelope.notificationItems.length < 1 || envelope.notificationItems.length > 6) throw new Error('Fel betalningsmiljö eller ogiltig webhook.');
    // Verify EVERY item before returning any event; a mixed batch can never partially apply.
    const items = envelope.notificationItems.map(wrapper => record(record(wrapper).NotificationRequestItem));
    for (const item of items) {
      if (!validStandardHmac(item, this.env.ADYEN_HMAC_KEY!) || item.merchantAccountCode !== this.env.ADYEN_MERCHANT_ACCOUNT
        || !['true', 'false'].includes(string(item.success))) throw new Error('Ogiltig webhooksignatur eller konto.');
    }
    return items.flatMap(item => {
      const code = string(item.eventCode), amount = record(item.amount), success = item.success === 'true';
      const known = ['AUTHORISATION', 'CAPTURE', 'CAPTURE_FAILED', 'REFUND', 'REFUND_FAILED', 'REFUNDED_REVERSED', 'CHARGEBACK', 'SETTLED_REVERSED'];
      if (!known.includes(code)) return [];
      if (!integer(amount.value) || amount.currency !== 'SEK' || !string(item.pspReference) || !string(item.merchantReference)) throw new Error('Ogiltigt betalningsevent.');
      // merchantReference, amount, currency and PSP are HMAC-signed. additionalData/paymentMethod/eventDate are not trusted as evidence.
      const canonical = standardHmacPayload(item);
      return [{environment: this.environment, provider: 'adyen' as const, event_id: createHash('sha256').update(canonical).digest('hex'), event_code: code,
        kind: code === 'REFUND' ? success ? 'refunded' as const : 'review' as const
          : ['CAPTURE_FAILED', 'REFUND_FAILED', 'REFUNDED_REVERSED', 'CHARGEBACK', 'SETTLED_REVERSED'].includes(code) || code === 'CAPTURE' && !success ? 'review' as const
          : success ? 'paid' as const : 'failed' as const,
        success, reference: string(item.merchantReference), transaction_reference: string(item.pspReference),
        original_reference: string(item.originalReference) || null,
        amount_ore: amount.value as number, currency: 'SEK', occurred_at: new Date().toISOString()}];
    });
  }
  async refund(attempt: RefundAttempt) {
    if (attempt.environment !== this.environment) throw new Error('Återbetalningen tillhör en annan leverantörsmiljö.');
    const result = await this.request(`/payments/${encodeURIComponent(attempt.transaction_reference)}/refunds`, 'POST', {
      merchantAccount: this.env.ADYEN_MERCHANT_ACCOUNT, amount: {value: attempt.amount_ore, currency: 'SEK'}, reference: attempt.provider_reference
    }, attempt.idempotency_key);
    if (!string(result.pspReference) || result.status !== 'received' || result.paymentPspReference !== attempt.transaction_reference
      || result.merchantAccount !== this.env.ADYEN_MERCHANT_ACCOUNT) throw new Error('Återbetalningsbegäran kunde inte verifieras.');
    return {id: string(result.pspReference), status: 'pending' as const};
  }
}
