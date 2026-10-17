import 'server-only';
import { Resend } from 'resend';
import type { CateringOrder } from '@/types/domain';
import { escapeHtml, formatSek, paymentLabels, statusLabels } from '@/lib/domain';
import { adminDb } from '@/lib/supabase';
import { trackingLink as privateTrackingLink } from '@/lib/tracking';
import { notifyCustomerPush, notifyOwnerPush } from '@/lib/push';

async function send(to: string, subject: string, body: string, key:string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.warn('Email not configured; no message delivered');
    return false;
  }
  try {
    const client = new Resend(process.env.RESEND_API_KEY);
    const { error } = await client.emails.send({ from:process.env.EMAIL_FROM, to:[to], subject, html:`<div style="font:16px system-ui;max-width:600px;margin:auto;line-height:1.8"><h2 style="color:#155A43">Yehabibi · Cedar Mezze</h2>${body}<p>Med vänliga hälsningar,<br>Cedar Mezze</p></div>` },{idempotencyKey:key});
    if (error) { console.error('Email provider failure', error.name); return false; }
    return true;
  } catch { console.error('Email unavailable'); return false; }
}

export async function notifyNewOrder(order:CateringOrder, trackingLink:string) {
  const details = `<p><b>Order ${escapeHtml(order.code)}</b></p><p>${escapeHtml(order.menu_title)} · ${order.guests} personer<br>Datum: ${escapeHtml(order.event_date)} kl ${escapeHtml(order.event_time)}<br>Belopp: ${formatSek(order.total_ore)}<br>Betalsätt: ${escapeHtml(paymentLabels[order.payment_preference])}</p>`;
  const lines=(order.items_snapshot||[]).map(item=>
    `<li>${item.quantity} × ${escapeHtml(item.title)} (${formatSek(item.unit_price_ore)}/${escapeHtml(item.unit_label)}) = ${formatSek(item.line_total_ore)}</li>`
  ).join('');
  const breakdown=lines?`<p><b>Rätt för rätt:</b></p><ul>${lines}</ul>`:'';
  const owner = process.env.OWNER_NOTIFICATION_EMAIL;
  const ownerSent = !owner || await send(owner, order.payment_preference === 'cash' ? `Kontantbeställning – obetald #${order.code}` : `Ny cateringförfrågan #${order.code}`, `${details}${breakdown}<p><b>Status: OBEHANDLAD – ${order.payment_preference === 'cash' ? 'KONTANT/OBETALD' : 'EJ BETALD'}.</b></p><p>Namn: ${escapeHtml(order.full_name)}<br>Mejl: ${escapeHtml(order.email)}<br>Telefon: ${escapeHtml(order.phone)}<br>Önskemål: ${escapeHtml(order.notes)}</p><p>Logga in i adminpanelen för att godkänna.</p>`,`${order.id}:new:owner`);
  const customerSent = await send(order.email, `Vi har fått din cateringförfrågan #${order.code}`, `${details}${breakdown}<p>Din förfrågan är mottagen men ännu inte godkänd eller betald. Vi återkommer med en bekräftelse.</p><p><a href="${escapeHtml(trackingLink)}">Följ din förfrågan</a></p>`,`${order.id}:new:customer`);
  return ownerSent && customerSent;
}

export async function notifyOrderDecision(order:CateringOrder, trackingLink:string) {
  const accepted = ['approved','preparing','ready'].includes(order.status);
  const msg = accepted ? 'Din förfrågan är godkänd.' : order.status === 'rejected' ? 'Vi kan tyvärr inte ta emot din förfrågan.' : 'Vi behöver ändra något i din beställning.';
  const payment = accepted && order.payment_preference === 'cash' ? '<p>Du betalar kontant vid överenskommen hämtning. Din order är fortfarande obetald.</p>' : accepted && order.checkout_url ? `<p><a href="${escapeHtml(order.checkout_url)}">Betala säkert här</a>. Beställningen registreras som betald först efter bekräftelse från betalningstjänsten.</p>` : '';
  const proposal = order.proposal ? `<p>Nuvarande pris: ${formatSek(order.total_ore)}. Föreslaget totalpris: <b>${formatSek(order.proposal.total_ore)}</b>.</p><p>Granska förslaget och godkänn det nya priset via din orderlänk. Ingen betalning görs innan du godkänt.</p>` : `<p>Totalpris: <b>${formatSek(order.total_ore)}</b>.</p>`;
  const delivered = await send(order.email, `Uppdatering om catering #${order.code}`, `<p><b>${msg}</b></p><p>${escapeHtml(order.admin_note || '')}</p>${proposal}${payment}<p><a href="${escapeHtml(trackingLink)}">Visa orderstatus</a></p>`,`${order.id}:${order.status}:${order.quote_revision||1}:${order.stripe_checkout_session_id||'no-session'}`);
  await notifyCustomerPush(order,msg);
  return delivered;
}

/** Ask every completed customer for an honest review: no ratings or rewards are implied. */
export async function notifyCompletedOrder(order: CateringOrder, officialGoogleReviewUrl: string | null) {
  const link = officialGoogleReviewUrl
    ? `<p>Vill du dela din upplevelse? <a href="${escapeHtml(officialGoogleReviewUrl)}">Lämna ett ärligt omdöme på Google</a>. Alla åsikter är välkomna.</p>`
    : '';
  const delivered = await send(order.email, `Tack för din cateringbeställning #${order.code}`,
    `<p>Tack för att du valde oss!</p><p>Beställning <b>${escapeHtml(order.code)}</b> är nu markerad som slutförd.</p>${link}`,`${order.id}:completed`);
  await notifyCustomerPush(order,'Din beställning är slutförd. Tack för att du valde oss!');
  return delivered;
}

export async function notifyOrderProgress(order:CateringOrder,kind:string,sendPush=true,channels={customer:true,owner:true}) {
  const message = kind==='paid' ? 'Betalningen är bekräftad.' : kind==='refunded' ? 'Din betalning har återbetalats.'
    : kind==='failed' ? 'Betalningen kunde inte genomföras. Kontrollera din orderlänk.' : statusLabels[order.status];
  const eventKey = `${order.id}:${kind}:${order.quote_revision||1}`;
  const body = `<p><b>${escapeHtml(message)}</b></p><p>Order ${escapeHtml(order.code)} · ${formatSek(order.total_ore)}</p><p><a href="${escapeHtml(privateTrackingLink(order))}">Följ din beställning</a></p>`;
  const customer = !channels.customer || await send(order.email,`${message} #${order.code}`,body,`${eventKey}:customer`);
  let owner = true;
  if(channels.owner && ['paid','refunded','failed'].includes(kind) && process.env.OWNER_NOTIFICATION_EMAIL) owner = await send(process.env.OWNER_NOTIFICATION_EMAIL,
    `${message} #${order.code}`,`<p>${escapeHtml(message)} Order ${escapeHtml(order.code)} · ${formatSek(order.total_ore)}. Kontrollera adminpanelen.</p>`,`${eventKey}:owner`);
  if(sendPush) await notifyCustomerPush(order,message);
  return {customer,owner};
}

/** Stripe kan upprepa eller leverera flera event. Kön + leverantörsnyckeln bevarar ett kvitto. */
export async function deliverPaymentNotifications(orderId:string) {
  const db = adminDb();
  const {data:pending,error} = await db.from('order_notifications').select('*').eq('order_id',orderId).is('delivered_at',null).order('created_at');
  if(error) throw new Error('Kunde inte läsa meddelandekön.');
  if(!pending?.length) return 0;
  const {data:order,error:orderError} = await db.from('orders').select('*').eq('id',orderId).single();
  if(orderError || !order) throw new Error('Kunde inte läsa betalningsorder.');
  for(const event of pending) {
    // Expo saknar leverantörens idempotensnyckel. Ta pushansvaret före utskick.
    const {data:claimed} = await db.from('order_notifications').update({push_claimed:true})
      .eq('event_key',event.event_key).eq('push_claimed',false).select('event_key').maybeSingle();
    const delivered = await notifyOrderProgress(order as CateringOrder,event.kind,Boolean(claimed),
      {customer:!event.customer_delivered_at,owner:!event.owner_delivered_at});
    if(claimed) await notifyOwnerPush(order as CateringOrder,event.kind==='paid'?'Betalning bekräftad':'Betalning uppdaterad');
    const now = new Date().toISOString();
    const {error:saveError} = await db.from('order_notifications').update({
      ...(delivered.customer?{customer_delivered_at:event.customer_delivered_at||now}:{}),
      ...(delivered.owner?{owner_delivered_at:event.owner_delivered_at||now}:{}),
      ...(delivered.customer&&delivered.owner?{delivered_at:now}:{})
    }).eq('event_key',event.event_key);
    if(saveError) throw new Error('Kunde inte kvittera meddelandet.');
    if(!delivered.customer || !delivered.owner) throw new Error('Betalningen är sparad; meddelandet behöver skickas igen.');
  }
  return pending.length;
}
