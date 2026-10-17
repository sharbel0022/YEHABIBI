import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { adminDb } from '@/lib/supabase';
import { isSupabaseReady } from '@/lib/config';
import { verifyTrackingToken } from '@/lib/tracking';
import { formatSek, paymentStatusLabels, safeExternalUrl, statusLabels } from '@/lib/domain';
import type { CateringOrder } from '@/types/domain';

export const metadata: Metadata = { title: 'Följ din cateringförfrågan', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function TrackOrder({ params, searchParams }: {
  params: Promise<{ code: string }>; searchParams: Promise<{ token?: string }>
}) {
  if (!isSupabaseReady()) notFound();
  const [{ code }, { token }] = await Promise.all([params, searchParams]);
  if (!/^[A-Z0-9-]{8,24}$/.test(code) || !token || !/^[a-f0-9]{64}$/.test(token)) notFound();
  const { data, error } = await adminDb().from('orders').select('*, order_items(*)').eq('code', code).maybeSingle();
  if (error || !data) notFound();
  const order = data as CateringOrder;
  if (!verifyTrackingToken(token, order.tracking_hash)) notFound();
  const checkout = safeExternalUrl(order.checkout_url);
  // Äldre V2-ordrar har snapshotrader. Nya beställningar har relationen order_items.
  const lines = order.order_items?.length ? order.order_items.map((line, index) => ({
    key: line.dish_id || line.menu_id || String(index), title: line.title, quantity: line.quantity,
    unitPrice: line.unit_price_ore, unit: line.unit_label || '', total: line.total_ore
  })) : (order.items_snapshot || []).map(line => ({
    key: line.item_id, title: line.title, quantity: line.quantity,
    unitPrice: line.unit_price_ore, unit: line.unit_label, total: line.line_total_ore
  }));

  return <section className="shell section inner-page">
    <span className="eyebrow">DIN FÖRFRÅGAN · {order.code}</span><h1>Så går det med din catering</h1>
    <div className="form-layout"><div className="order-panel">
      <h2>{statusLabels[order.status]}</h2><p>Betalning: <strong>{paymentStatusLabels[order.payment_status]}</strong>.</p>
      <p>{order.menu_title} för {order.guests} personer.<br/>Datum: {order.event_date}, kl {order.event_time}.</p>
      {lines.length > 0 && <div className="summary-lines">{lines.map(line => <div key={line.key}>
        <span>{line.quantity} × {line.title} ({formatSek(line.unitPrice)}{line.unit ? `/${line.unit}` : ''})</span>
        <strong>{formatSek(line.total)}</strong>
      </div>)}</div>}
      <div className="summary-list">
        <span>Mat</span><strong>{formatSek(order.subtotal_ore)}</strong>
        <span>Leverans</span><strong>{order.fulfillment === 'pickup' ? 'Hämtning: 0 kr' : formatSek(order.delivery_fee_ore)}</strong>
        <span className="total">Totalt</span><strong className="total">{formatSek(order.total_ore)}</strong>
        <span>Per person ({order.guests})</span><strong>{formatSek(Math.round(order.total_ore / order.guests))}</strong>
      </div>
      {order.admin_note && <div className="preview-note"><strong>Meddelande från oss:</strong> {order.admin_note}</div>}
      {order.status === 'approved' && order.payment_preference === 'cash' && <p>Kontant betalning sker vid överenskommen hämtning. Markeras som betald först när vi tagit emot pengarna.</p>}
      {order.status === 'approved' && order.payment_status !== 'paid' && checkout && <a href={checkout} className="btn btn-primary" rel="noopener noreferrer">Betala säkert →</a>}
      <p className="admin-note">Har du frågor? Svara på bekräftelsemejlet.</p>
    </div><aside className="form-sidebar"><h3>Så fungerar det</h3><p>Vi granskar alla cateringförfrågningar manuellt. Du får ett besked innan betalning.</p></aside></div>
  </section>;
}
