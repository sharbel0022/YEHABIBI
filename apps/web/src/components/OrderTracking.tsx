'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import type { Catalog, OnlinePaymentMethod, PublicOrder } from '@yehabibi/shared';
import { formatSek, paymentLabels, paymentStatusLabels, safeExternalUrl, statusLabels } from '@/lib/domain';
import { api } from '@/lib/api-client';
import { canPayOrder, orderPaymentMethods, orderProgress, orderTimelineLabels } from '@yehabibi/shared';
import { usePaymentMethods } from '@/components/use-payment-methods';

/** Endast kundens token-skyddade publika ordervy skickas till webbläsaren. */
export function OrderTracking({ initialOrder, token }: { initialOrder: PublicOrder; token: string }) {
  const [order, setOrder] = useState(initialOrder);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<OnlinePaymentMethod | ''>('');
  const [statusVerified, setStatusVerified] = useState(false);
  const inFlight = useRef(false);
  const deviceMethods = usePaymentMethods(catalog?.demo ? [] : catalog?.payment_methods || []);
  const methods = orderPaymentMethods(deviceMethods, order);
  const paymentMethod = methods.find(method => method === selectedMethod) ||
    methods.find(method => method === order.payment_preference) || methods[0];
  const canPay = statusVerified && canPayOrder(order);
  const current = orderProgress(order);
  const labels = orderTimelineLabels(order);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [result, nextCatalog] = await Promise.all([
        api.getPaymentStatus({ code: initialOrder.code, token }), api.getCatalog(),
      ]);
      setOrder(result.order); setCatalog(nextCatalog); setStatusVerified(true); setError('');
    } catch (reason) {
      setStatusVerified(false); setCatalog(null);
      setError(reason instanceof Error ? reason.message : 'Statusen kunde inte verifieras. Uppdatera igen.');
    } finally { inFlight.current = false; }
  }, [initialOrder.code, token]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 15000);
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [refresh]);

  async function pay() {
    if (busy || inFlight.current || !canPay || !paymentMethod) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const session = await api.createPayment({ code: order.code, token }, paymentMethod);
      const url = safeExternalUrl(session.checkout_url);
      if (!url) throw new Error('Betalningslänken kunde inte verifieras. Kontakta köket.');
      window.location.assign(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Betalningen kunde inte öppnas.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function update(accept = false) {
    if (busy || inFlight.current || (accept && (!accepted || !order.proposal))) return;
    inFlight.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const reference = { code: order.code, token };
      const result = accept ? await api.acceptPriceChange(reference, order.proposal!.revision)
        : await api.getPaymentStatus(reference);
      setOrder(result.order); setAccepted(false);
      setMessage(accept ? 'Ändringen är godkänd. Betalningsinformationen är uppdaterad.' : 'Statusen är uppdaterad.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Försök igen senare.'); }
    finally { inFlight.current = false; setBusy(false); void refresh(); }
  }

  return <div className="form-layout"><div className="order-panel">
    <span className="admin-pill">{order.status === 'approved' && order.payment_status === 'pending' ? 'Väntar på betalning' : statusLabels[order.status]}</span>
    <h2>{order.menu_title}</h2><p>{order.guests} personer · {order.event_date}, kl {order.event_time}<br/>{order.fulfillment === 'pickup' ? 'Hämtning' : 'Hemleverans'}</p>
    <p className="admin-note">Betalning: <strong>{paymentStatusLabels[order.payment_status]}</strong> · {paymentLabels[order.payment_preference]}</p>
    {order.payment_review_required && <p className="form-error" role="alert">{order.payment_refund_status === 'needs_review' ? 'Återbetalningen behöver kontrolleras av köket.' : 'Betalningen behöver kontrolleras av köket.'} Kontakta oss innan du betalar igen.</p>}
    {order.payment_transaction_reference && <p className="field-hint">Transaktionsreferens: {order.payment_transaction_reference}</p>}
    {order.payment_refund_status === 'pending' && <p className="preview-note">Återbetalning begärd. Vi väntar på leverantörens bekräftelse.</p>}
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
    {canPay && methods.length > 0 && <section aria-labelledby="payment-title"><h3 id="payment-title">{order.payment_provider ? 'Fortsätt din betalning' : 'Välj betalningssätt'}</h3>
      <p className="field-hint">Godkänt totalbelopp: {formatSek(order.total_ore)}. Betalningen genomförs på leverantörens säkra sida.</p>
      <div className="form-choice">{methods.map(method => <label className="choice" key={method}>
        <input type="radio" name="approved-payment" checked={paymentMethod === method} disabled={busy}
          onChange={() => setSelectedMethod(method)}/>{paymentLabels[method]}</label>)}</div>
      {order.payment_provider && <p className="field-hint">Det påbörjade betalningsförsöket använder samma metod. Kontakta köket om du behöver ändra.</p>}
      <div className="form-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void pay()}>{busy ? 'Öppnar…' : 'Betala säkert →'}</button></div>
    </section>}
    {canPay && !methods.length && <p className="preview-note">{catalog?.payment_unavailable_reason || 'Onlinebetalning är ännu inte aktiverad för din enhet. Kontakta köket om betalning.'}</p>}
    {order.payment_status === 'pending' && <p className="field-hint">Väntar på verifierad betalningsbekräftelse. Att återvända från betalsidan är inget kvitto.</p>}
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
