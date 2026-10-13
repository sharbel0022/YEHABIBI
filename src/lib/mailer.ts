import 'server-only';
import { Resend } from 'resend';
import type { CateringOrder } from '@/types/domain';
import { escapeHtml, formatSek, paymentLabels } from '@/lib/domain';

async function send(to: string, subject: string, body: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.warn('Email not configured; no message delivered');
    return false;
  }
  try {
    const client = new Resend(process.env.RESEND_API_KEY);
    const { error } = await client.emails.send({ from:process.env.EMAIL_FROM, to:[to], subject, html:`<div style="font:16px system-ui;max-width:600px;margin:auto;line-height:1.8"><h2 style="color:#163b2b">Cedar Mezze</h2>${body}<p>Med vänliga hälsningar,<br>Cedar Mezze</p></div>` });
    if (error) { console.error('Email provider failure', error.name); return false; }
    return true;
  } catch { console.error('Email unavailable'); return false; }
}

export async function notifyNewOrder(order:CateringOrder, trackingLink:string) {
  const details = `<p><b>Order ${escapeHtml(order.code)}</b></p><p>${escapeHtml(order.menu_title)} · ${order.guests} personer<br>Datum: ${escapeHtml(order.event_date)} kl ${escapeHtml(order.event_time)}<br>Belopp: ${formatSek(order.total_ore)}<br>Betalsätt: ${escapeHtml(paymentLabels[order.payment_preference])}</p>`;
  const owner = process.env.OWNER_NOTIFICATION_EMAIL;
  if (owner) await send(owner, order.payment_preference === 'cash' ? `Kontantbeställning – obetald #${order.code}` : `Ny cateringförfrågan #${order.code}`, `${details}<p><b>Status: OBEHANDLAD – ${order.payment_preference === 'cash' ? 'KONTANT/OBETALD' : 'EJ BETALD'}.</b></p><p>Namn: ${escapeHtml(order.full_name)}<br>Mejl: ${escapeHtml(order.email)}<br>Telefon: ${escapeHtml(order.phone)}<br>Önskemål: ${escapeHtml(order.notes)}</p><p>Logga in i adminpanelen för att godkänna.</p>`);
  await send(order.email, `Vi har fått din cateringförfrågan #${order.code}`, `${details}<p>Din förfrågan är mottagen men ännu inte godkänd eller betald. Vi återkommer med en bekräftelse.</p><p><a href="${escapeHtml(trackingLink)}">Följ din förfrågan</a></p>`);
}

export async function notifyOrderDecision(order:CateringOrder, trackingLink:string) {
  const msg = order.status === 'approved' ? 'Din förfrågan är godkänd.' : order.status === 'rejected' ? 'Vi kan tyvärr inte ta emot din förfrågan.' : 'Vi behöver ändra något i din beställning.';
  const payment = order.status === 'approved' && order.payment_preference === 'cash' ? '<p>Du betalar kontant vid överenskommen hämtning. Din order är fortfarande obetald.</p>' : order.status === 'approved' && order.checkout_url ? `<p><a href="${escapeHtml(order.checkout_url)}">Betala säkert här</a>. Beställningen registreras som betald först efter bekräftelse från betalningstjänsten.</p>` : '';
  await send(order.email, `Uppdatering om catering #${order.code}`, `<p><b>${msg}</b></p><p>${escapeHtml(order.admin_note || '')}</p>${payment}<p><a href="${escapeHtml(trackingLink)}">Visa orderstatus</a></p>`);
}

/** Ask every completed customer for an honest review: no ratings or rewards are implied. */
export async function notifyCompletedOrder(order: CateringOrder, officialGoogleReviewUrl: string | null) {
  const link = officialGoogleReviewUrl
    ? `<p>Vill du dela din upplevelse? <a href="${escapeHtml(officialGoogleReviewUrl)}">Lämna ett ärligt omdöme på Google</a>. Alla åsikter är välkomna.</p>`
    : '';
  await send(order.email, `Tack för din cateringbeställning #${order.code}`,
    `<p>Tack för att du valde oss!</p><p>Beställning <b>${escapeHtml(order.code)}</b> är nu markerad som slutförd.</p>${link}`);
}
