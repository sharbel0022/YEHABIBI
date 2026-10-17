import { requireAdmin, checkOrigin, jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { adminActionSchema } from '@/lib/validators';
import { canTransition } from '@/lib/domain';
import { createCheckout, stripeClient } from '@/lib/payments';
import { trackingLink } from '@/lib/tracking';
import { deliverPaymentNotifications, notifyCompletedOrder, notifyNewOrder, notifyOrderDecision, notifyOrderProgress } from '@/lib/mailer';
import { getSettings } from '@/lib/data';
import { safeExternalUrl } from '@/lib/domain';
import type { CateringOrder } from '@/types/domain';

export const dynamic='force-dynamic';
export async function PATCH(request: Request,{params}:{params:Promise<{id:string}>}) {
  try { return await updateOrder(request,{params}); }
  catch { return jsonError('Åtgärden kunde inte genomföras. Kontrollera betalningsinställningarna och försök igen.',503); }
}
async function updateOrder(request:Request,{params}:{params:Promise<{id:string}>}) {
  if (!checkOrigin(request)) return jsonError('Felaktigt anrop.',403);
  if (!await requireAdmin()) return jsonError('Obehörig.',401);
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id)) return jsonError('Ogiltigt id.');
  const parsed=adminActionSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return jsonError('Ogiltig åtgärd.');
  const {action,admin_note,proposed_total_ore}=parsed.data;
  const db=adminDb();
  const {data,error}=await db.from('orders').select('*').eq('id',id).single();
  if(error||!data)return jsonError('Ordern hittades inte.',404);
  const order=data as CateringOrder;

  if(action==='resend_notifications') {
    const queued = await deliverPaymentNotifications(id);
    if(queued) return Response.json({order,message:'Väntande betalningsuppdateringar har skickats.'});
    let delivered;
    if(['new','reviewing'].includes(order.status)) delivered=await notifyNewOrder(order,trackingLink(order));
    else if(order.payment_status==='refunded' || (order.status==='approved' && ['paid','failed'].includes(order.payment_status))) {
      const result=await notifyOrderProgress(order,order.payment_status);
      delivered=result.customer && result.owner;
    }
    else if(['approved','changes_requested','rejected'].includes(order.status)) delivered=await notifyOrderDecision(order,trackingLink(order));
    else if(order.status==='completed') delivered=await notifyCompletedOrder(order,safeExternalUrl((await getSettings()).google_review_url));
    else {
      const result=await notifyOrderProgress(order,order.status);
      delivered=result.customer && result.owner;
    }
    return delivered ? Response.json({order,message:'Uppdateringen har skickats.'}) : jsonError('E-post kunde inte levereras. Kontrollera inställningarna och försök igen.',502);
  }

  if(action==='payment_link') {
    if(!['approved','preparing','ready'].includes(order.status)||order.payment_preference==='cash'||['paid','refunded'].includes(order.payment_status))return jsonError('Ny betalningslänk är inte tillgänglig.');
    const checkout=await createCheckout(order);
    const {data:saved,error:updateError}=await db.rpc('attach_catering_checkout',{
      p_order_id:id,p_expected_status:order.status,p_expected_payment_status:order.payment_status,
      p_expected_session_id:order.stripe_checkout_session_id,p_session_id:checkout.id,p_checkout_url:checkout.url
    });
    if(updateError||!saved)return jsonError('Ordern ändrades under tiden. Ladda om sidan.',409);
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
  if(action==='dispatched' && order.fulfillment!=='delivery') return jsonError('På väg gäller bara hemleverans.');
  if(action==='request_changes') {
    const {data:saved,error:updateError} = await db.rpc('propose_catering_change',{
      p_order_id:id,p_expected_revision:order.quote_revision||1,p_total_ore:proposed_total_ore??order.total_ore,p_note:admin_note
    });
    if(updateError||!saved)return jsonError('Förslaget kunde inte sparas. Kontrollera beloppet och ladda om.',409);
    await notifyOrderDecision(saved as CateringOrder,trackingLink(order));
    return Response.json({order:saved});
  }
  const changes:Record<string,unknown>={updated_at:new Date().toISOString()};
  if(admin_note!==undefined)changes.admin_note=admin_note;
  if(action==='approve') {
    changes.status='approved';
    if(order.payment_preference !== 'cash') {
      const checkout=await createCheckout({...order,status:'approved'});
      changes.stripe_checkout_session_id=checkout.id;
      changes.checkout_url=checkout.url;
      changes.payment_status='pending';
    }
  }
  if(action==='review')changes.status='reviewing';
  if(action==='reject') { changes.status='rejected'; changes.proposal=null; }
  if(action==='cancel') { changes.status='cancelled'; changes.proposal=null; }
  if(action==='preparing')changes.status='preparing';
  if(action==='ready')changes.status='ready';
  if(action==='dispatched')changes.status='dispatched';
  if(action==='complete')changes.status='completed';
  if(action==='cash_paid')changes.payment_status='paid';

  // Check old status in UPDATE to prevent two administrators from overwriting changes.
  const {data:saved,error:updateError}=await db.from('orders').update(changes).eq('id',id).eq('status',order.status).eq('payment_status',order.payment_status).eq('quote_revision',order.quote_revision||1).select('*').maybeSingle();
  if(updateError||!saved)return jsonError('Ordern ändrades av någon annan. Ladda om sidan.',409);
  if(['approve','reject'].includes(action)) await notifyOrderDecision(saved as CateringOrder,trackingLink(order));
  if(['review','preparing','ready','dispatched','cancel','cash_paid'].includes(action)) await notifyOrderProgress(saved as CateringOrder,action==='cash_paid'?'paid':String(changes.status));
  if(action === 'complete') {
    const settings = await getSettings();
    await notifyCompletedOrder(saved as CateringOrder, safeExternalUrl(settings.google_review_url));
  }
  return Response.json({order:saved},{headers:{'Cache-Control':'no-store'}});
}
