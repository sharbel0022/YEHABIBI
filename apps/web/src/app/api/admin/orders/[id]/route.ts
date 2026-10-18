import { requireAdmin, checkOrigin, jsonError } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { adminActionSchema } from '@/lib/validators';
import { canTransition } from '@/lib/domain';
import { requestRefund, paymentCapabilities } from '@/lib/payments';
import { deliverOrderNotifications } from '@/lib/mailer';
import type { CateringOrder } from '@/types/domain';

export const dynamic='force-dynamic';
export async function PATCH(request: Request,{params}:{params:Promise<{id:string}>}) {
  try { return await updateOrder(request,{params}); }
  catch { return jsonError('Åtgärden kunde inte genomföras. Kontrollera betalningsinställningarna och försök igen.',503); }
}
async function updateOrder(request:Request,{params}:{params:Promise<{id:string}>}) {
  if (!checkOrigin(request)) return jsonError('Felaktigt anrop.',403);
  const administrator = await requireAdmin();
  if (!administrator) return jsonError('Obehörig.',401);
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
    try {
      const count=await deliverOrderNotifications(id);
      return Response.json({order,message:count?'Väntande meddelanden har behandlats.':'Det finns inga väntande meddelanden.'});
    } catch { return jsonError('Ordern är sparad. E-post väntar på nytt försök; kontrollera e-postinställningarna.',502); }
  }

  if(action==='payment_link') {
    if(!['approved','preparing','ready'].includes(order.status)||order.payment_preference==='cash'||['paid','refunded'].includes(order.payment_status))return jsonError('Ny betalningslänk är inte tillgänglig.');
    if(order.payment_review_required||order.proposal||(order.quote_revision||1)!==(order.accepted_revision||1))return jsonError('Betalning eller aktuellt pris behöver kontrolleras före betalningsbegäran.',409);
    if(!(await paymentCapabilities()).length)return jsonError('Inga verifierade onlinebetalningsmetoder är aktiverade.',503);
    const {error:queueError}=await db.rpc('queue_catering_notification',{p_order_id:id,p_kind:'payment_request'});
    if(queueError)return jsonError('Betalningsbegäran kunde inte köas.',503);
    await deliverOrderNotifications(id).catch(()=>console.error('Payment request queued; notifications pending'));
    return Response.json({order,message:'Betalningsbegäran har köats. Kunden väljer bland tillgängliga betalningssätt via sin privata orderlänk.'});
  }
  if(action==='refund') {
    if(order.payment_preference==='cash'||order.payment_status!=='paid'||!order.payment_provider||(order.payment_review_required&&order.payment_review_reason!=='capacity_unavailable_after_payment'))return jsonError('Återbetalningen behöver först kontrolleras mot den ursprungliga transaktionen.',400);
    await requestRefund(order);
    const {data:latest}=await db.from('orders').select('*').eq('id',id).single();
    return Response.json({order:latest||order,message:'Återbetalning begärd. Avvakta verifierad bekräftelse från betaltjänsten.'});
  }
  if(order.payment_review_required && ['cash_paid','preparing','ready','dispatched','complete'].includes(action))return jsonError('Betalningen behöver kontrolleras hos leverantören före fortsatt hantering.',409);
  const fulfillmentAction = ['preparing','ready','dispatched','complete'].includes(action);
  if(fulfillmentAction && order.payment_refund_status)return jsonError('Ordern kan inte fortsätta när återbetalning har begärts.',409);
  if(action==='cash_paid'&&!canTransition(order.status,action,order.payment_status,order.payment_preference))return jsonError('Kontantregistrering är inte tillgänglig för denna order.',409);
  if(action==='dispatched' && order.fulfillment!=='delivery') return jsonError('På väg gäller bara hemleverans.');
  if(action==='cash_paid' && order.fulfillment!=='pickup') return jsonError('Kontanter får bara registreras vid hämtning.');
  if(action==='request_changes') {
    if(!canTransition(order.status,action,order.payment_status,order.payment_preference))return jsonError('Åtgärden är inte tillåten för orderns nuvarande status.',409);
    const {data:saved,error:updateError} = await db.rpc('propose_catering_change',{
      p_order_id:id,p_expected_revision:order.quote_revision||1,p_total_ore:proposed_total_ore??order.total_ore,p_note:admin_note
    });
    if(updateError||!saved)return jsonError('Förslaget kunde inte sparas. Kontrollera beloppet och ladda om.',409);
    await deliverOrderNotifications(id).catch(()=>console.error('Proposal saved; notifications pending'));
    return Response.json({order:saved});
  }
  if(action==='cash_paid') {
    const {data:cashOrder,error:cashError}=await db.rpc('record_catering_cash_payment',{p_order_id:id,p_admin_id:administrator.id});
    if(cashError||!cashOrder)return jsonError('Kontantbetalningen kunde inte registreras. Uppdatera ordern.',409);
    await deliverOrderNotifications(id).catch(()=>console.error('Cash recorded; notifications pending'));
    return Response.json({order:cashOrder},{headers:{'Cache-Control':'no-store'}});
  }

  // PostgreSQL locks capacity and order together and rechecks payment, packing and status.
  const {data:saved,error:updateError}=await db.rpc('transition_kitchen_order',{
    p_order_id:id,p_action:action,p_admin_id:administrator.id,p_admin_note:admin_note??null,
    p_expected_status:order.status,p_data:parsed.data
  });
  if(updateError||!saved)return jsonError('Åtgärden kunde inte sparas. Kontrollera kapacitet, betalning och sparad packkontroll, och uppdatera ordern.',409);
  await deliverOrderNotifications(id).catch(()=>console.error('Order updated; notifications pending'));
  return Response.json({order:saved},{headers:{'Cache-Control':'no-store'}});
}
