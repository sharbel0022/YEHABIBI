'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Clock3, Minus, Plus } from 'lucide-react';
import { availablePaymentMethods, type AvailabilityResponse, type Catalog, type Fulfillment, type OrderReceipt, type PaymentPreference } from '@yehabibi/shared';
import { formatSek, paymentMethodLabel } from '@/lib/domain';
import { api } from '@/lib/api-client';
import { useCatalog } from '@/components/use-catalog';
import { CatalogRefresh } from '@/components/CatalogRefresh';
import { usePaymentMethods } from '@/components/use-payment-methods';

type SubmittedOrder = { receipt: OrderReceipt; title: string; quantity: number; time: string; total: number; fulfillment: Fulfillment };

export function DirectOrderForm({ initialCatalog, initialMenu, initialQuantity }: {
  initialCatalog: Catalog; initialMenu?: string; initialQuantity?: string;
}) {
  const { catalog, ...refreshState } = useCatalog(initialCatalog);
  const menus = catalog.menus.filter(menu => menu.active && menu.direct_order_enabled && menu.price_ore > 0);
  const [menuId, setMenuId] = useState(initialMenu || menus[0]?.id || '');
  const menu = menus.find(item => item.id === menuId);
  const [quantity, setQuantity] = useState(() => Math.max(1, Math.min(100, Math.floor(Number(initialQuantity)) || 1)));
  const [fulfillment, setFulfillment] = useState<Fulfillment>(catalog.settings.pickup_enabled ? 'pickup' : 'delivery');
  const [contact, setContact] = useState({ address: '', postal_code: '', city: catalog.settings.location_city,
    full_name: '', email: '', phone: '', notes: '', website: '' });
  const [terms, setTerms] = useState(false);
  const [preference, setPreference] = useState<PaymentPreference>('unpaid');
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [availabilityKey, setAvailabilityKey] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [availabilityError, setAvailabilityError] = useState('');
  const [submitted, setSubmitted] = useState<SubmittedOrder | null>(null);
  const requestSequence = useRef(0);
  const orderRequest = useRef<{ fingerprint: string; id: string } | null>(null);
  const deviceMethods = usePaymentMethods(catalog.payment_methods, catalog.test_mode === true);
  const methods = availablePaymentMethods(catalog, fulfillment).filter(value => value === 'cash' || value === 'unpaid' || deviceMethods.includes(value));
  const payment = methods.includes(preference) ? preference : methods[0];
  const postal = contact.postal_code.replace(/\s/g, '');
  const selectionKey = `${menu?.id || ''}:${quantity}:${fulfillment}:${fulfillment === 'delivery' ? postal : ''}`;
  const currentAvailability = availabilityKey === selectionKey ? availability : null;
  const selectedSlot = currentAvailability?.slots.find(slot => slot.starts_at === selectedTime);
  const ready = catalog.orders_enabled && catalog.direct_orders_enabled === true && !catalog.demo;
  const setField = (key: keyof typeof contact, value: string) => setContact(old => ({ ...old, [key]: value }));

  const checkAvailability = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setAvailabilityError('');
    if (submitted || !menu || !ready || fulfillment === 'delivery' && !/^\d{5}$/.test(postal)) {
      setChecking(false); return;
    }
    setChecking(true);
    try {
      const result = await api.getAvailability({ menu_id: menu.id, quantity, fulfillment,
        ...(fulfillment === 'delivery' ? { postal_code: postal } : {}) });
      if (sequence !== requestSequence.current) return;
      setAvailability(result); setAvailabilityKey(selectionKey);
      setSelectedTime(old => result.slots.some(slot => slot.starts_at === old) ? old : '');
    } catch (reason) {
      if (sequence !== requestSequence.current) return;
      setAvailability(null); setAvailabilityKey('');
      setAvailabilityError(reason instanceof Error ? reason.message : 'Tiderna kunde inte hämtas. Försök igen.');
    } finally { if (sequence === requestSequence.current) setChecking(false); }
  }, [menu?.id, quantity, fulfillment, postal, selectionKey, ready, submitted]);

  useEffect(() => {
    if (submitted) return;
    const timeout = window.setTimeout(() => { void checkAvailability(); }, 300);
    const refresh = window.setInterval(() => { if (document.visibilityState === 'visible') void checkAvailability(); }, 30000);
    return () => { window.clearTimeout(timeout); window.clearInterval(refresh); requestSequence.current += 1; };
  }, [checkAvailability, submitted]);

  async function requestIdFor(payload: object) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    try {
      const saved = JSON.parse(sessionStorage.getItem('yehabibi-direct-request-v4-4') || 'null');
      if (saved?.fingerprint === fingerprint && typeof saved.id === 'string' && /^[a-f0-9-]{36}$/i.test(saved.id)) orderRequest.current = saved;
    } catch { /* Återförsök fungerar även när lagring är blockerad. */ }
    if (orderRequest.current?.fingerprint !== fingerprint) orderRequest.current = { fingerprint, id: crypto.randomUUID() };
    try { sessionStorage.setItem('yehabibi-direct-request-v4-4', JSON.stringify(orderRequest.current)); } catch { /* Behåll minneskopian. */ }
    return orderRequest.current.id;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending) return; setError('');
    if (!ready) return setError('Direktbeställningar är ännu inte öppna.');
    if (!menu || !currentAvailability?.enabled || !selectedSlot || !payment || checking) return setError('Kontrollera tillgängligheten och välj en ledig tid först.');
    if (!terms) return setError('Godkänn villkoren innan du skickar.');
    const payload = { ...contact, menu_id: menu.id, quantity, fulfillment, scheduled_at: selectedSlot.starts_at,
      expected_total_ore: currentAvailability.total_ore, payment_preference: payment, terms_accepted: true as const,
      ...(currentAvailability.delivery_zone_id ? { delivery_zone_id: currentAvailability.delivery_zone_id } : {}) };
    setSending(true);
    try {
      const request_id = await requestIdFor(payload);
      const result = await api.createDirectOrder({ ...payload, request_id });
      setSubmitted({ receipt: result, title: menu.title, quantity, time: selectedSlot.label, total: currentAvailability.total_ore, fulfillment });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Beställningen kunde inte sparas. Försök igen.');
      void checkAvailability();
    } finally { setSending(false); }
  }

  if (submitted) return <div className="order-panel form-success" role="status"><Check size={32}/><h2>Din beställning är mottagen.</h2>
    <p>Ordernummer: <strong>{submitted.receipt.code}</strong></p><p>{submitted.quantity} × {submitted.title}<br/>{submitted.time} · {submitted.fulfillment === 'pickup' ? 'Hämtning' : 'Hemleverans'}<br/><strong>{formatSek(submitted.total)}</strong></p>
    <p>{catalog.test_mode ? 'Testbeställningen har sparats. Inga pengar har dragits.' : 'Du kan följa kökets besked och betalningsstatus på ordersidan.'}</p>
    <a className="btn btn-primary" href={submitted.receipt.tracking_url}>Följ ordern och {catalog.test_mode ? 'simulera betalning' : 'visa betalning'} →</a></div>;

  return <><CatalogRefresh {...refreshState}/>
    {catalog.test_mode && <p className="preview-note">Testläge. Använd testuppgifter. Swish, Apple Pay, Google Pay och kort simuleras utan riktiga pengar.</p>}
    {!ready && <p className="preview-note">Direktbeställningar öppnar när köket har godkänt företagsmiljön och aktiverat tjänsten. {catalog.demo ? 'Du ser en förhandsvisning.' : 'Du kan fortfarande kontakta oss om catering.'}</p>}
    {!menus.length ? <p className="empty-state">Inga färdiga paket är publicerade för direktbeställning ännu. <Link href="/bestall" className="text-link">Boka catering</Link></p> :
      <form onSubmit={submit} className="direct-form"><div className="direct-summary" aria-live="polite">
        <div><small>Aktuell totalsumma</small><strong>{currentAvailability ? formatSek(currentAvailability.total_ore) : menu ? formatSek(menu.price_ore * quantity) : '–'}</strong>{!currentAvailability && <small>{fulfillment === 'delivery' ? 'Matpris · leveransavgift kontrolleras' : 'Matpris · kontrolleras av köket'}</small>}</div>
        <div><small>Vald tid · Stockholm</small><strong>{selectedSlot?.label || 'Välj en ledig tid'}</strong></div>
      </div><div className="form-layout"><div className="order-panel"><fieldset disabled={sending} className="plain-fieldset">
        <span className="eyebrow">DITT MATPAKET</span><h2>Vad är du sugen på?</h2>
        <div className="field"><label htmlFor="direct-menu">Färdigt paket</label><select id="direct-menu" required value={menu?.id || ''} onChange={event => setMenuId(event.target.value)}><option value="">Välj ett tillgängligt paket</option>{menus.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{!menu && <p className="form-error" role="alert">Det valda paketet är inte tillgängligt. Välj ett publicerat paket för att fortsätta.</p>}</div>
        {menu && <><p>{menu.description}</p><p className="field-hint">{menu.included.join(', ')}<br/>Allergener: {menu.allergens.join(', ') || 'Kontakta köket'}<br/>{menu.package_portions || 1} portioner per paket · från {menu.preparation_minutes ?? 30} min förberedelse.</p></>}
        <div className="direct-quantity"><span>Antal paket</span><div className="quantity-stepper"><button type="button" aria-label="Färre paket" disabled={quantity <= 1} onClick={() => setQuantity(value => value - 1)}><Minus size={17}/></button><output aria-live="polite">{quantity}</output><button type="button" aria-label="Fler paket" disabled={quantity >= 100} onClick={() => setQuantity(value => value + 1)}><Plus size={17}/></button></div></div>
        <h3>Hämtning eller hemleverans?</h3><div className="catalog-tabs" role="group" aria-label="Hämtning eller hemleverans">
          {catalog.settings.pickup_enabled && <button type="button" className={fulfillment === 'pickup' ? 'active' : ''} aria-pressed={fulfillment === 'pickup'} onClick={() => setFulfillment('pickup')}>Hämtning</button>}
          {catalog.settings.delivery_enabled && <button type="button" className={fulfillment === 'delivery' ? 'active' : ''} aria-pressed={fulfillment === 'delivery'} onClick={() => setFulfillment('delivery')}>Hemleverans</button>}
        </div>
        {fulfillment === 'pickup' ? <p className="preview-note"><strong>Hämtningsadress</strong><br/>{currentAvailability?.pickup_address || catalog.settings.pickup_address || 'Köket behöver publicera en hämtningsadress.'}<br/>Hämtning: 0 kr</p> : <>
          <div className="field"><label htmlFor="direct-address">Gata och nummer</label><input id="direct-address" required autoComplete="street-address" minLength={3} maxLength={220} value={contact.address} onChange={event => setField('address', event.target.value)}/></div>
          <div className="field-grid"><div className="field"><label htmlFor="direct-postal">Postnummer</label><input id="direct-postal" required inputMode="numeric" autoComplete="postal-code" maxLength={6} pattern="[0-9]{3} ?[0-9]{2}" value={contact.postal_code} onChange={event => setField('postal_code', event.target.value)} placeholder="722 12"/></div>
            <div className="field"><label htmlFor="direct-city">Ort</label><input id="direct-city" required autoComplete="address-level2" maxLength={100} value={contact.city} onChange={event => setField('city', event.target.value)}/></div></div>
          <p className="field-hint">{currentAvailability?.delivery_zone_id ? `Postnumret matchar en aktiv leveranszon. Leverans: ${formatSek(currentAvailability.delivery_fee_ore)}.` : 'Ange postnummer för att kontrollera aktiv leveranszon, avgift och lediga tider.'}</p>
        </>}
        <h3><Clock3 size={20} aria-hidden="true"/> Välj tid</h3>
        {checking && <p role="status">Kontrollerar kökets tider och kapacitet…</p>}
        {availabilityError && <p className="form-error" role="alert">{availabilityError}</p>}
        {currentAvailability?.reason && <p className="preview-note" role="status">{currentAvailability.reason}</p>}
        {currentAvailability && !currentAvailability.slots.length && <p className="preview-note">Inga lediga tider för ditt val just nu. Prova färre paket eller hämtning, eller kontakta köket.</p>}
        {fulfillment === 'delivery' && (availabilityError || currentAvailability && !currentAvailability.slots.length) && catalog.settings.pickup_enabled && <button type="button" className="btn" onClick={() => setFulfillment('pickup')}>Välj hämtning i stället</button>}
        {!!currentAvailability?.slots.length && <div className="field"><label htmlFor="direct-slot">Tillgängliga tider</label><select id="direct-slot" required disabled={checking} value={selectedSlot?.starts_at || ''} onChange={event => setSelectedTime(event.target.value)}><option value="">Välj tid</option>{currentAvailability.slots.map((slot, index) => <option key={slot.starts_at} value={slot.starts_at}>{index === 0 ? 'Tidigast: ' : ''}{slot.label}</option>)}</select></div>}
        <button type="button" className="text-link" disabled={checking || !ready} onClick={() => void checkAvailability()}>Uppdatera lediga tider</button>
        {currentAvailability && <p className="field-hint">Kontrollerat av servern: {new Intl.DateTimeFormat('sv-SE', { timeZone: currentAvailability.timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(currentAvailability.server_now))}. Tiden reserveras när beställningen sparas.</p>}
        <h3>Dina kontaktuppgifter</h3><div className="field"><label htmlFor="direct-name">Fullständigt namn</label><input id="direct-name" required minLength={2} maxLength={120} autoComplete="name" value={contact.full_name} onChange={event => setField('full_name', event.target.value)}/></div>
        <div className="field-grid"><div className="field"><label htmlFor="direct-email">E-post</label><input id="direct-email" type="email" required maxLength={200} autoComplete="email" value={contact.email} onChange={event => setField('email', event.target.value)}/></div><div className="field"><label htmlFor="direct-phone">Telefon</label><input id="direct-phone" required type="tel" minLength={7} maxLength={30} autoComplete="tel" value={contact.phone} onChange={event => setField('phone', event.target.value)}/></div></div>
        <div className="field"><label htmlFor="direct-notes">Allergier eller önskemål (frivilligt)</label><textarea id="direct-notes" maxLength={1000} value={contact.notes} onChange={event => setField('notes', event.target.value)}/></div>
        <fieldset className="plain-fieldset"><legend>{catalog.test_mode ? 'Simulerat betalningssätt' : 'Betalningssätt'}</legend><div className="form-choice">{methods.map(value => <label className="choice" key={value}><input type="radio" name="direct-payment" checked={payment === value} onChange={() => setPreference(value)}/>{paymentMethodLabel(value, catalog.test_mode === true)}</label>)}</div></fieldset>
        <p className="field-hint">Betalningen öppnas separat på ordersidan när köket har godkänt ordern. Matlagning startar först när köket uppdaterar ordern.{catalog.test_mode ? ' Alla onlinebetalningar är simulationer.' : ''}</p>
        {!methods.length && <p className="preview-note">{catalog.payment_unavailable_reason || 'Inget betalningssätt är aktiverat.'}</p>}
        <label className="checkbox-label"><input type="checkbox" required checked={terms} onChange={event => setTerms(event.target.checked)}/><span>Jag godkänner <a className="text-link" href="/villkor" target="_blank" rel="noopener noreferrer">villkoren</a> och har läst <a className="text-link" href="/integritet" target="_blank" rel="noopener noreferrer">integritetspolicyn</a>.</span></label>
        <div hidden aria-hidden="true"><label htmlFor="direct-website">Lämna tomt</label><input id="direct-website" tabIndex={-1} autoComplete="off" value={contact.website} onChange={event => setField('website', event.target.value)}/></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-accent" type="submit" disabled={!ready || !selectedSlot || !currentAvailability?.enabled || checking || sending || !payment}>{sending ? 'Skickar…' : 'Skicka beställning →'}</button>
      </fieldset></div><aside className="form-sidebar"><span className="eyebrow">DIN BESTÄLLNING</span><h3>{menu?.title}</h3><p>{quantity} paket · {quantity * (menu?.package_portions || 1)} portioner</p><p>{fulfillment === 'pickup' ? 'Hämtning' : 'Hemleverans'}<br/><strong>{selectedSlot?.label || 'Välj en ledig tid'}</strong></p><div className="summary-list"><span>Mat</span><strong>{formatSek(currentAvailability?.subtotal_ore ?? (menu?.price_ore || 0) * quantity)}</strong><span>{fulfillment === 'pickup' ? 'Hämtning' : 'Leverans'}</span><strong>{fulfillment === 'pickup' ? '0 kr' : currentAvailability ? formatSek(currentAvailability.delivery_fee_ore) : 'Ange postnummer'}</strong><span className="total">Totalt</span><strong className="total">{currentAvailability ? formatSek(currentAvailability.total_ore) : 'Kontrolleras'}</strong></div><p className="field-hint">Pris och tid kontrolleras igen när ordern sparas.</p><Link className="text-link" href="/bestall">Boka catering →</Link></aside></div></form>}
  </>;
}
