'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CateringOrder } from '@/types/domain';
import { canTransition, formatSek, occasions, paymentMethodLabel, paymentStatusLabels, safeExternalUrl, statusLabels } from '@/lib/domain';
import { formatScheduledTime } from '@yehabibi/shared';

const actions = {
  review: 'Granska', approve: 'Godkänn', request_changes: 'Föreslå ändring', reject: 'Neka',
  preparing: 'Förbered', ready: 'Klar för hämtning', dispatched: 'På väg', complete: 'Slutför',
  cash_paid: 'Kontanter mottagna', refund: 'Begär återbetalning', payment_link: 'Skicka betalningsbegäran', cancel: 'Avbryt',
  resend_notifications: 'Skicka uppdatering igen'
};
const packingLabels={packages:'Rätt antal paket',extras:'Rätt tillbehör',sauces_bread:'Såser och bröd',allergen_labels:'Allergen- och specialmärkning',order_number:'Rätt ordernummer'};
type Packing=Record<keyof typeof packingLabels,boolean>;

export function AdminOrders({ initialOrders, filters = {}, totalCount = initialOrders.length }: {
  initialOrders: CateringOrder[]; filters?: { search?: string; status?: string; payment?: string; order_type?: string; view?:string }; totalCount?: number;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<Record<string, string>>({});
  const [proposedPrice, setProposedPrice] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [packing,setPacking]=useState<Record<string,Packing>>({});
  const [issues,setIssues]=useState<Record<string,string>>({});
  const [kitchenNotes,setKitchenNotes]=useState<Record<string,string>>({});
  useEffect(()=>setOrders(initialOrders),[initialOrders]);

  async function action(order: CateringOrder, operation: string, extra:Record<string,unknown>={}) {
    if(busy)return;
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
        body: JSON.stringify({ action: operation, admin_note: message, proposed_total_ore: operation === 'request_changes' ? proposedOre : undefined,...extra }) });
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
      <input type="hidden" name="view" value={filters.view||'all'}/>
      <div className="field"><label htmlFor="order-search">Sök kund eller order</label><input id="order-search" name="search" type="search" defaultValue={filters.search || ''} placeholder="Namn, e-post eller ordernummer"/></div>
      <div className="field"><label htmlFor="order-type">Beställningsläge</label><select id="order-type" name="order_type" defaultValue={filters.order_type || ''}><option value="">Alla beställningar</option><option value="direct">Direktbeställningar</option><option value="catering">Cateringbeställningar</option></select></div>
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
      const scheduledTime = order.order_type === 'direct' ? formatScheduledTime(order.scheduled_at) : '';
      const checks=packing[order.id]||Object.fromEntries(Object.keys(packingLabels).map(key=>[key,order.packing_checklist?.[key as keyof Packing]===true])) as Packing;
      const allPacked=Object.values(order.packing_checklist||{}).length===5&&Object.values(order.packing_checklist||{}).every(Boolean);
      return <article key={order.id} className={`admin-order ${order.kitchen_issue||order.capacity_status==='review'?'kitchen-issue':''}`}>
        <div className="admin-top"><div><span className="admin-pill">{order.order_type === 'direct' ? 'Direktbeställning' : 'Catering'}</span><br/><strong>#{order.code} · {order.menu_title}</strong><p className="admin-note">{order.full_name} · {order.order_type === 'direct' ? `${order.package_quantity || 1} paket · ` : ''}{order.guests} personer · {scheduledTime || `${order.event_date} kl ${order.event_time}`}</p></div>
          <div><span className="admin-pill">{statusLabels[order.status]}</span> <span className="admin-pill">{paymentStatusLabels[order.payment_status]}</span></div></div>
        <div className="kitchen-timing"><div><span>Börja förbereda</span><strong>{formatScheduledTime(order.preparation_starts_at)||'Planeras vid godkännande / äldre order'}</strong></div><div><span>Kundens bekräftade tid</span><strong>{scheduledTime||`${order.event_date} kl ${order.event_time}`}</strong></div><div><span>Mottagning</span><strong>{order.acknowledged_at?'Kvitterad av köket':'Behöver kvitteras'}</strong></div></div>
        {!order.acknowledged_at&&!['completed','rejected','cancelled'].includes(order.status)&&<button className="btn btn-primary" type="button" disabled={!!busy} onClick={()=>action(order,'acknowledge')}>Kvittera mottagen order</button>}
        {order.capacity_status==='review'&&<p className="form-error" role="alert">Kapaciteten behöver granskas. Kontakta kunden för ny tid eller verifierad återbetalning. Ändra inte kundens bekräftade tid tyst.</p>}
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
        <div><strong>Mat och mängder</strong>{order.order_items?.length ? <ul className="kitchen-lines">{order.order_items.map((line, index) => <li key={index}>{line.quantity} × {line.title} · {formatSek(line.unit_price_ore)} / {line.unit_label || 'st'} · {formatSek(line.total_ore)}</li>)}</ul>
          : <ul className="kitchen-lines">{order.items_snapshot?.map((line, index) => <li key={index}>{line.quantity} × {line.title} · {formatSek(line.unit_price_ore)} / {line.unit_label} · {formatSek(line.line_total_ore)}</li>)}</ul>}</div>
        <fieldset className="kitchen-packing" disabled={!!busy||!['approved','preparing','ready'].includes(order.status)}><legend>Packkontroll {allPacked?'· sparad och klar':''}</legend>
          {Object.entries(packingLabels).map(([key,label])=><label key={key} className="checkbox-label"><input type="checkbox" checked={checks[key as keyof Packing]} onChange={event=>setPacking(old=>({...old,[order.id]:{...checks,[key]:event.target.checked}}))}/>{label}</label>)}
          <button type="button" className="btn" onClick={()=>action(order,'packing',{packing_checklist:checks})}>Spara packkontroll</button>
          <p className="field-hint">Spara alla fem kontroller före Klar för hämtning eller På väg. Kontrollera märkningen mot ordern och kökets godkända allergeninformation.</p>
        </fieldset>
        <details><summary>Problem och interna köksanteckningar</summary><div className="field"><label htmlFor={`issue-${order.id}`}>Avvikelse</label><select id={`issue-${order.id}`} value={issues[order.id]??order.kitchen_issue??''} onChange={event=>setIssues(old=>({...old,[order.id]:event.target.value}))}><option value="">Ingen öppen avvikelse</option><option value="no_show">Kunden har inte hämtat</option><option value="delivery_delayed">Leveransen är försenad</option><option value="other">Annan avvikelse</option></select></div>
          <div className="field"><label htmlFor={`kitchen-note-${order.id}`}>Intern anteckning</label><textarea id={`kitchen-note-${order.id}`} maxLength={1000} value={kitchenNotes[order.id]??order.kitchen_note??''} onChange={event=>setKitchenNotes(old=>({...old,[order.id]:event.target.value}))}/></div>
          <button type="button" className="btn" disabled={!!busy} onClick={()=>action(order,'issue',{kitchen_issue:(issues[order.id]??order.kitchen_issue)||null,kitchen_note:kitchenNotes[order.id]??order.kitchen_note??''})}>Spara avvikelse</button><p className="field-hint">Interna anteckningar visas endast för köket. Använd Meddelande till kunden för ett tydligt kundbesked.</p>
        </details>
        <p><Link className="text-link" href={`/admin/orders/${order.id}/print`} target="_blank">Öppna order för utskrift ↗</Link></p>
        {checkout && <p><a className="text-link" href={checkout} rel="noopener noreferrer" target="_blank">Öppna kundens betalningslänk ↗</a></p>}
        <div className="admin-actions">{Object.entries(actions).filter(([operation]) => {
          if (operation === 'resend_notifications') return true;
          if (order.payment_review_required && !(operation==='refund'&&order.payment_review_reason==='capacity_unavailable_after_payment')) return false;
          if (order.payment_refund_status && ['preparing', 'ready', 'dispatched', 'complete'].includes(operation)) return false;
          if (operation === 'refund') return Boolean(order.payment_provider && order.provider_payment_id) && order.payment_preference !== 'cash' && order.payment_status === 'paid' && !order.payment_refund_status;
          if (operation === 'payment_link') return order.payment_preference !== 'cash' && !order.proposal && order.status === 'approved' && !['paid', 'refunded'].includes(order.payment_status);
          if (operation === 'ready' && order.fulfillment !== 'pickup') return false;
          if (operation === 'dispatched' && order.fulfillment !== 'delivery') return false;
          if (['ready','dispatched','complete'].includes(operation)&&!allPacked) return false;
          if (operation==='cancel'&&order.payment_status==='refunded')return ['new','reviewing','changes_requested','approved'].includes(order.status);
          return canTransition(order.status, operation, order.payment_status, order.payment_preference,order.capacity_status);
        }).map(([operation, label]) => <button key={operation} className={`btn ${operation === 'approve' || operation === 'cash_paid' ? 'btn-primary' : ''}`} type="button" disabled={!!busy} onClick={() => action(order, operation)}>{busy === order.id ? 'Arbetar…' : operation === 'refund' && order.payment_provider === 'local_test' ? 'Simulera återbetalning' : label}</button>)}</div>
      </article>;
    })}
  </div>;
}


