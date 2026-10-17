'use client';
import { useState } from 'react';
import type { CateringOrder } from '@/types/domain';
import { canTransition, formatSek, paymentLabels, paymentStatusLabels, statusLabels } from '@/lib/domain';

export function AdminOrders({ initialOrders }: { initialOrders:CateringOrder[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<Record<string,string>>({});
  const [error, setError] = useState('');

  async function action(order: CateringOrder, operation: string) {
    const description = operation === 'cash_paid' ? 'Kontrollera att pengarna verkligen är mottagna innan du fortsätter.' : operation === 'refund' ? 'Återbetala hela beloppet via Stripe?' : '';
    if (description && !window.confirm(description)) return;
    setBusy(order.id); setError('');
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:operation, admin_note:note[order.id] || '' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Åtgärden misslyckades');
      setOrders(items => items.map(item => item.id === order.id ? {...data.order,order_items:item.order_items} : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ett fel inträffade.'); }
    finally { setBusy(''); }
  }

  return <div className="admin-panel"><h2>Beställningar</h2><p className="admin-note">Endast administratörer kan se personuppgifter. Kontant beställning registreras aldrig som betald automatiskt.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!orders.length && <p>Inga beställningar ännu.</p>}
    {orders.map(order => <article key={order.id} style={{padding:'24px 0',borderBottom:'1px solid #ddd'}}>
      <div className="admin-top"><div><strong>#{order.code} · {order.menu_title}</strong><p className="admin-note">{order.full_name} · {order.email} · {order.phone}</p></div><div><span className="admin-pill">{statusLabels[order.status]}</span> <span className="admin-pill">{paymentStatusLabels[order.payment_status]}</span></div></div>
      <div className="admin-grid"><div><p>{order.guests} personer · {order.event_date} kl {order.event_time}<br/>{order.occasion} · {order.fulfillment === 'pickup'?'Hämtning':`Leverans: ${order.address}, ${order.postal_code} ${order.city}`}<br/>Betalsätt: <strong>{paymentLabels[order.payment_preference]}</strong><br/>Totalt: <strong>{formatSek(order.total_ore)}</strong></p><p>{order.notes}</p></div><div><div className="field"><label htmlFor={`note-${order.id}`}>Meddelande till kunden</label><textarea id={`note-${order.id}`} value={note[order.id]??order.admin_note??''} onChange={event=>setNote(prev=>({...prev,[order.id]:event.target.value}))}/></div></div></div>
      {!!order.order_items?.length ? <ul>{order.order_items.map((line,index)=><li key={index}>{line.quantity} × {line.title} · {formatSek(line.unit_price_ore)} / {line.unit_label||'st'} · {formatSek(line.total_ore)}</li>)}</ul> : !!order.items_snapshot?.length && <ul>{order.items_snapshot.map((line,index)=><li key={index}>{line.quantity} × {line.title} · {formatSek(line.unit_price_ore)} / {line.unit_label} · {formatSek(line.line_total_ore)}</li>)}</ul>}
      {order.checkout_url && <p><a className="text-link" href={order.checkout_url} rel="noreferrer" target="_blank">Kundens betalningslänk ↗</a></p>}
      <div className="admin-actions">{(['approve','request_changes','reject','preparing','ready','complete','cash_paid','refund','payment_link'] as const).filter(op => {
        if (op==='refund')return order.payment_preference!=='cash'&&order.payment_status==='paid';
        if (op==='payment_link')return order.payment_preference!=='cash'&&['approved','preparing','ready'].includes(order.status)&&!['paid','refunded'].includes(order.payment_status);
        return canTransition(order.status,op,order.payment_status,order.payment_preference);
      }).map(op => <button key={op} className={`btn ${op==='approve'||op==='cash_paid'?'btn-primary':''}`} type="button" disabled={busy===order.id} onClick={()=>action(order,op)}>{({approve:'Godkänn',request_changes:'Begär ändring',reject:'Neka',preparing:'Under förberedelse',ready:'Markera klar',complete:'Slutförd',cash_paid:'Kontanter mottagna',refund:'Återbetala',payment_link:'Ny betalningslänk'} as const)[op]}</button>)}</div>
    </article>)}
  </div>;
}
