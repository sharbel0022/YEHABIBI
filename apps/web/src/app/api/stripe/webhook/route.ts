import { stripeClient } from '@/lib/payments';
import { adminDb } from '@/lib/supabase';
import type Stripe from 'stripe';
import { deliverPaymentNotifications } from '@/lib/mailer';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Never trust browser return URLs as proof of payment. Only signed Stripe webhooks update payment status. */
export async function POST(request:Request) {
  const signature=request.headers.get('stripe-signature');
  const secret=process.env.STRIPE_WEBHOOK_SECRET;
  if(!signature||!secret)return new Response('Webhook not configured',{status:400});
  let event: Stripe.Event;
  try{event=stripeClient().webhooks.constructEvent(await request.text(),signature,secret);}
  catch{return new Response('Bad Stripe signature',{status:400});}
  if(event.livemode && process.env.STRIPE_LIVE_ENABLED!=='true') return new Response('Live payments disabled',{status:400});
  const db=adminDb();
  let orderId:string|null=null;
  let sessionId:string|null=null;
  let paymentIntent:string|null=null;
  let kind:'paid'|'failed'|'refunded'|null=null;
  if(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type)) {
    const session=event.data.object as Stripe.Checkout.Session;
    orderId=session.metadata?.order_id||null;sessionId=session.id;
    paymentIntent=typeof session.payment_intent==='string'?session.payment_intent:null;
    kind=['checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type)?'failed':session.payment_status==='paid'?'paid':null;
    if(kind==='paid' && orderId) {
      const {data:order,error} = await db.from('orders').select('total_ore,payment_preference,stripe_checkout_session_id').eq('id',orderId).maybeSingle();
      if(error) return new Response('Retry event',{status:500});
      if(!order || order.payment_preference==='cash' || order.stripe_checkout_session_id!==session.id || session.currency!=='sek' || session.amount_total!==order.total_ore) return new Response('Payment does not match order',{status:400});
    }
  } else if(event.type==='charge.refunded') {
    const charge=event.data.object as Stripe.Charge;
    paymentIntent=typeof charge.payment_intent==='string'?charge.payment_intent:null;
    if(charge.refunded && paymentIntent){
      const {data,error}=await db.from('orders').select('id').eq('stripe_payment_intent_id',paymentIntent).maybeSingle();
      if(error) return new Response('Retry event',{status:500});
      if(data){orderId=data.id;kind='refunded';}
    }
  }
  if(kind && orderId) {
    const {error}=await db.rpc('apply_stripe_event',{p_event_id:event.id,p_event_type:kind,p_order_id:orderId,p_session_id:sessionId,p_payment_intent:paymentIntent});
    if(error){console.error('Payment event failed',error.code);return new Response('Retry event',{status:500});}
    try { await deliverPaymentNotifications(orderId); }
    catch { return new Response('Payment saved; retry notification',{status:500}); }
  }
  return new Response('ok',{status:200});
}
