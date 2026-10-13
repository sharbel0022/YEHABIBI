import 'server-only';
import Stripe from 'stripe';
import type { CateringOrder } from '@/types/domain';
import { stripePaymentTypes } from '@/lib/domain';
import { trackingLink } from '@/lib/tracking';

export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Betalkontot är inte anslutet.');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

/** Only the owner can trigger this after manually approving an order. */
export async function createCheckout(order: CateringOrder) {
  if (order.payment_preference === 'cash') throw new Error('Kontanter hanteras bara vid hämtning.');
  if (order.total_ore <= 0) throw new Error('Cateringpriset är inte fastställt.');

  const stripe = stripeClient();
  const paymentTypes = stripePaymentTypes(order.payment_preference, process.env.STRIPE_SWISH_ENABLED === 'true');
  const url = trackingLink(order);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: paymentTypes,
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
  }, { idempotencyKey: `cedar-${order.id}-${order.stripe_checkout_session_id||'new'}` });

  if (!session.url) throw new Error('Kunde inte skapa en betalningslänk.');
  return { id:session.id, url:session.url };
}
