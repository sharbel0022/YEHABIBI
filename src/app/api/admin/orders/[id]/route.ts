import { requireAdmin, checkOrigin, jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { adminActionSchema } from '@/lib/validators';
import { canTransition } from '@/lib/domain';
import { createCheckout, stripeClient } from '@/lib/payments';
import { trackingLink } from '@/lib/tracking';
import { notifyOrderDecision } from '@/lib/mailer';
import type { CateringOrder } from '@/types/domain';

export const dynamic='force-dynamic';
export async function PATCH(request: Request,{params}:{params:Promise<{id:string}>}) {
  if (!checkOrigin(request)) return jsonError('Felaktigt anrop.',403);
  if (!await requireAdmin()) return jsonError('Obehörig.',401);
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id)) return jsonError('Ogiltigt id.');
  const parsed=adminActionSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return jsonError('Ogiltig åtgärd.');
  const {action,admin_note}=parsed.data;
  const db=adminDb();
  const {data,error}=await db.from('orders').select('*').eq('id',id).single();
  if(error||!data)return jsonError('Ordern hittades inte.',404);
  const order=data as CateringOrder;

  if(action==='payment_link') {
    if(!['approved','ready'].includes(order.status)||order.payment_preference==='cash'||order.payment_status==='paid')return jsonError('Ny betalningslänk är inte tillgänglig.');
    const checkout=await createCheckout(order);
    const {data:saved,error:updateError}=await db.from('orders').update({stripe_checkout_session_id:checkout.id,checkout_url:checkout.url,payment_status:'pending',updated_at:new Date().toISOString()}).eq('id',id).select('*').single();
    if(updateError||!saved)return jsonError('Kunde inte spara betalningslänken.',500);
    await notifyOrderDecision(saved as CateringOrder,trackingLink(order));
    return Response.json({order:saved});
  }
  if(action==='refund') {
    if(order.payment_preference==='cash'||order.payment_status!=='paid'||!order.stripe_payment_intent_id)return jsonError('Återbetalning måste hanteras manuellt i Stripe.',400);
    await stripeClient().refunds.create({payment_intent:order.stripe_payment_intent_id,reason:'requested_by_customer'}, {idempotencyKey:`refund-${order.id}`});
    // Status changes only after a verified Stripe refund webhook.
    return Response.json({order,message:'Återbetalning begärd. Avvakta bekräftelse från Stripe.'});
  }
  if(!canTransition(order.status,action,order.payment_status,order.payment_preference))return jsonError('Åtgärden är inte tillåten för orderns nuvarande status.',409);
  const changes:Record<string,unknown>={updated_at:new Date().toISOString()};
  if(admin_note!==undefined)changes.admin_note=admin_note;
  if(action==='approve') {
    changes.status='approved';
    if(order.payment_preference !== 'cash') {
      const checkout=await createCheckout(order);
      changes.stripe_checkout_session_id=checkout.id;
      changes.checkout_url=checkout.url;
      changes.payment_status='pending';
    }
  }
  if(action==='reject')changes.status='rejected';
  if(action==='request_changes')changes.status='changes_requested';
  if(action==='ready')changes.status='ready';
  if(action==='complete')changes.status='completed';
  if(action==='cash_paid')changes.payment_status='paid';

  // Check old status in UPDATE to prevent two administrators from overwriting changes.
  const {data:saved,error:updateError}=await db.from('orders').update(changes).eq('id',id).eq('status',order.status).eq('payment_status',order.payment_status).select('*').maybeSingle();
  if(updateError||!saved)return jsonError('Ordern ändrades av någon annan. Ladda om sidan.',409);
  if(['approve','reject','request_changes'].includes(action))await notifyOrderDecision(saved as CateringOrder,trackingLink(order));
  return Response.json({order:saved},{headers:{'Cache-Control':'no-store'}});
}
