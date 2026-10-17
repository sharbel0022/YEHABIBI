import 'server-only';
import type { CateringOrder } from '@/types/domain';
import { adminDb } from '@/lib/supabase';
import { trackingLink } from '@/lib/tracking';
import { AdyenProvider, adyenConfigured, adyenVerificationConfigured, InvalidPaymentEventError } from './payments/providers/adyen';
import type { OnlinePaymentMethod, PaymentAttempt, RefundAttempt } from './payments/provider';
import { assertPaymentMatches, refundPayment, startPayment, type PaymentStore } from './payments/service';

export type { OnlinePaymentMethod } from './payments/provider';
export { InvalidPaymentEventError } from './payments/providers/adyen';
export const paymentsConfigured = () => adyenConfigured();
export const paymentWebhooksConfigured = () => adyenVerificationConfigured();
export async function paymentCapabilities(amountOre?: number): Promise<OnlinePaymentMethod[]> {
  if (!paymentsConfigured()) return [];
  try { return await new AdyenProvider().availableMethods(amountOre); }
  catch { return []; } // Fail closed: environment flags alone never advertise an online method.
}
function paymentStore(): PaymentStore {
  const db = adminDb();
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const {data, error} = await db.rpc(name, args);
    if (error) {
      if (name === 'apply_catering_payment_event' && ['P0001', '22P02', '23505'].includes(error.code)) throw new InvalidPaymentEventError('Betalningseventet matchar inte ordern.');
      throw new Error('Betalningen kunde inte sparas säkert. Försök igen med samma order.');
    }
    if (data === null) throw new Error('Ordern ändrades eller kan inte betalas i nuvarande läge.');
    return data as T;
  }
  return {
    reserve: (orderId, method, revision, amount) => rpc<PaymentAttempt>('reserve_catering_payment', {
      p_order_id: orderId, p_provider: 'adyen', p_method: method, p_revision: revision, p_amount_ore: amount
    }),
    attach: async (attempt, payment) => { await rpc('attach_catering_payment', {
      p_attempt_id: attempt.id, p_provider_payment_id: payment.id, p_checkout_url: payment.url, p_expires_at: payment.expires_at
    }); },
    expire: async attempt => { await rpc('expire_catering_payment', {p_attempt_id: attempt.id}); },
    reserveRefund: orderId => rpc<RefundAttempt>('reserve_catering_refund', {p_order_id: orderId}),
    attachRefund: async (refund, id) => { await rpc('attach_catering_refund', {p_refund_id: refund.id, p_provider_refund_id: id}); },
    apply: event => rpc<string | null>('apply_catering_payment_event', {p_event: event})
  };
}
export async function createCheckout(order: CateringOrder, method?: OnlinePaymentMethod) {
  const selected = method || order.payment_preference;
  if (!['swish', 'card', 'apple_pay', 'google_pay'].includes(selected)) throw new Error('Välj en aktiverad onlinebetalningsmetod.');
  return startPayment(paymentStore(), new AdyenProvider(), {orderId: order.id,
    method: selected as OnlinePaymentMethod, revision: order.quote_revision || 1, amount: order.total_ore,
    returnUrl: trackingLink(order) + '&payment=return'});
}
export async function requestRefund(order: CateringOrder) {
  return refundPayment(paymentStore(), new AdyenProvider(), order.id);
}
/** Link completion alone is authorisation, not fresh evidence of captured/received funds. */
export async function reconcilePaymentStatus(order: CateringOrder): Promise<CateringOrder> {
  if (!paymentsConfigured()) return order;
  const db = adminDb();
  const {data, error} = await db.from('payment_attempts').select('*').eq('order_id', order.id).order('created_at', {ascending: false}).limit(1).maybeSingle();
  if (error) throw new Error('Betalningsstatus kunde inte läsas.');
  const attempt = data as PaymentAttempt | null;
  if (!attempt?.provider_payment_id || ['paid', 'refunded'].includes(attempt.status)) return order;
  const payment = await new AdyenProvider().getPayment(attempt.provider_payment_id);
  assertPaymentMatches(payment, attempt);
  if (payment.status === 'expired') await paymentStore().expire(attempt);
  const {data: fresh, error: readError} = await db.from('orders').select('*').eq('id', order.id).single();
  if (readError || !fresh) throw new Error('Betalningsstatus kunde inte läsas.');
  return fresh as CateringOrder;
}
export async function receivePaymentEvents(payload: unknown) {
  const provider = new AdyenProvider(process.env, fetch, 'verification');
  let events;
  try { events = provider.verifyEvents(payload); }
  catch { throw new InvalidPaymentEventError('Ogiltig betalningswebhook.'); }
  const store = paymentStore(), orders = new Set<string>();
  for (const event of events) { const id = await store.apply(event); if (id) orders.add(id); }
  return [...orders];
}
