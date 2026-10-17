import 'server-only';
import Stripe from 'stripe';
import type { CateringOrder } from '@/types/domain';
import { isTestStripeKey } from '@/lib/domain';
import { trackingLink } from '@/lib/tracking';
import { resolveCheckout } from '@/lib/checkout';

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  const liveAllowed = process.env.STRIPE_LIVE_ENABLED === 'true' && /^(sk|rk)_live_/.test(key || '');
  if (!key || (!isTestStripeKey(key) && !liveAllowed)) throw new Error('Anslut en Stripe-testnyckel. Livebetalningar är avstängda.');
  return new Stripe(key);
}

/** Only the owner can trigger this after manually approving an order. */
export async function createCheckout(order: CateringOrder) {
  if (order.payment_preference === 'cash') throw new Error('Kontanter hanteras bara vid hämtning.');
  if (order.total_ore <= 0) throw new Error('Cateringpriset är inte fastställt.');
  if (!process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) throw new Error('Stripe-webhook måste konfigureras före betalning.');
  if (!['approved','preparing','ready'].includes(order.status) || ['paid','refunded'].includes(order.payment_status)) throw new Error('Ordern måste godkännas före betalning.');
  if (order.payment_preference === 'swish' && process.env.STRIPE_SWISH_ENABLED !== 'true') throw new Error('Swish är inte aktiverat.');

  const stripe = stripeClient();
  const url = trackingLink(order);

  return resolveCheckout(order,stripe.checkout.sessions,{
    mode: 'payment',
    integration_identifier:`cedar-mezze-${order.id.replace(/-/g,'').slice(0,8).replace(/[0-9a-f]/g,value=>String.fromCharCode(97+parseInt(value,16)))}`,
    // Stripe väljer godkända metoder från Dashboard, inklusive Swish i SEK och Apple Pay på stödda enheter.
    ...(process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION ? {payment_method_configuration:process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION} : {}),
    customer_email: order.email,
    client_reference_id: order.id,
    metadata: { order_id: order.id, order_code: order.code },
    payment_intent_data: { metadata: { order_id: order.id } },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'sek', unit_amount: order.total_ore,
        product_data: { name: `Catering: ${order.menu_title}`, description: `${order.guests} personer – ${order.event_date}` }
      }
    }],
    success_url: url + '&payment=return',
    cancel_url: url + '&payment=cancel'
  });
}
