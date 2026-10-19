import 'server-only';
import type { CateringOrder } from '@/types/domain';
import { adminDb } from '@/lib/supabase';
import { trackingLink } from '@/lib/tracking';
import { InvalidPaymentEventError } from './payments/provider';
import { paymentRuntime } from './payments/runtime';
import type { OnlinePaymentMethod, PaymentAttempt, RefundAttempt } from './payments/provider';
import { refundPayment, startPayment, type PaymentStore } from './payments/service';
import { persistVerifiedPaymentEvents } from './payments/inbox';

export type { OnlinePaymentMethod } from './payments/provider';
export { InvalidPaymentEventError } from './payments/provider';
export const paymentsConfigured = () => paymentRuntime().configured;
export const paymentWebhooksConfigured = () => paymentRuntime().webhooksConfigured;
export async function paymentRuntimeInfo() {
  const runtime = paymentRuntime();
  await runtime.validate();
  return {provider: runtime.identity.provider, environment: runtime.identity.environment, isSimulation: runtime.isSimulation};
}
export async function paymentCapabilities(amountOre?: number): Promise<OnlinePaymentMethod[]> {
  if (!paymentsConfigured()) return [];
  try { const runtime = paymentRuntime(); await runtime.validate(); return await runtime.createProvider().availableMethods(amountOre); }
  catch { return []; } // Fail closed: environment flags alone never advertise an online method.
}
/** Legacy Pay by Link approval is for supplementary catering, never the direct shop checkout. */
export async function directPaymentCapabilities(amountOre?: number): Promise<OnlinePaymentMethod[]> {
  if (!paymentRuntime().isSimulation) return [];
  return paymentCapabilities(amountOre);
}
function paymentStore(): PaymentStore {
  const {identity} = paymentRuntime();
  const db = adminDb();
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const {data, error} = await db.rpc(name, args);
    if (error) {
      throw new Error('Betalningen kunde inte sparas säkert. Försök igen med samma order.');
    }
    if (data === null) throw new Error('Ordern ändrades eller kan inte betalas i nuvarande läge.');
    return data as T;
  }
  return {
    reserve: (orderId, method, revision, amount) => rpc<PaymentAttempt>('reserve_catering_payment', {
      p_order_id: orderId, p_provider: identity.provider, p_method: method, p_revision: revision, p_amount_ore: amount,
      p_environment: identity.environment, p_merchant_account: identity.merchant_account || null
    }),
    attach: async (attempt, payment) => { await rpc('attach_catering_payment', {
      p_attempt_id: attempt.id, p_provider_payment_id: payment.id, p_checkout_url: payment.url, p_expires_at: payment.expires_at
    }); },
    reserveRefund: orderId => rpc<RefundAttempt>('reserve_catering_refund', {p_order_id: orderId, p_environment: identity.environment, p_provider: identity.provider}),
    attachRefund: async (refund, id) => { await rpc('attach_catering_refund', {p_refund_id: refund.id, p_provider_refund_id: id}); }
  };
}
export async function createCheckout(order: CateringOrder, method?: OnlinePaymentMethod) {
  const runtime = paymentRuntime(); await runtime.validate();
  if (!runtime.isSimulation && order.order_type === 'direct') throw new Error('Direktkassan kräver vald och godkänd Checkout-integration.');
  const selected = method || order.payment_preference;
  if (!['swish', 'card', 'apple_pay', 'google_pay'].includes(selected)) throw new Error('Välj en aktiverad onlinebetalningsmetod.');
  return startPayment(paymentStore(), runtime.createProvider(), {orderId: order.id,
    method: selected as OnlinePaymentMethod, revision: order.quote_revision || 1, amount: order.total_ore,
    returnUrl: trackingLink(order) + '&payment=return'});
}
export async function requestRefund(order: CateringOrder) {
  const runtime = paymentRuntime(); await runtime.validate();
  return refundPayment(paymentStore(), runtime.createProvider(), order.id);
}
/** Public status reads never poll providers or expire financial attempts; the worker reconciles. */
export async function reconcilePaymentStatus(order: CateringOrder): Promise<CateringOrder> {
  return order;
}
export async function receivePaymentEvents(payload: unknown) {
  const runtime = paymentRuntime(); await runtime.validate();
  const provider = runtime.createProvider('verification');
  return persistVerifiedPaymentEvents(provider, payload, async events => {
    const {data, error} = await adminDb().rpc('enqueue_catering_payment_events', {p_events: events});
    if (error) {
      if (['P0001', '22P02', '23505'].includes(error.code)) throw new InvalidPaymentEventError('Betalningseventet matchar inte det sparade försöket.');
      throw new Error('Betalningseventet kunde inte lagras.');
    }
    if (!Number.isInteger(data) || data < 0) throw new Error('Betalningseventets lagring kunde inte bekräftas.');
    return data as number;
  });
}
