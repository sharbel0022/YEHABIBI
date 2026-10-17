import type Stripe from 'stripe';
import type { CateringOrder } from '@/types/domain';

type Session = Pick<Stripe.Checkout.Session,'id'|'status'|'url'|'amount_total'|'currency'|'client_reference_id'|'metadata'>;
type Gateway = {
  retrieve(id:string):Promise<Session>;
  create(params:Stripe.Checkout.SessionCreateParams,options:{idempotencyKey:string}):Promise<Session>;
};
type Order = Pick<CateringOrder,'id'|'total_ore'|'stripe_checkout_session_id'|'quote_revision'> & Partial<Pick<CateringOrder,'payment_status'>>;

function checkoutLink(session:Session,order:Order) {
  if(session.status!=='open' || !session.url?.startsWith('https://') || session.amount_total!==order.total_ore || session.currency!=='sek' || session.client_reference_id!==order.id || session.metadata?.order_id!==order.id) throw new Error('Betalningssessionen matchar inte beställningen.');
  return {id:session.id,url:session.url};
}

/** Behåll alltid en betalbar länk. En slutförd session måste först stämmas av via webhook. */
export async function resolveCheckout(order:Order,gateway:Gateway,params:Stripe.Checkout.SessionCreateParams) {
  const previous = order.stripe_checkout_session_id;
  if(previous) {
    const session = await gateway.retrieve(previous);
    if(session.status==='open') return checkoutLink(session,order);
    const failed = session.status==='complete' && order.payment_status==='failed';
    if(session.status!=='expired' && !failed) throw new Error('Betalningen behandlas redan. Vänta på Stripe-bekräftelsen.');
  }
  // Samtidiga försök för samma utgångna session får samma nya session från Stripe.
  const session = await gateway.create(params,{idempotencyKey:`cedar-${order.id}-v${order.quote_revision || 1}-${previous || 'new'}`});
  return checkoutLink(session,order);
}
