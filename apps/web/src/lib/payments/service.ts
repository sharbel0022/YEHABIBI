import type { HostedPayment, OnlinePaymentMethod, PaymentAttempt, PaymentEvent, PaymentProvider, RefundAttempt } from './provider.ts';

export interface PaymentStore {
  reserve(orderId: string, method: OnlinePaymentMethod, revision: number, amount: number): Promise<PaymentAttempt>;
  attach(attempt: PaymentAttempt, payment: HostedPayment): Promise<void>;
  expire(attempt: PaymentAttempt): Promise<void>;
  reserveRefund(orderId: string): Promise<RefundAttempt>;
  attachRefund(refund: RefundAttempt, providerId: string): Promise<void>;
  apply(event: PaymentEvent): Promise<string | null>;
}
export function assertPaymentMatches(payment: HostedPayment, attempt: PaymentAttempt) {
  if (payment.amount_ore !== attempt.amount_ore || payment.currency !== attempt.currency
    || payment.reference !== attempt.provider_reference
    || attempt.provider_payment_id && payment.id !== attempt.provider_payment_id) throw new Error('Betalningen matchar inte orderns godkända belopp och revision.');
}
function withinIdempotencyWindow(attempt: {created_at: string}) {
  // Adyen guarantees at least seven days. Stop ambiguous replays before that expires.
  if (Date.now() - Date.parse(attempt.created_at) >= 6 * 86400000) throw new Error('Betalningen måste stämmas av av ägaren före ett nytt försök.');
}
export async function startPayment(store: PaymentStore, provider: PaymentProvider, input: {
  orderId: string; method: OnlinePaymentMethod; revision: number; amount: number; returnUrl: string;
}) {
  if (!(await provider.availableMethods(input.amount)).includes(input.method)) throw new Error('Betalningsmetoden är inte tillgänglig för ordern.');
  const attempt = await store.reserve(input.orderId, input.method, input.revision, input.amount);
  if (['paid', 'refunded'].includes(attempt.status)) throw new Error('Betalningen är redan bekräftad.');
  // A durable reservation is committed BEFORE the provider call. A crash/retry uses the same key and request.
  if (!attempt.provider_payment_id) withinIdempotencyWindow(attempt);
  const payment = attempt.provider_payment_id ? await provider.getPayment(attempt.provider_payment_id)
    : await provider.createPayment(attempt, input.returnUrl);
  assertPaymentMatches(payment, attempt);
  if (payment.status === 'expired') {
    await store.expire(attempt);
    throw new Error('Betalningslänken har gått ut. Ägaren behöver stämma av betalningen.');
  }
  if (payment.status !== 'active') throw new Error('Betalningen behandlas. Vänta på leverantörens bekräftelse.');
  await store.attach(attempt, payment);
  return {id: payment.id, url: payment.url};
}
export async function refundPayment(store: PaymentStore, provider: PaymentProvider, orderId: string) {
  const attempt = await store.reserveRefund(orderId);
  if (attempt.status === 'needs_review') throw new Error('Återbetalningen behöver kontrolleras av ägaren.');
  if (attempt.status === 'confirmed') return {id: attempt.provider_refund_id!, status: 'refunded' as const};
  if (attempt.provider_refund_id) return {id: attempt.provider_refund_id, status: 'pending' as const};
  withinIdempotencyWindow(attempt);
  const result = await provider.refund(attempt);
  await store.attachRefund(attempt, result.id);
  // A received API response is NOT confirmation of a refund.
  return result;
}
