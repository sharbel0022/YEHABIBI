'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { availablePaymentMethods, canPayOrder, formatScheduledTime, itemsFromQuantities, orderContactError, safePaymentUrl, type AvailabilityResponse, type Catalog, type Fulfillment, type OnlinePaymentMethod, type OrderReceipt, type PaymentPreference } from '@yehabibi/shared';
import { formatSek, paymentMethodLabel } from '@/lib/domain';
import { api } from '@/lib/api-client';
import { useCatalog } from '@/components/use-catalog';
import { CatalogRefresh } from '@/components/CatalogRefresh';
import { usePaymentMethods } from '@/components/use-payment-methods';
import './customer.css';

const steps = ['Mat och tid', 'Granska', 'Kontakt och betalning'];
function initialAddons(value?: string) {
  const quantities: Record<string, number> = {};
  for (const part of (value || '').split(',').slice(0, 40)) {
    const [id, amount] = part.split(':'); const count = Number(amount);
    if (/^[\da-f-]{36}$/i.test(id) && Number.isInteger(count) && count > 0 && count <= 100) quantities[id] = count;
  }
  return quantities;
}

export function DirectOrderForm({ initialCatalog, initialMenu, initialQuantity, initialAddons: givenAddons, campaignId }: {
  initialCatalog: Catalog; initialMenu?: string; initialQuantity?: string; initialAddons?: string; campaignId?: string;
}) {
  const { catalog, ...refreshState } = useCatalog(initialCatalog);
  const menus = catalog.menus.filter(menu => menu.active && menu.direct_order_enabled && menu.price_ore > 0);
  const [menuId, setMenuId] = useState(initialMenu || menus[0]?.id || '');
  const menu = menus.find(item => item.id === menuId);
  const [quantity, setQuantity] = useState(() => Math.max(1, Math.min(100, Math.floor(Number(initialQuantity)) || 1)));
  const [extras, setExtras] = useState(() => initialAddons(givenAddons));
  const allowedExtras = catalog.dishes.filter(dish => dish.active && dish.direct_addon_enabled && dish.price_ore > 0 && menu?.allowed_addon_ids?.includes(dish.id));
  const addons = itemsFromQuantities(extras);
  const invalidExtras = addons.some(item => !allowedExtras.some(dish => dish.id === item.dish_id));
  const [step, setStep] = useState(1);
  const [fulfillment, setFulfillment] = useState<Fulfillment>(catalog.settings.pickup_enabled ? 'pickup' : 'delivery');
  const [contact, setContact] = useState({ address: '', postal_code: '', city: catalog.settings.location_city, full_name: '', email: '', phone: '', notes: '', website: '' });
  const [terms, setTerms] = useState(false);
  const [preference, setPreference] = useState<PaymentPreference>('swish');
  const [availability, setAvailability] = useState<{ key: string; data: AvailabilityResponse } | null>(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [timeMode, setTimeMode] = useState<'asap' | 'choose' | ''>('');
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [availabilityError, setAvailabilityError] = useState('');
  const [reviewed, setReviewed] = useState('');
  const [paymentFallback, setPaymentFallback] = useState('');
  const [submitted, setSubmitted] = useState<{ receipt: OrderReceipt; title: string; quantity: number; time: string; total: number } | null>(null);
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const orderRequest = useRef<{ fingerprint: string; id: string } | null>(null);
  const deviceMethods = usePaymentMethods(catalog.payment_methods, catalog.test_mode === true);
  const methods = availablePaymentMethods(catalog, fulfillment).filter(value => value === 'cash' || value !== 'unpaid' && deviceMethods.includes(value));
  const payment = methods.includes(preference) ? preference : methods[0];
  const postal = contact.postal_code.replace(/\s/g, '');
  const requestInput = { menu_id: menu?.id || '', quantity, fulfillment, addons, ...(fulfillment === 'delivery' ? { postal_code: postal } : {}), ...(campaignId ? { campaign_id: campaignId } : {}) };
  const key = JSON.stringify(requestInput);
  const current = availability?.key === key ? availability.data : null;
  const slot = current?.slots.find(item => item.starts_at === selectedTime);
  const ready = catalog.orders_enabled && catalog.direct_orders_enabled === true && !catalog.demo;
  const orderable = !!menu && (!menu.availability_state || menu.availability_state === 'available') && !invalidExtras;
  const canContinue = ready && orderable && current?.enabled && slot && !checking && !availabilityError;
  const quoteKey = `${key}:${current?.total_ore}:${JSON.stringify(current?.lines)}:${slot?.starts_at}:${slot?.ends_at}`;
  const slotLabel = slot ? `${slot.label}${fulfillment === 'delivery' && slot.ends_at ? ` – ${formatScheduledTime(slot.ends_at)}` : ''}` : 'Välj en ledig tid';
  const group = menu?.package_group || menu?.id;
  const families = menus.filter((item, index) => menus.findIndex(other => (other.package_group || other.id) === (item.package_group || item.id)) === index);
  const variants = menus.filter(item => (item.package_group || item.id) === group);
  const setField = (field: keyof typeof contact, value: string) => setContact(old => ({ ...old, [field]: value }));
  function changed() { setSelectedTime(''); setTimeMode(''); setReviewed(''); setError(''); }

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (submitted || !ready || !orderable || fulfillment === 'delivery' && !/^\d{5}$/.test(postal)) { setChecking(false); return; }
    setChecking(true); setAvailabilityError('');
    try {
      const data = await api.getAvailability(JSON.parse(key));
      if (request !== sequence.current) return;
      setAvailability({ key, data });
      setSelectedTime(old => data.slots.some(item => item.starts_at === old) ? old : '');
    } catch (reason) {
      if (request !== sequence.current) return;
      setAvailability(null); setAvailabilityError(reason instanceof Error ? reason.message : 'Tiderna kunde inte hämtas.');
    } finally { if (request === sequence.current) setChecking(false); }
  }, [key, ready, orderable, fulfillment, postal, submitted]);
  useEffect(() => {
    if (submitted) return;
    const timeout = window.setTimeout(() => void refresh(), 250);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !inFlight.current) void refresh(); }, 30000);
    return () => { window.clearTimeout(timeout); window.clearInterval(timer); sequence.current++; };
  }, [refresh, submitted]);

  async function requestIdFor(payload: object) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    try { const saved = JSON.parse(sessionStorage.getItem('yehabibi-direct-request-v4-4') || 'null'); if (saved?.fingerprint === fingerprint && /^[a-f0-9-]{36}$/i.test(saved.id)) orderRequest.current = saved; } catch { /* Minneskopian fungerar ändå. */ }
    if (orderRequest.current?.fingerprint !== fingerprint) orderRequest.current = { fingerprint, id: crypto.randomUUID() };
    try { sessionStorage.setItem('yehabibi-direct-request-v4-4', JSON.stringify(orderRequest.current)); } catch { /* Behåll sidan öppen för återförsök. */ }
    return orderRequest.current.id;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current) return; setError('');
    if (!canContinue || !menu || !current || !slot) { setStep(1); return setError('Kontrollera maten och välj en ledig tid.'); }
    if (step < 3) { if (step === 2) setReviewed(quoteKey); setStep(step + 1); return; }
    if (reviewed !== quoteKey) { setStep(2); return setError('Pris eller tid har uppdaterats. Granska beställningen igen.'); }
    const contactError = orderContactError(contact); if (contactError) return setError(contactError);
    if (!terms || !payment) return setError('Välj betalningssätt och godkänn villkoren.');
    const payload = { ...requestInput, ...contact, address: fulfillment === 'delivery' ? contact.address : '', city: fulfillment === 'delivery' ? contact.city : '', postal_code: fulfillment === 'delivery' ? postal : '', scheduled_at: slot.starts_at, expected_total_ore: current.total_ore, payment_preference: payment, terms_accepted: true as const };
    inFlight.current = true; setSending(true);
    try {
      const result = await api.createDirectOrder({ ...payload, request_id: await requestIdFor(payload) });
      setSubmitted({ receipt: result, title: menu.title, quantity, time: slotLabel, total: current.total_ore });
      if (payment !== 'cash') {
        try {
          const [status, verifiedCatalog] = await Promise.all([api.getPaymentStatus(result), api.getCatalog()]);
          if (canPayOrder(status.order)) {
            const session = await api.createPayment({ code: result.code, token: result.token }, payment as OnlinePaymentMethod);
            const url = safePaymentUrl(session.checkout_url, window.location.origin, verifiedCatalog.test_mode === true && session.test_mode === true);
            if (!url) throw new Error('Betalningslänken kunde inte verifieras.');
            window.location.assign(url);
          } else setPaymentFallback('Köket behöver först godkänna beställningen. Följ besked via din privata orderlänk.');
        } catch (reason) { setPaymentFallback(`Ordern är sparad. ${reason instanceof Error ? reason.message : 'Betalningen kunde inte öppnas.'} Fortsätt via den privata orderlänken; skapa inte en ny beställning.`); }
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Beställningen kunde inte sparas.'); void refresh(); }
    finally { inFlight.current = false; setSending(false); }
  }
  function summary() {
    return <><h3>{quantity} × {menu?.title} {menu?.size_label}</h3><p>{quantity * (menu?.package_portions || 1)} portioner · {fulfillment === 'pickup' ? 'Hämtning' : `Hemleverans ${postal}`}</p><p><strong>{slotLabel}</strong></p>
      <div className="summary-lines">{current?.lines?.map((line, index) => <div key={index}><span>{line.quantity} × {line.title}<small>{formatSek(line.unit_price_ore)} / {line.unit_label || 'paket'}</small></span><strong>{formatSek(line.total_ore)}</strong></div>)}</div>
      <div className="summary-list"><span>Mat</span><strong>{current ? formatSek(current.subtotal_ore) : 'Kontrolleras'}</strong><span>{fulfillment === 'pickup' ? 'Hämtning' : 'Leverans'}</span><strong>{current ? formatSek(current.delivery_fee_ore) : 'Kontrolleras'}</strong><span className="total">Totalt</span><strong className="total">{current ? formatSek(current.total_ore) : 'Kontrolleras'}</strong></div>
      {current && <p className="field-hint">{formatSek(Math.round(current.total_ore / (quantity * (menu?.package_portions || 1))))} / person som jämförelse. Paketpriset multipliceras endast med antal paket.</p>}</>;
  }
  if (submitted) return <div className="order-panel form-success" role="status"><h2>Din beställning är mottagen.</h2><p>Ordernummer: <strong>{submitted.receipt.code}</strong></p><p>{submitted.quantity} × {submitted.title}<br/>{submitted.time}<br/>{formatSek(submitted.total)}</p><p>En tillfällig reservation är inte en bekräftelse. Följ kökets besked och betalningen på din privata ordersida. {catalog.test_mode ? 'Alla onlinebetalningar simuleras utan riktiga pengar.' : ''}</p>{sending && <p>Kontrollerar nästa betalningssteg…</p>}{paymentFallback && <p className="preview-note">{paymentFallback}</p>}<a className="btn btn-primary" href={submitted.receipt.tracking_url}>Fortsätt till betalning och orderstatus →</a></div>;
  return <><CatalogRefresh {...refreshState}/>{catalog.test_mode && <p className="preview-note">TESTLÄGE – använd testuppgifter. Inga riktiga pengar eller plånböcker används.</p>}{!ready && <p className="preview-note">Direktbeställningar är pausade eller ännu inte öppna. Riktiga beställningar kräver företagets godkännande.</p>}
    {!menus.length ? <p className="empty-state">Inga direktpaket är publicerade. <Link href="/bestall">Boka catering</Link></p> : <form className="direct-form" onSubmit={submit}>
      <ol className="order-steps" aria-label="Direktbeställningens tre steg">{steps.map((title, index) => <li key={title} aria-current={step === index + 1 ? 'step' : undefined}><button type="button" disabled={sending || index + 1 > step} onClick={() => { setStep(index + 1); setError(''); }}><span>{index + 1}</span>{title}</button></li>)}</ol>
      <div className="direct-summary" aria-live="polite"><div><small>Aktuell totalsumma</small><strong>{current ? formatSek(current.total_ore) : 'Kontrolleras av köket'}</strong></div><div><small>Vald tid · Stockholm</small><strong>{slotLabel}</strong></div></div>
      <div className="form-layout"><div className="order-panel"><fieldset className="plain-fieldset" disabled={sending}><span className="eyebrow">STEG {step} AV 3</span><h2>{steps[step - 1]}</h2>
      {step === 1 && <>
        <label className="field">Färdigt paket<select required value={group || ''} onChange={event => { setMenuId(menus.find(item => (item.package_group || item.id) === event.target.value)?.id || ''); setExtras({}); changed(); }}><option value="">Välj paket</option>{families.map(item => <option value={item.package_group || item.id} key={item.id}>{item.package_group || item.title}</option>)}</select></label>
        {!!variants.length && <label className="field">Paketstorlek<select value={menuId} onChange={event => { setMenuId(event.target.value); setExtras({}); changed(); }}>{variants.map(item => <option key={item.id} value={item.id}>{item.size_label || `${item.package_portions || 1} portioner`} · {formatSek(item.price_ore)} / paket</option>)}</select></label>}
        {!menu && <p className="form-error">Det tidigare paketet är inte tillgängligt. Välj ett publicerat paket.</p>}
        {menu && <><img className="checkout-package-photo" src={menu.image_url || '/images/mezze.webp'} alt={menu.image_url ? menu.title : 'Inspirationsbild – paketbild saknas'}/>{(!menu.image_url || catalog.test_mode || catalog.demo) && <p className="field-hint">Inspirationsbild – {catalog.test_mode ? 'syntetiskt testpaket, ingen godkänd produktbild.' : 'köket behöver bekräfta den exakta paketbilden.'}</p>}<p>{menu.description}</p><p className="field-hint">{menu.included.join(' · ')}<br/>Allergener: {menu.allergens.join(', ') || 'Fråga köket före köp'}.<br/>{menu.package_portions || 1} portioner · {formatSek(menu.price_ore)} / paket.</p>{menu.availability_state && menu.availability_state !== 'available' && <p className="preview-note">{menu.availability_state === 'sold_out' ? 'Paketet är slutsålt.' : 'Paketet är pausat.'}</p>}</>}
        <label className="field">Antal paket<input type="number" required min={1} max={100} value={quantity} onChange={event => { setQuantity(Math.max(1, Math.min(100, Math.floor(Number(event.target.value)) || 1))); changed(); }}/></label>
        {!!allowedExtras.length && <fieldset className="plain-fieldset"><legend>Tillbehör</legend>{allowedExtras.map(dish => <label className="addon-row" key={dish.id}><span><strong>{dish.title}</strong><small>{formatSek(dish.price_ore)} / {dish.portion_label} · Allergener: {dish.allergens.join(', ') || 'Fråga köket'}</small></span><input aria-label={`Antal ${dish.title}`} type="number" min={0} max={100} value={extras[dish.id] || 0} onChange={event => { setExtras(old => ({ ...old, [dish.id]: Math.max(0, Math.min(100, Math.floor(Number(event.target.value)) || 0)) })); changed(); }}/></label>)}</fieldset>}
        {invalidExtras && <p className="form-error">Ett tidigare tillbehör erbjuds inte längre. <button type="button" className="text-link" onClick={() => { setExtras({}); changed(); }}>Ta bort tidigare tillbehör</button></p>}
        <p className="field-hint">Paketets innehåll byts inte automatiskt. <Link href="/bestall?val=bygg" className="text-link">Bygg en egen cateringmeny</Link> för särskilda önskemål.</p>
        <fieldset className="plain-fieldset"><legend>Hämtning eller hemleverans</legend><div className="form-choice">{(['pickup', 'delivery'] as const).filter(value => value === 'pickup' ? catalog.settings.pickup_enabled : catalog.settings.delivery_enabled).map(value => <label className="choice" key={value}><input type="radio" name="direct-fulfillment" checked={fulfillment === value} onChange={() => { setFulfillment(value); changed(); }}/>{value === 'pickup' ? 'Hämtning' : 'Hemleverans'}</label>)}</div></fieldset>
        {fulfillment === 'delivery' ? <label className="field">Postnummer<input required autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{3} ?[0-9]{2}" maxLength={6} value={contact.postal_code} onChange={event => { setField('postal_code', event.target.value); changed(); }}/><small>{current?.delivery_zone_id ? `Aktiv zon · ${formatSek(current.delivery_fee_ore)}` : 'Servern kontrollerar leveranszon och avgift. Fullständig adress anges i sista steget.'}</small></label> : <p className="preview-note">Hämtning: {current?.pickup_address || catalog.settings.pickup_address || 'Adress behöver publiceras av köket.'} · 0 kr</p>}
        <h3>Välj tid</h3>{checking && <p role="status">Hämtar kökets lediga tider…</p>}{availabilityError && <p className="form-error" role="alert">{availabilityError}</p>}{current?.reason && <p className="preview-note">{current.reason}</p>}{current && !current.slots.length && !current.reason && <p className="preview-note">Inga lediga tider för ditt val just nu. Prova hämtning eller ett annat antal.</p>}
        {!!current?.slots.length && <><p>Nästa lediga tid: <strong>{current.slots[0].label}</strong></p><div className="form-choice"><button type="button" className={`btn ${timeMode === 'asap' ? 'btn-primary' : ''}`} aria-pressed={timeMode === 'asap'} onClick={() => { setTimeMode('asap'); setSelectedTime(current.slots[0].starts_at); }}>Så snart som möjligt</button><button type="button" className={`btn ${timeMode === 'choose' ? 'btn-primary' : ''}`} aria-pressed={timeMode === 'choose'} onClick={() => { setTimeMode('choose'); setSelectedTime(''); }}>Välj tid</button></div>
        {timeMode === 'choose' && <label className="field">Tillgängliga tider<select required value={slot?.starts_at || ''} onChange={event => setSelectedTime(event.target.value)}><option value="">Välj tid</option>{current.slots.map(item => <option key={item.starts_at} value={item.starts_at}>{item.label}{fulfillment === 'delivery' && item.ends_at ? ` – ${formatScheduledTime(item.ends_at)}` : ''}</option>)}</select></label>}
        {timeMode && !slot && <p className="preview-note">Välj en aktuell tid. En bortfallen tid ersätts aldrig automatiskt.</p>}</>}
        {fulfillment === 'delivery' && (!current?.slots.length || availabilityError) && catalog.settings.pickup_enabled && <button type="button" className="btn" onClick={() => { setFulfillment('pickup'); changed(); }}>Välj hämtning i stället</button>}
        <button type="button" className="text-link" disabled={checking || !ready} onClick={() => void refresh()}>Uppdatera lediga tider</button><p className="field-hint">{current ? `Tillagning ${current.preparation_minutes} min. ` : ''}Tider och pris kommer från servern. Ingen tidsreservation görs före inskick.</p>
      </>}
      {step === 2 && <>{summary()}<button type="button" className="text-link" onClick={() => setStep(1)}>Ändra mat, leveranssätt eller tid</button><p className="field-hint">Dina andra val finns kvar när du går tillbaka.</p></>}
      {step === 3 && <><p><strong>{slotLabel} · {current && formatSek(current.total_ore)}</strong></p>{(['full_name', 'email', 'phone'] as const).map(field => <label className="field" key={field}>{field === 'full_name' ? 'Fullständigt namn' : field === 'email' ? 'E-post' : 'Telefon'}<input required type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'} autoComplete={field === 'full_name' ? 'name' : field === 'phone' ? 'tel' : 'email'} maxLength={field === 'full_name' ? 120 : field === 'phone' ? 30 : 200} value={contact[field]} onChange={event => setField(field, event.target.value)}/></label>)}
        {fulfillment === 'delivery' && <><label className="field">Gata och nummer<input required autoComplete="street-address" maxLength={220} value={contact.address} onChange={event => setField('address', event.target.value)}/></label><label className="field">Ort<input required autoComplete="address-level2" maxLength={100} value={contact.city} onChange={event => setField('city', event.target.value)}/></label><p>Postnummer: {postal} <button type="button" className="text-link" onClick={() => setStep(1)}>Ändra</button></p></>}
        <label className="field">Allergier och leveransinstruktioner (frivilligt)<textarea maxLength={1000} value={contact.notes} onChange={event => setField('notes', event.target.value)}/></label>
        <fieldset className="plain-fieldset"><legend>{catalog.test_mode ? 'Simulerat betalningssätt' : 'Betalningssätt'}</legend><div className="form-choice">{methods.map(value => <label className="choice" key={value}><input type="radio" name="direct-payment" checked={payment === value} onChange={() => setPreference(value)}/>{paymentMethodLabel(value, catalog.test_mode === true)}</label>)}</div></fieldset>
        <p className="field-hint">{payment === 'cash' ? 'Kontant endast vid hämtning, enligt kökets regler. Köket registrerar mottagna pengar.' : 'Nästa sida öppnar betalningen när köket tillåter det. Ordern är bekräftad först efter verifierad betalning och kapacitet.'}{catalog.test_mode ? ' Inga riktiga pengar används.' : ''}</p>
        <label className="checkbox-label"><input type="checkbox" required checked={terms} onChange={event => setTerms(event.target.checked)}/><span>Jag godkänner <a href="/villkor" className="text-link" target="_blank" rel="noopener noreferrer">villkoren</a> och har läst <a href="/integritet" className="text-link" target="_blank" rel="noopener noreferrer">integritetspolicyn</a>.</span></label>
        <div hidden aria-hidden="true"><label>Lämna tomt<input tabIndex={-1} autoComplete="off" value={contact.website} onChange={event => setField('website', event.target.value)}/></label></div>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions">{step > 1 && <button type="button" className="btn" onClick={() => setStep(step - 1)}>← Tillbaka</button>}<button type="submit" className="btn btn-primary" disabled={!canContinue || sending || step === 3 && !payment}>{sending ? 'Skickar…' : step === 1 ? 'Granska beställningen →' : step === 2 ? 'Kontakt och betalning →' : payment === 'cash' ? 'Reservera · kontant vid hämtning →' : `Reservera och fortsätt till ${catalog.test_mode ? 'testbetalning' : 'betalning'} →`}</button></div>
      </fieldset></div><aside className="form-sidebar"><span className="eyebrow">DIN BESTÄLLNING</span>{summary()}<Link className="text-link" href="/bestall">Boka catering →</Link></aside></div>
    </form>}</>;
}
