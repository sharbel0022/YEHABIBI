'use client';

import { useState } from 'react';
import type { CateringOrder } from '@/types/domain';
import { canTransition, formatSek, occasions, paymentMethodLabel, paymentStatusLabels, safeExternalUrl, statusLabels } from '@/lib/domain';

const actions = {
  review: 'Granska', approve: 'Godkänn', request_changes: 'Föreslå ändring', reject: 'Neka',
  preparing: 'Förbered', ready: 'Klar för hämtning', dispatched: 'På väg', complete: 'Slutför',
  cash_paid: 'Kontanter mottagna', refund: 'Begär återbetalning', payment_link: 'Skicka betalningsbegäran', cancel: 'Avbryt',
  resend_notifications: 'Skicka uppdatering igen'
};

export function AdminOrders({ initialOrders, filters = {}, totalCount = initialOrders.length }: {
  initialOrders: CateringOrder[]; filters?: { search?: string; status?: string; payment?: string }; totalCount?: number;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<Record<string, string>>({});
  const [proposedPrice, setProposedPrice] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function action(order: CateringOrder, operation: string) {
    const message = note[order.id] ?? order.admin_note ?? '';
    const amount = proposedPrice[order.id]?.trim();
    if (operation === 'request_changes' && !message.trim()) return setError('Beskriv ändringen för kunden innan du skickar förslaget.');
    const proposedOre = amount ? Math.round(Number(amount.replace(',', '.')) * 100) : undefined;
    if (operation === 'request_changes' && amount && (!Number.isSafeInteger(proposedOre) || proposedOre! <= 0)) return setError('Ange ett giltigt nytt totalpris i kronor.');
    const confirmation = operation === 'cash_paid' ? 'Bekräfta att du har tagit emot hela kontantbeloppet.' : operation === 'refund'
      ? order.payment_provider === 'local_test' ? 'Simulera återbetalning av hela testbeloppet? Inga riktiga pengar används.'
        : 'Begär återbetalning av hela beloppet via betalleverantören? Status ändras först när leverantören bekräftar.' : '';
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(order.id); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: operation, admin_note: message, proposed_total_ore: operation === 'request_changes' ? proposedOre : undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Åtgärden misslyckades.');
      setOrders(items => items.map(item => item.id === order.id ? { ...data.order, order_items: item.order_items } : item));
      setMessage(typeof data.message === 'string' ? data.message : `Beställning ${order.code} har uppdaterats.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ett fel inträffade.'); }
    finally { setBusy(''); }
  }

  return <div className="admin-panel"><h2>Beställningar</h2>
    <p className="admin-note">Granska först. Kunden behöver godkänna ett ändrat pris innan betalning öppnas. Kontanter registreras när pengarna har tagits emot.</p>
    <form className="admin-filters" method="get" action="/admin/orders">
      <div className="field"><label htmlFor="order-search">Sök kund eller order</label><input id="order-search" name="search" type="search" defaultValue={filters.search || ''} placeholder="Namn, e-post eller ordernummer"/></div>
      <div className="field"><label htmlFor="order-status">Orderstatus</label><select id="order-status" name="status" defaultValue={filters.status || 'alla'}><option value="alla">Alla statusar</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="field"><label htmlFor="order-payment">Betalning</label><select id="order-payment" name="payment" defaultValue={filters.payment || 'alla'}><option value="alla">Alla betalningar</option>{Object.entries(paymentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <button type="submit" className="btn btn-primary">Filtrera alla beställningar</button>
    </form>
    <p className="admin-note" role="status">{totalCount} beställningar matchar. Visar {orders.length} på den här sidan.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-success" role="status">{message}</p>}
    {!orders.length && <p className="empty-state">Inga beställningar matchar. Nya förfrågningar visas här när de kommer in.</p>}
    {orders.map(order => {
      const checkout = order.payment_provider && !order.payment_review_required ? safeExternalUrl(order.checkout_url) : null;
      const canPropose = canTransition(order.status, 'request_changes', order.payment_status, order.payment_preference);
      return <article key={order.id} className="admin-order">
        <div className="admin-top"><div><strong>#{order.code} · {order.menu_title}</strong><p className="admin-note">{order.full_name} · {order.guests} personer · {order.event_date} kl {order.event_time}</p></div>
          <div><span className="admin-pill">{statusLabels[order.status]}</span> <span className="admin-pill">{paymentStatusLabels[order.payment_status]}</span></div></div>
        <div className="admin-grid"><div><p>{occasions[order.occasion]} · {order.fulfillment === 'pickup' ? 'Hämtning' : `Leverans: ${order.address}, ${order.postal_code} ${order.city}`}<br/>
          <a href={`mailto:${order.email}`}>{order.email}</a> · <a href={`tel:${order.phone}`}>{order.phone}</a><br/>{paymentMethodLabel(order.payment_preference, order.payment_provider === 'local_test')} · <strong>{formatSek(order.total_ore)}</strong></p>
          {!!order.price_adjustment_ore && <p className="admin-note">Godkänd prisjustering: {formatSek(order.price_adjustment_ore)}</p>}
          <p className="admin-note">Betalleverantör: {order.payment_provider || 'Ingen aktiv betalning'}<br/>
            Transaktionsreferens: {order.payment_transaction_reference || order.provider_payment_id || 'Inväntar leverantören'}</p>
          {order.payment_review_required && <p className="form-error" role="alert">Betalningen kräver utredning. Kontakta leverantören och kunden före fler betalningsåtgärder. {order.payment_review_reason}</p>}
          {order.payment_refund_status === 'pending' && <p className="preview-note">Återbetalning begärd. Väntar på leverantörens bekräftelse.</p>}
          {order.payment_refund_status === 'needs_review' && <p className="form-error">Återbetalningen behöver utredas. Kontrollera transaktionen hos leverantören.</p>}
          {order.notes && <p><strong>Önskemål:</strong> {order.notes}</p>}
        </div><div><div className="field"><label htmlFor={`note-${order.id}`}>Meddelande till kunden</label><textarea id={`note-${order.id}`} maxLength={1000} value={note[order.id] ?? order.admin_note ?? ''} onChange={event => setNote(old => ({ ...old, [order.id]: event.target.value }))}/></div>
          {canPropose && <div className="field"><label htmlFor={`price-${order.id}`}>Föreslå nytt totalpris (kr, frivilligt)</label><input id={`price-${order.id}`} inputMode="decimal" value={proposedPrice[order.id] || ''} onChange={event => setProposedPrice(old => ({ ...old, [order.id]: event.target.value }))} placeholder={String(order.total_ore / 100)}/>
            <small className="field-hint">Skriv vad som ändras i meddelandet. Originalraderna bevaras och kunden får godkänna det nya totalpriset.</small></div>}
        </div></div>
        <details><summary>Visa beställda rätter</summary>{order.order_items?.length ? <ul>{order.order_items.map((line, index) => <li key={index}>{line.quantity} × {line.title} · {formatSek(line.unit_price_ore)} / {line.unit_label || 'st'} · {formatSek(line.total_ore)}</li>)}</ul>
          : <ul>{order.items_snapshot?.map((line, index) => <li key={index}>{line.quantity} × {line.title} · {formatSek(line.unit_price_ore)} / {line.unit_label} · {formatSek(line.line_total_ore)}</li>)}</ul>}</details>
        {checkout && <p><a className="text-link" href={checkout} rel="noopener noreferrer" target="_blank">Öppna kundens betalningslänk ↗</a></p>}
        <div className="admin-actions">{Object.entries(actions).filter(([operation]) => {
          if (operation === 'resend_notifications') return true;
          if (order.payment_review_required) return false;
          if (order.payment_refund_status && ['preparing', 'ready', 'dispatched', 'complete'].includes(operation)) return false;
          if (operation === 'refund') return Boolean(order.payment_provider && order.provider_payment_id) && order.payment_preference !== 'cash' && order.payment_status === 'paid' && !order.payment_refund_status;
          if (operation === 'payment_link') return order.payment_preference !== 'cash' && !order.proposal && order.status === 'approved' && !['paid', 'refunded'].includes(order.payment_status);
          if (operation === 'ready' && order.fulfillment !== 'pickup') return false;
          if (operation === 'dispatched' && order.fulfillment !== 'delivery') return false;
          return canTransition(order.status, operation, order.payment_status, order.payment_preference);
        }).map(([operation, label]) => <button key={operation} className={`btn ${operation === 'approve' || operation === 'cash_paid' ? 'btn-primary' : ''}`} type="button" disabled={!!busy} onClick={() => action(order, operation)}>{busy === order.id ? 'Arbetar…' : operation === 'refund' && order.payment_provider === 'local_test' ? 'Simulera återbetalning' : label}</button>)}</div>
      </article>;
    })}
  </div>;
}
