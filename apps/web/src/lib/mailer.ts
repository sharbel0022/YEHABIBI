import 'server-only';
import type { CateringOrder } from '@/types/domain';
import { escapeHtml, formatSek, formatScheduledTime, paymentLabels, safeExternalUrl, statusLabels } from '@/lib/domain';
import { adminDb } from '@/lib/supabase';
import { trackingLink } from '@/lib/tracking';
import { notifyCustomerPush, notifyOwnerPush } from '@/lib/push';
import { randomUUID } from 'node:crypto';
import { DeliveryRetryError, retryAfterSeconds,deliverWithFallback } from '@/lib/jobs/policy';

type Snapshot = CateringOrder & {included?:string[];review_url?:string|null};
type Notification = {event_key:string;order_id:string;kind:string;payload?:Snapshot;customer_delivered_at:string|null;owner_delivered_at:string|null;lease_token:string;lease_expires_at:string;first_attempt_at?:string;push_claimed?:boolean};

/** Innehållet kommer från den sparade händelsen, så ett återförsök skickar samma besked. */
function content(event:Notification,order:Snapshot,current:CateringOrder) {
  if (['kitchen_reminder','kitchen_escalation','preparation_reminder'].includes(event.kind)) {
    const message=event.kind==='preparation_reminder'?'Förberedelse behöver påbörjas':event.kind==='kitchen_escalation'?'Köksorder saknar kvittering – eskalering':'Köksorder behöver kvitteras';
    return {subject:`${message} #${order.code}`,message,customer:'',owner:`<p>${escapeHtml(message)}. Order ${escapeHtml(order.code)}.</p><p>Öppna adminpanelen och kvittera ordern. Levererad notis är ingen mänsklig kvittering.</p>`};
  }
  const link=trackingLink(order);
  const follow=`<p><a href="${escapeHtml(link)}">Följ din beställning</a></p>`;
  const originalSubtotal=order.subtotal_ore-(order.price_adjustment_ore||0);
  const direct=order.order_type==='direct';
  const rows=order.items_snapshot?.length ? order.items_snapshot : direct
    ? [{title:order.menu_title,quantity:order.package_quantity||1,unit_label:'paket',unit_price_ore:Math.round(originalSubtotal/(order.package_quantity||1)),line_total_ore:originalSubtotal}]
    : [{title:order.menu_title,quantity:order.guests,unit_label:'person',unit_price_ore:Math.round(originalSubtotal/order.guests),line_total_ore:originalSubtotal}];
  const lines=rows.map(row=>`<li>${row.quantity} × ${escapeHtml(row.title)} (${formatSek(row.unit_price_ore)}/${escapeHtml(row.unit_label)}) = ${formatSek(row.line_total_ore)}</li>`).join('');
  const delivery=order.fulfillment==='delivery' ? `Hemleverans: ${escapeHtml(order.address)}, ${escapeHtml(order.postal_code)} ${escapeHtml(order.city)}` : 'Hämtning';
  const bookedTime=direct && order.scheduled_at ? escapeHtml(formatScheduledTime(order.scheduled_at)) : `${escapeHtml(order.event_date)} kl ${escapeHtml(order.event_time)}`;
  const details=`<p><b>Order ${escapeHtml(order.code)}</b> · ${direct?`${order.package_quantity||1} paket · ${order.guests} portioner`:`${order.guests} personer`}<br>${bookedTime}<br>${delivery}</p><ul>${lines}</ul>${order.included?.length?`<p>Innehåller: ${order.included.map(escapeHtml).join(', ')}.</p>`:''}<p>Mat ${formatSek(originalSubtotal)}${order.price_adjustment_ore?`, godkänd prisjustering ${formatSek(order.price_adjustment_ore)}`:''}, leverans ${formatSek(order.delivery_fee_ore)}. Totalt <b>${formatSek(order.total_ore)}</b>.<br>Betalningsönskemål: ${escapeHtml(paymentLabels[order.payment_preference])}.</p>`;
  let message=event.kind==='new'?(direct ? order.capacity_status==='confirmed' && order.payment_preference==='cash'
      ? 'Din tid är bekräftad. Betala kontant vid hämtning.' : 'Din beställning är mottagen. Tiden hålls tillfälligt och är ännu inte betalningsbekräftad.'
      :'Din förfrågan är mottagen men ännu inte godkänd eller betald.')
    : event.kind==='paid'?(direct && current.capacity_status==='confirmed'?'Betalningen och din bokade tid är bekräftade.':'Betalningen är bekräftad.') : event.kind==='refunded'?'Betalningen har återbetalats.'
    : event.kind==='failed'?'Betalningen misslyckades eller sessionen gick ut. Kontakta köket för en ny betalningslänk.'
    : event.kind==='changes_requested'?'Köket föreslår en ändring som du behöver godkänna.'
    : event.kind==='payment_available'?'Din förfrågan är godkänd. Din säkra betalningslänk är tillgänglig.'
    : event.kind==='payment_request'?'Din förfrågan är godkänd. Öppna orderlänken och välj ett tillgängligt betalningssätt.'
    : event.kind==='payment_review'?(current.payment_review_reason==='capacity_unavailable_after_payment'
      ? 'Betalningen är verifierad, men tiden kunde inte bekräftas. Köket hjälper dig med en ny tid eller återbetalning.'
      :'Betalningen behöver kontrolleras av köket. Betala inte på nytt innan du fått besked.') : statusLabels[order.status];
  if(event.kind==='approved' && order.payment_preference==='cash') message+=' Du betalar kontant vid hämtning. Ordern är fortfarande obetald.';
  const proposal=order.proposal ? `<p>${escapeHtml(order.proposal.message)}<br>Nuvarande totalpris ${formatSek(order.total_ore)}. Föreslaget totalpris <b>${formatSek(order.proposal.total_ore)}</b>.</p><p>Granska och godkänn förslaget via orderlänken före betalning.</p>` : '';
  // En försenad notis får aldrig erbjuda en ersatt, betald eller ändrad betalning.
  const payable=current.payment_provider && current.payment_attempt_id && current.payment_status==='pending' && !current.proposal && ['approved','preparing','ready'].includes(current.status)
    && !current.payment_review_required && current.payment_attempt_id===order.payment_attempt_id && current.quote_revision===order.quote_revision;
  if(event.kind==='payment_available'&&!payable) message='Betalningsinformationen har uppdaterats. Se aktuell orderstatus.';
  const checkout=payable && ['approved','payment_available'].includes(event.kind) ? safeExternalUrl(current.checkout_url) : null;
  const review=event.kind==='completed'?safeExternalUrl(order.review_url):null;
  const customer=`<p><b>${escapeHtml(message)}</b></p>${details}${proposal}${checkout?`<p><a href="${escapeHtml(checkout)}">Öppna säker betalning</a>. Betald visas först efter verifiering från betaltjänsten.</p>`:''}${review?`<p><a href="${escapeHtml(review)}">Lämna ett ärligt omdöme på Google</a>. Alla åsikter är välkomna.</p>`:''}${follow}`;
  const notifyOwner=event.kind==='new'||['paid','refunded','failed','payment_review'].includes(event.kind);
  const owner=notifyOwner?`${details}<p>${escapeHtml(message)} ${order.payment_preference==='cash'&&event.kind==='new'?'KONTANT – OBETALD.':''}</p><p>Namn: ${escapeHtml(order.full_name)}<br>E-post: ${escapeHtml(order.email)}<br>Telefon: ${escapeHtml(order.phone)}<br>Önskemål: ${escapeHtml(order.notes)}</p><p>Öppna adminpanelen för att granska ordern.</p>`:null;
  return {subject:`${message} #${order.code}`,message,customer,owner};
}

async function send(to:string,subject:string,html:string,key:string) {
  if(process.env.NOTIFICATIONS_ENABLED!=='true'||!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM) return false;
  try {
    const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(8000),
      headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},
      body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject,
        html:`<div style="font:16px system-ui;max-width:600px;margin:auto;line-height:1.8"><h2 style="color:#155A43">Yei Habibi · Catering & Fest</h2>${html}</div>`})});
    if (!response.ok) throw new DeliveryRetryError(retryAfterSeconds(response.headers.get('retry-after')));
    return true;
  } catch(error) { if(error instanceof DeliveryRetryError)throw error; return false; }
}

/** Shared by explicit admin retries and scheduled workers; all senders use the same lease. */
export async function deliverNotificationBatch(worker:string,limit=2,orderId?:string) {
  const db=adminDb();
  const {data:pending,error}=await db.rpc('claim_catering_notifications',{p_worker:worker,p_limit:limit,p_lease_seconds:180,p_order_id:orderId||null}).abortSignal(AbortSignal.timeout(8000));
  if(error) throw new Error('Kunde inte läsa meddelandekön.');
  if(!pending?.length) return 0;
  let delivered=0;
  for(const event of pending as Notification[]) {
    const finish=async(customer:boolean,owner:boolean,superseded=false)=>{
      const {data:accepted,error:saveError}=await db.rpc('complete_catering_notification',{p_event_key:event.event_key,p_lease_token:event.lease_token,
        p_customer_delivered:customer,p_owner_delivered:owner,p_superseded:superseded}).abortSignal(AbortSignal.timeout(8000));
      if(saveError||accepted===false)throw new Error('Notification lease lost');
    };
    try {
    if(Date.parse(event.lease_expires_at)-Date.now()<60000)throw new Error('Insufficient notification lease budget');
    const {data:latest,error:readError}=await db.from('orders').select('*').eq('id',event.order_id).abortSignal(AbortSignal.timeout(8000)).single();
    if(readError||!latest)throw new Error('Order unavailable');
    const current=latest as CateringOrder;
    let order=event.payload as Snapshot;
    if(!order?.id) {
      order=current;
    }
    // Behåll kvittot på att beskedet ersatts; kalla det inte levererat.
    // Skicka heller aldrig nytt innehåll med en gammal Resend-idempotensnyckel.
    const changed=order.quote_revision!==current.quote_revision||order.payment_attempt_id!==current.payment_attempt_id;
    const superseded=(event.kind==='payment_available' && (changed||current.payment_status!=='pending'||current.proposal||!['approved','preparing','ready'].includes(current.status)))
      ||(event.kind==='approved' && (changed||current.status!=='approved'||order.payment_status!==current.payment_status))
      ||(event.kind==='payment_request' && (current.proposal||['paid','refunded'].includes(current.payment_status)||!['approved','preparing','ready'].includes(current.status)))
      ||(['paid','refunded'].includes(event.kind) && current.payment_review_required)
      ||(event.kind==='changes_requested' && (changed||current.status!=='changes_requested'))
      ||(['kitchen_reminder','kitchen_escalation'].includes(event.kind) && (Boolean(current.acknowledged_at)||!['approved','preparing'].includes(current.status)||current.capacity_status!=='confirmed'))
      ||(event.kind==='preparation_reminder' && (current.status!=='approved'||current.capacity_status!=='confirmed'));
    if(superseded) {
      await finish(false,false,true);
      continue;
    }
    // An outage beyond the provider's 24h idempotency retention requires manual checking.
    if(event.first_attempt_at&&Date.now()-Date.parse(event.first_attempt_at)>23*3600000)throw new Error('Notification deduplication window exceeded');
    const mail=content(event,order,current);
    const customer=Boolean(event.customer_delivered_at)||!mail.customer||await send(order.email,mail.subject,mail.customer,`${event.event_key}:customer`);
    // Persist each recipient before another external call can fail or the process can crash.
    if(customer&&!event.customer_delivered_at)await finish(true,false);
    const backupApproved=event.kind==='kitchen_escalation'&&(event.payload as unknown as {backup_requested?:boolean})?.backup_requested===true;
    const owner=Boolean(event.owner_delivered_at)||!mail.owner||await deliverWithFallback(
      async()=>Boolean(process.env.OWNER_NOTIFICATION_EMAIL&&await send(process.env.OWNER_NOTIFICATION_EMAIL,mail.subject,mail.owner||'',`${event.event_key}:owner`)),
      backupApproved&&process.env.KITCHEN_BACKUP_EMAIL ? async()=>send(process.env.KITCHEN_BACKUP_EMAIL!,mail.subject,mail.owner||'',`${event.event_key}:backup`) : undefined);
    if(owner&&!event.owner_delivered_at)await finish(customer,true);
    if(!customer||!owner)throw new DeliveryRetryError();
    // Push complements durable email. Expo has no end-to-end exactly-once guarantee.
    const {data:claimed}=await db.from('order_notifications').update({push_claimed:true}).eq('event_key',event.event_key).eq('push_claimed',false).select('event_key').maybeSingle();
    if(claimed) await Promise.allSettled([...(mail.customer?[notifyCustomerPush(current,mail.message)]:[]),...(mail.owner?[notifyOwnerPush(current,event.kind==='new'?undefined:mail.message)]:[])]);
    delivered++;
    } catch(error) {
      const {error:failError}=await db.rpc('fail_catering_notification',{p_event_key:event.event_key,p_lease_token:event.lease_token,p_error:'notification_delivery_pending',
        p_retry_after_seconds:error instanceof DeliveryRetryError ? error.retryAfter??null : null}).abortSignal(AbortSignal.timeout(8000));
      if(failError)throw new Error('Kunde inte spara notifieringens återförsök.');
    }
  }
  return delivered;
}

export async function deliverOrderNotifications(orderId:string) {
  return deliverNotificationBatch(randomUUID(),2,orderId);
}

// Namnet behålls för webhookens V4-anrop; samma kö hanterar nu alla statusar.
export const deliverPaymentNotifications=deliverOrderNotifications;
