'use client';

import { useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import type { PublicOrder } from '@/types/domain';
import { formatSek, paymentLabels, paymentStatusLabels, safeExternalUrl, statusLabels } from '@/lib/domain';

function progress(order: PublicOrder) {
  if (order.status === 'completed') return 8;
  if (order.status === 'ready' || order.status === 'dispatched') return 7;
  if (order.status === 'preparing') return 6;
  if (order.status === 'approved') return order.payment_status === 'paid' ? 5 : 4;
  if (order.status === 'reviewing' || order.status === 'changes_requested') return 2;
  return 1;
}

/** Endast kundens token-skyddade publika ordervy skickas till webbläsaren. */
export function OrderTracking({ initialOrder, token }: { initialOrder: PublicOrder; token: string }) {
  const [order, setOrder] = useState(initialOrder);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const checkout = safeExternalUrl(order.checkout_url);
  const endpoint = `/api/orders/${encodeURIComponent(order.code)}?token=${encodeURIComponent(token)}`;
  const current = progress(order);
  const labels = ['Mottagen', 'Under granskning', 'Godkänd', order.payment_preference === 'cash' ? 'Betalning vid hämtning' : 'Väntar på betalning',
    'Betald', 'Under förberedelse', order.fulfillment === 'pickup' ? 'Klar för hämtning' : 'På väg', 'Slutförd'];

  async function update(accept = false) {
    if (busy || (accept && (!accepted || !order.proposal))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(endpoint, accept ? { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept_changes', revision: order.proposal!.revision }) } : { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Kunde inte uppdatera förfrågan.');
      setOrder(result.order); setAccepted(false);
      setMessage(accept ? 'Ändringen är godkänd. Betalningsinformationen är uppdaterad.' : 'Statusen är uppdaterad.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Försök igen senare.'); }
    finally { setBusy(false); }
  }

  return <div className="form-layout"><div className="order-panel">
    <span className="admin-pill">{order.status === 'approved' && order.payment_status === 'pending' ? 'Väntar på betalning' : statusLabels[order.status]}</span>
    <h2>{order.menu_title}</h2><p>{order.guests} personer · {order.event_date}, kl {order.event_time}<br/>{order.fulfillment === 'pickup' ? 'Hämtning' : 'Hemleverans'}</p>
    <p className="admin-note">Betalning: <strong>{paymentStatusLabels[order.payment_status]}</strong> · {paymentLabels[order.payment_preference]}</p>
    {order.admin_note && !order.proposal && <p className="preview-note"><strong>Meddelande från köket:</strong> {order.admin_note}</p>}
    {order.items.length > 0 && <div className="summary-lines">{order.items.map((line, index) => <div key={line.dish_id || line.menu_id || index}>
      <span>{line.quantity} × {line.title}<small>{formatSek(line.unit_price_ore)} / {line.unit_label || 'portion'}</small></span><strong>{formatSek(line.total_ore)}</strong>
    </div>)}</div>}
    <div className="summary-list"><span>Mat</span><strong>{formatSek(order.subtotal_ore - (order.price_adjustment_ore || 0))}</strong>
      <span>Leverans</span><strong>{order.fulfillment === 'pickup' ? 'Hämtning: 0 kr' : formatSek(order.delivery_fee_ore)}</strong>
      {!!order.price_adjustment_ore && <><span>Godkänd prisjustering</span><strong>{formatSek(order.price_adjustment_ore)}</strong></>}
      <span className="total">Totalt</span><strong className="total">{formatSek(order.total_ore)}</strong>
      <span>Per person ({order.guests})</span><strong>{formatSek(Math.round(order.total_ore / order.guests))}</strong></div>
    <p className="field-hint">Pris per person är en jämförelse för hela beställningen.</p>
    {order.proposal && <section className="proposal-panel" aria-labelledby="proposal-title"><h3 id="proposal-title">Köket föreslår en ändring</h3>
      <p>{order.proposal.message}</p><p>Nuvarande totalpris: {formatSek(order.total_ore)}<br/><strong className="total">Nytt totalpris: {formatSek(order.proposal.total_ore)}</strong></p>
      <label className="checkbox-label"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)}/><span>Jag godkänner ändringarna och det nya totalpriset {formatSek(order.proposal.total_ore)}.</span></label>
      <div className="form-actions"><button className="btn btn-primary" type="button" disabled={!accepted || busy} onClick={() => update(true)}>{busy ? 'Sparar…' : 'Godkänn ändringen'}</button></div>
      <p className="field-hint">Betalning öppnas efter att du har godkänt. Kontakta oss om du vill ändra eller avstå.</p>
    </section>}
    {!order.proposal && checkout && <div className="form-actions"><a href={checkout} className="btn btn-primary" rel="noopener noreferrer">Betala säkert →</a></div>}
    {order.payment_preference === 'cash' && order.payment_status !== 'paid' && order.status === 'approved' && <p className="approval-note"><ShieldCheck size={20}/>Betala kontant vid överenskommen hämtning. Köket bekräftar betalningen när pengarna tagits emot.</p>}
    {['new', 'reviewing'].includes(order.status) && <p className="approval-note"><ShieldCheck size={20}/>Din förfrågan granskas av köket. Den är ännu inte bokad eller betald.</p>}
    {message && <p role="status" className="form-success">{message}</p>}{error && <p role="alert" className="form-error">{error}</p>}
    <div className="form-actions"><button type="button" className="btn" disabled={busy} onClick={() => update()}>{busy ? 'Uppdaterar…' : 'Uppdatera status'}</button></div>
    <p className="admin-note">Frågor om din förfrågan? Svara på bekräftelsemejlet.</p>
  </div><aside className="form-sidebar"><span className="eyebrow">FRÅN FÖRFRÅGAN TILL MAT</span><h3>Följ din beställning</h3>
    <ol className="status-timeline">{labels.map((label, index) => { const reached = index + 1 <= current && (index !== 4 || order.payment_status === 'paid');
      return <li key={label} className={reached ? 'reached' : ''} aria-current={index + 1 === current ? 'step' : undefined}><span>{reached ? <Check size={13}/> : index + 1}</span>{label}</li>;
    })}</ol><p className="field-hint">Orderstatus och betalningsstatus uppdateras separat. En återkomst från betalsidan är inte en betalningsbekräftelse.</p>
  </aside></div>;
}
