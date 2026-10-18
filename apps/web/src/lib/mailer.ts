import 'server-only';
import { Resend } from 'resend';
import type { CateringOrder } from '@/types/domain';
import { escapeHtml, formatSek, formatScheduledTime, paymentLabels, safeExternalUrl, statusLabels } from '@/lib/domain';
import { adminDb } from '@/lib/supabase';
import { trackingLink } from '@/lib/tracking';
import { notifyCustomerPush, notifyOwnerPush } from '@/lib/push';

type Snapshot = CateringOrder & {included?:string[];review_url?:string|null};
type Notification = {event_key:string;kind:string;payload?:Snapshot;customer_delivered_at:string|null;owner_delivered_at:string|null};

/** Innehållet kommer från den sparade händelsen, så ett återförsök skickar samma besked. */
function content(event:Notification,order:Snapshot,current:CateringOrder) {
  const link=trackingLink(order);
  const follow=`<p><a href="${escapeHtml(link)}">Följ din beställning</a></p>`;
  const originalSubtotal=order.subtotal_ore-(order.price_adjustment_ore||0);
  const direct=order.order_type==='direct';
  const rows=direct ? [{title:order.menu_title,quantity:order.package_quantity||1,unit_label:'paket',unit_price_ore:Math.round(originalSubtotal/(order.package_quantity||1)),line_total_ore:originalSubtotal}]
    : order.items_snapshot?.length ? order.items_snapshot : [{title:order.menu_title,quantity:order.guests,unit_label:'person',unit_price_ore:Math.round(originalSubtotal/order.guests),line_total_ore:originalSubtotal}];
  const lines=rows.map(row=>`<li>${row.quantity} × ${escapeHtml(row.title)} (${formatSek(row.unit_price_ore)}/${escapeHtml(row.unit_label)}) = ${formatSek(row.line_total_ore)}</li>`).join('');
  const delivery=order.fulfillment==='delivery' ? `Hemleverans: ${escapeHtml(order.address)}, ${escapeHtml(order.postal_code)} ${escapeHtml(order.city)}` : 'Hämtning';
  const bookedTime=direct && order.scheduled_at ? escapeHtml(formatScheduledTime(order.scheduled_at)) : `${escapeHtml(order.event_date)} kl ${escapeHtml(order.event_time)}`;
  const details=`<p><b>Order ${escapeHtml(order.code)}</b> · ${direct?`${order.package_quantity||1} paket · ${order.guests} portioner`:`${order.guests} personer`}<br>${bookedTime}<br>${delivery}</p><ul>${lines}</ul>${order.included?.length?`<p>Innehåller: ${order.included.map(escapeHtml).join(', ')}.</p>`:''}<p>Mat ${formatSek(originalSubtotal)}${order.price_adjustment_ore?`, godkänd prisjustering ${formatSek(order.price_adjustment_ore)}`:''}, leverans ${formatSek(order.delivery_fee_ore)}. Totalt <b>${formatSek(order.total_ore)}</b>.<br>Betalningsönskemål: ${escapeHtml(paymentLabels[order.payment_preference])}.</p>`;
  let message=event.kind==='new'?(direct && order.status==='approved'?'Din beställning är mottagen och godkänd. Den är ännu inte betald.':'Din förfrågan är mottagen men ännu inte godkänd eller betald.')
    : event.kind==='paid'?'Betalningen är bekräftad.' : event.kind==='refunded'?'Betalningen har återbetalats.'
    : event.kind==='failed'?'Betalningen misslyckades eller sessionen gick ut. Kontakta köket för en ny betalningslänk.'
    : event.kind==='changes_requested'?'Köket föreslår en ändring som du behöver godkänna.'
    : event.kind==='payment_available'?'Din förfrågan är godkänd. Din säkra betalningslänk är tillgänglig.'
    : event.kind==='payment_request'?'Din förfrågan är godkänd. Öppna orderlänken och välj ett tillgängligt betalningssätt.'
    : event.kind==='payment_review'?'Betalningen behöver kontrolleras av köket. Betala inte på nytt innan du fått besked.' : statusLabels[order.status];
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
  if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM) return false;
  try {
    const {error}=await new Resend(process.env.RESEND_API_KEY).emails.send({from:process.env.EMAIL_FROM,to:[to],subject,
      html:`<div style="font:16px system-ui;max-width:600px;margin:auto;line-height:1.8"><h2 style="color:#155A43">Yehabibi · Cedar Mezze</h2>${html}</div>`},{idempotencyKey:key});
    return !error;
  } catch { return false; }
}

/** Alla händelser köas av PostgreSQL. Misslyckade mejl ligger kvar för nästa försök. */
export async function deliverOrderNotifications(orderId:string) {
  const db=adminDb();
  const {data:pending,error}=await db.from('order_notifications').select('*').eq('order_id',orderId).is('delivered_at',null).is('superseded_at',null).order('created_at');
  if(error) throw new Error('Kunde inte läsa meddelandekön.');
  if(!pending?.length) return 0;
  const {data:latest,error:readError}=await db.from('orders').select('*').eq('id',orderId).single();
  if(readError||!latest) throw new Error('Kunde inte läsa ordern.');
  const current=latest as CateringOrder;
  let failed=false;
  for(const event of pending) {
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
      ||(event.kind==='changes_requested' && (changed||current.status!=='changes_requested'));
    if(superseded) {
      const {error:skipError}=await db.from('order_notifications').update({superseded_at:new Date().toISOString()}).eq('event_key',event.event_key);
      if(skipError)throw new Error('Kunde inte avsluta ersatt meddelande.');
      continue;
    }
    const mail=content(event,order,current);
    const customer=Boolean(event.customer_delivered_at)||await send(order.email,mail.subject,mail.customer,`${event.event_key}:customer`);
    const owner=Boolean(event.owner_delivered_at)||!mail.owner||Boolean(process.env.OWNER_NOTIFICATION_EMAIL&&await send(process.env.OWNER_NOTIFICATION_EMAIL,mail.subject,mail.owner,`${event.event_key}:owner`));
    const now=new Date().toISOString();
    const {error:saveError}=await db.from('order_notifications').update({
      ...(customer?{customer_delivered_at:event.customer_delivered_at||now}:{}),
      ...(owner?{owner_delivered_at:event.owner_delivered_at||now}:{}),
      ...(customer&&owner?{delivered_at:now}:{})
    }).eq('event_key',event.event_key);
    if(saveError) throw new Error('Kunde inte kvittera meddelandet.');
    const {data:claimed}=await db.from('order_notifications').update({push_claimed:true}).eq('event_key',event.event_key).eq('push_claimed',false).select('event_key').maybeSingle();
    if(claimed) await Promise.allSettled([notifyCustomerPush(order,mail.message),...(mail.owner?[notifyOwnerPush(order,event.kind==='new'?undefined:mail.message)]:[])]);
    if(!customer||!owner) failed=true;
  }
  if(failed) throw new Error('Ordern är sparad. E-post väntar på ett nytt leveransförsök.');
  return pending.length;
}

// Namnet behålls för webhookens V4-anrop; samma kö hanterar nu alla statusar.
export const deliverPaymentNotifications=deliverOrderNotifications;
