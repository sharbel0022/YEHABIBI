import type { HostedPayment, OnlinePaymentMethod, PaymentAttempt, PaymentProvider, RefundAttempt } from './provider.ts';

export interface PaymentStore {
  reserve(orderId: string, method: OnlinePaymentMethod, revision: number, amount: number): Promise<PaymentAttempt>;
  attach(attempt: PaymentAttempt, payment: HostedPayment): Promise<void>;
  reserveRefund(orderId: string): Promise<RefundAttempt>;
  attachRefund(refund: RefundAttempt, providerId: string): Promise<void>;
}
class PaymentMetadataMismatchError extends Error {}
export function assertPaymentMatches(payment: HostedPayment, attempt: PaymentAttempt) {
  if (payment.environment !== attempt.environment || payment.amount_ore !== attempt.amount_ore || payment.currency !== attempt.currency
    || payment.reference !== attempt.provider_reference
    || attempt.merchant_account && payment.merchant_account !== attempt.merchant_account
    || attempt.provider_payment_id && payment.id !== attempt.provider_payment_id) throw new PaymentMetadataMismatchError('Betalningen matchar inte orderns godkända belopp och revision.');
}
export async function readProviderPayment(provider: PaymentProvider, attempt: PaymentAttempt) {
  if (attempt.environment !== provider.environment || attempt.provider !== provider.name
    || provider.merchantAccount && attempt.merchant_account !== provider.merchantAccount) throw new Error('Betalningen tillhör en annan leverantörsmiljö eller ett annat konto.');
  if (!attempt.provider_payment_id) throw new Error('Betalningsreferens saknas.');
  const payment = await provider.getPayment(attempt.provider_payment_id);
  assertPaymentMatches(payment, attempt);
  return payment;
}
export type ReconciliationResult = {
  reason: string; manual_review_required: boolean; next_check_at: string | null;
  link_status?: HostedPayment['status'];
};
/** Read-only reconciliation. Never creates a charge, expires an attempt, or releases capacity. */
export async function reconcileExistingPayment(provider: PaymentProvider, attempt: PaymentAttempt, now = Date.now()): Promise<ReconciliationResult> {
  const manual = (reason: string): ReconciliationResult => ({reason, manual_review_required: true, next_check_at: null});
  if (!attempt.merchant_account || !provider.merchantAccount
    || attempt.provider !== provider.name || attempt.environment !== provider.environment
    || attempt.merchant_account !== provider.merchantAccount) return manual('verification_identity_unavailable');
  // Hosted Checkout's sessionResult response is immutable. It is never a status polling source.
  if (attempt.integration_type === 'adyen_hosted_checkout') return manual('session_result_not_reconciliation');
  if (attempt.provider !== 'adyen' && attempt.provider !== 'local_test') return manual('provider_reconciliation_not_implemented');
  if (!attempt.provider_payment_id) return manual('provider_reference_unresolved');
  try {
    const payment = await readProviderPayment(provider, attempt);
    if (['expired', 'completed', 'paid'].includes(payment.status)) {
      return {...manual(`link_${payment.status}_requires_webhook_or_report`), link_status: payment.status};
    }
    // A page still being active is only page metadata. A missing financial webhook remains unresolved.
    if (now - Date.parse(attempt.created_at) >= 86400000) return {...manual('missing_financial_event'), link_status: payment.status};
    return {reason: 'awaiting_verified_financial_event', manual_review_required: false,
      next_check_at: new Date(now + 300000).toISOString(), link_status: payment.status};
  } catch (error) {
    if (error instanceof PaymentMetadataMismatchError) return manual('provider_metadata_mismatch');
    if (now - Date.parse(attempt.created_at) >= 86400000) return manual('provider_lookup_unresolved');
    const retryAfter = Number((error as {retryAfterMs?: number})?.retryAfterMs);
    return {reason: 'provider_lookup_unresolved', manual_review_required: false,
      next_check_at: new Date(now + (Number.isFinite(retryAfter) ? Math.max(300000, Math.min(86400000, retryAfter)) : 300000)).toISOString()};
  }
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
  if (attempt.environment !== provider.environment || attempt.provider !== provider.name) throw new Error('Betalningen tillhör en annan leverantörsmiljö.');
  if (['paid', 'refunded'].includes(attempt.status)) throw new Error('Betalningen är redan bekräftad.');
  // A durable reservation is committed BEFORE the provider call. A crash/retry uses the same key and request.
  if (!attempt.provider_payment_id) withinIdempotencyWindow(attempt);
  const payment = attempt.provider_payment_id ? await readProviderPayment(provider, attempt)
    : await provider.createPayment(attempt, input.returnUrl);
  assertPaymentMatches(payment, attempt);
  if (payment.status === 'expired') {
    // Link expiry is not evidence that an asynchronous payment cannot settle.
    // Preserve the attempt/capacity quarantine for reconciliation and manual review.
    throw new Error('Betalningslänken har gått ut. Ägaren behöver stämma av betalningen.');
  }
  if (payment.status !== 'active') throw new Error('Betalningen behandlas. Vänta på leverantörens bekräftelse.');
  await store.attach(attempt, payment);
  return {id: payment.id, url: payment.url};
}
export async function refundPayment(store: PaymentStore, provider: PaymentProvider, orderId: string) {
  const attempt = await store.reserveRefund(orderId);
  if (attempt.environment !== provider.environment || attempt.provider !== provider.name
    || provider.merchantAccount && attempt.merchant_account !== provider.merchantAccount) throw new Error('Återbetalningen tillhör en annan leverantörsmiljö eller ett annat konto.');
  if (attempt.status === 'needs_review') throw new Error('Återbetalningen behöver kontrolleras av ägaren.');
  if (attempt.status === 'confirmed') return {id: attempt.provider_refund_id!, status: 'refunded' as const};
  if (attempt.provider_refund_id) return {id: attempt.provider_refund_id, status: 'pending' as const};
  withinIdempotencyWindow(attempt);
  const result = await provider.refund(attempt);
  await store.attachRefund(attempt, result.id);
  // A received API response is NOT confirmation of a refund.
  return result;
}
