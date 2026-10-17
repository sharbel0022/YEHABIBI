'use client';

import { useState, type FormEvent } from 'react';
import { CalendarDays, Check, ShieldCheck } from 'lucide-react';
import { ItemPicker } from '@/components/ItemPicker';
import { parseQuantities, useMenuDraft } from '@/components/order-draft';
import type { Catalog, Fulfillment, Occasion, PaymentPreference } from '@/types/domain';
import { eventDateBounds, findDeliveryZone, formatSek, occasions, paymentLabels } from '@/lib/domain';
import { availablePaymentMethods, buildOrderPayload, canOfferDelivery, itemsFromQuantities, minimumGuestsFor,
  newOrderSchema, orderContactError, orderDetailsError, orderLimits, orderSteps, quoteSelection, reconcileSelection } from '@yehabibi/shared';
import { api } from '@/lib/api-client';
import { useCatalog } from '@/components/use-catalog';
import { CatalogRefresh } from '@/components/CatalogRefresh';

type Props = {
  initialCatalog: Catalog;
  initialMenu?: string; initialOccasion?: string; initialMode?: string; initialItems?: string; initialGuests?: string;
};
type Contact = {
  occasion: Occasion; event_date: string; event_time: string; fulfillment: Fulfillment;
  address: string; postal_code: string; city: string; full_name: string; email: string; phone: string;
  notes: string; payment_preference: PaymentPreference; terms_accepted: boolean; website: string;
};
const steps = orderSteps;

export function OrderForm({ initialCatalog,
  initialMenu, initialOccasion, initialMode, initialItems, initialGuests }: Props) {
  const { catalog, ...refreshState } = useCatalog(initialCatalog);
  const { menus, dishes, delivery_zones: zones, settings, orders_enabled: enabled, payment_methods: paymentMethods } = catalog;
  const customMinimum = settings.custom_min_people;
  const explicitCustom = initialMode === 'bygg' || initialMenu === 'egen' || !!initialItems;
  const { draft, setDraft, clearDraft, requestIdFor, notice } = useMenuDraft({
    ...(initialMenu && initialMenu !== 'egen' ? { menuId: initialMenu, mode: 'paket' as const } : {}),
    ...(explicitCustom ? { mode: 'bygg' as const } : {}),
    ...(initialItems ? { quantities: parseQuantities(initialItems, dishes) } : {}),
    ...(initialGuests && Number.isSafeInteger(Number(initialGuests)) && Number(initialGuests) >= customMinimum && Number(initialGuests) <= orderLimits.maxGuests
      ? { guests: Number(initialGuests) } : {})
  }, catalog);
  const { guests } = draft;
  const custom = draft.mode === 'bygg';
  const menu = draft.menuId ? menus.find(item => item.id === draft.menuId) : menus[0];
  const canDeliver = canOfferDelivery(catalog);
  const bookingDates = eventDateBounds(settings.min_advance_days);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Contact>({
    occasion: initialOccasion === 'fest' || initialOccasion === 'foretag' ? initialOccasion : 'hemma',
    event_date: '', event_time: '12:00', fulfillment: canDeliver ? 'delivery' : 'pickup',
    address: '', postal_code: '', city: settings.location_city, full_name: '', email: '', phone: '', notes: '',
    payment_preference: paymentMethods.find(method => method !== 'cash') || paymentMethods[0] || 'card',
    terms_accepted: false, website: ''
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const selection = reconcileSelection(catalog, { menuId: custom ? null : menu?.id || null,
    quantities: draft.quantities, guests, occasion: form.occasion });
  const { quantities } = selection;
  const selected = dishes.filter(dish => quantities[dish.id] > 0);
  const items = itemsFromQuantities(quantities);
  const zone = findDeliveryZone(zones, form.postal_code);
  const fee = zone?.fee_ore ?? 0;
  const deliveryPending = form.fulfillment === 'delivery' && !zone;
  const validGuests = Number.isSafeInteger(guests) && guests >= orderLimits.minGuests && guests <= orderLimits.maxGuests;
  const minimum = minimumGuestsFor(custom ? null : menu, customMinimum);
  const availableMethods = availablePaymentMethods(catalog, form.fulfillment);
  const total = quoteSelection(catalog, selection, form.fulfillment, fee);
  const quoteError = validGuests && (items.length > 0 || !custom && menu?.price_ore) && !total
    ? 'Kontrollera antal personer, mängder och aktuella priser.' : '';

  function set<K extends keyof Contact>(key: K, value: Contact[K]) { setForm(old => ({ ...old, [key]: value })); }
  function goBack(to: number) { setError(''); setStep(to); }
  function orderInput() {
    return buildOrderPayload(selection, { ...form, delivery_zone_id: zone?.id });
  }
  function contactError() {
    return orderContactError(form);
  }
  function validationError() {
    if ((!custom && !menu) || (custom && !items.length)) return 'Välj ett cateringpaket eller minst en maträtt.';
    const minimum = minimumGuestsFor(custom ? null : menu, customMinimum);
    if (!validGuests || guests < minimum) return `Välj mellan ${minimum} och ${orderLimits.maxGuests.toLocaleString('sv-SE')} personer.`;
    if (!total || total.total_ore <= 0) return 'Kontrollera mängder och aktuella priser. Köket behöver ha publicerat godkända priser.';
    return '';
  }
  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const message = validationError();
    if (message) return setError(message);
    if (step === 2) {
      if (form.fulfillment === 'delivery' && !canDeliver) return setError('Leverans är inte tillgänglig. Välj hämtning.');
      const detailsMessage = orderDetailsError(orderInput(), settings, zones);
      if (detailsMessage) return setError(detailsMessage);
    }
    const contactMessage = step === 3 ? contactError() : '';
    if (contactMessage) return setError(contactMessage);
    setStep(old => Math.min(old + 1, steps.length));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (sending) return;
    if (!enabled) return setError('Beställningarna öppnar när ägaren godkänt priser och företagsinställningar.');
    const message = validationError();
    if (message) return setError(message);
    const detailsMessage = orderDetailsError(orderInput(), settings, zones);
    if (detailsMessage) return setError(detailsMessage);
    if (!form.terms_accepted || !availableMethods.includes(form.payment_preference)) return setError('Godkänn villkoren och välj ett tillgängligt betalningssätt.');
    const parsed = newOrderSchema.safeParse(orderInput());
    if (!parsed.success) return setError(contactError() || 'Kontrollera dina uppgifter.');
    setSending(true);
    try {
      const payload = parsed.data;
      const request_id = await requestIdFor(payload);
      const result = await api.createOrder({ ...payload, request_id });
      clearDraft(); setOrderCode(result.code); setTracking(result.tracking_url);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Ett oväntat fel inträffade. Försök igen.'); }
    finally { setSending(false); }
  }

  if (tracking) return <div className="order-panel form-success" role="status">
    <Check size={32} aria-hidden="true"/><h2>Tack! Din förfrågan är mottagen.</h2>
    <p>Ordernummer: <strong>{orderCode}</strong></p>
    <p>Vi granskar meny, datum och pris. Maten är ännu inte bokad och du har inte betalat. Vi återkommer med ett besked.</p>
    <a href={tracking} className="btn btn-primary">Följ din förfrågan →</a>
  </div>;

  return <><CatalogRefresh {...refreshState}/>{notice && <p className="preview-note" role="status">{notice}</p>}<ol className="order-steps" aria-label="Beställningens fyra steg">{steps.map((label, index) =>
    <li key={label} aria-current={step === index + 1 ? 'step' : undefined} className={step > index + 1 ? 'complete' : ''}>
      <button type="button" disabled={sending || index + 1 > step} onClick={() => goBack(index + 1)}><span>{step > index + 1 ? <Check size={16}/> : index + 1}</span>{label}</button>
    </li>)}</ol>
    <div className="form-layout"><div className="order-panel">
      <span className="eyebrow">STEG {step} AV 4</span>
      {step === 1 && <form onSubmit={next}>
        <h2>Vad vill ni äta?</h2><p className="muted">En färdig meny eller en egen blandning av favoriter.</p>
        <div className="catalog-tabs" role="group" aria-label="Menytyp">{(['paket', 'bygg'] as const).map(mode =>
          <button type="button" key={mode} aria-pressed={draft.mode === mode} className={draft.mode === mode ? 'active' : ''}
            onClick={() => { setDraft(old => ({ ...old, mode, guests: Math.max(old.guests, mode === 'bygg' ? customMinimum : menu?.min_people || 1) })); setError(''); }}>
            {mode === 'paket' ? 'Färdiga paket' : 'Bygg egen meny'}</button>)}</div>
        <div className="field"><label htmlFor="guests">Antal personer</label>
          <input id="guests" type="number" required min={minimum} max={orderLimits.maxGuests} value={guests || ''}
            onChange={event => setDraft(old => ({ ...old, guests: Number(event.target.value) }))}/></div>
        {!custom ? <div className="field"><label htmlFor="menu">Välj cateringpaket</label>
          <select id="menu" value={menu?.id || ''} onChange={event => {
            const chosen = menus.find(item => item.id === event.target.value);
            if (chosen) setDraft(old => ({ ...old, menuId: chosen.id, guests: Math.max(old.guests, chosen.min_people) }));
          }} required><option value="">Välj paket</option>{menus.map(item => <option key={item.id} value={item.id}>
            {item.title} · {item.price_ore ? `${formatSek(item.price_ore)}/person` : 'Pris på förfrågan'}</option>)}</select>
          {menu && <p className="field-hint">{menu.description}<br/>Innehåller: {menu.included.join(', ')}.<br/>Allergener: {menu.allergens.join(', ') || 'Fråga oss'}.</p>}
        </div> : <ItemPicker dishes={dishes} guests={guests} quantities={quantities}
          summary={<div className="builder-summary"><div className="builder-checkout"><div><span>{deliveryPending ? 'Mat totalt' : 'Totalt'}</span><strong>{total ? formatSek(total.total_ore) : 'Välj maträtter'}</strong>
            <small>{total ? `${formatSek(Math.round(total.total_ore / guests))} / person` : 'Priset visas när du väljer'}</small></div><span>{selected.length} valda rätter · {guests} personer</span></div></div>}
          onQuantityChange={(id, quantity) => setDraft(old => ({ ...old, quantities: { ...old.quantities, [id]: quantity } }))}/>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit">Datum och plats →</button>
      </form>}
      {step === 2 && <form onSubmit={next}>
        <h2>När och var?</h2>
        <fieldset className="plain-fieldset"><legend>Välj tillfälle</legend><div className="form-choice">{Object.entries(occasions).map(([value, label]) =>
          <label className="choice" key={value}><input type="radio" name="occasion" checked={form.occasion === value}
            onChange={() => set('occasion', value as Occasion)}/>{label}</label>)}</div></fieldset>
        <div className="field"><label htmlFor="event-guests">Antal personer</label><input id="event-guests" type="number" required min={minimum} max={orderLimits.maxGuests} value={guests || ''}
          onChange={event => setDraft(old => ({ ...old, guests: Number(event.target.value) }))}/></div>
        <div className="field-grid">
          <div className="field"><label htmlFor="date">Datum</label><input id="date" type="date" required min={bookingDates.min} max={bookingDates.max} value={form.event_date} onChange={event => set('event_date', event.target.value)}/></div>
          <div className="field"><label htmlFor="time">Tid</label><input id="time" type="time" required value={form.event_time} onChange={event => set('event_time', event.target.value)}/></div>
        </div><p className="field-hint">Minst {settings.min_advance_days} dagar i förväg. Köket bekräftar tillgängligheten.</p>
        <fieldset className="plain-fieldset"><legend>Leverans eller hämtning</legend><div className="form-choice">
          {canDeliver && <label className="choice"><input type="radio" name="fulfillment" checked={form.fulfillment === 'delivery'} onChange={() => {
            set('fulfillment', 'delivery');
            if (form.payment_preference === 'cash') set('payment_preference', paymentMethods.find(method => method !== 'cash')!);
          }}/>Hemleverans</label>}
          {settings.pickup_enabled && <label className="choice"><input type="radio" name="fulfillment" checked={form.fulfillment === 'pickup'} onChange={() => set('fulfillment', 'pickup')}/>Hämtning</label>}
        </div></fieldset>
        {form.fulfillment === 'delivery' ? <>
          <div className="field"><label htmlFor="address">Adress</label><input id="address" required autoComplete="street-address" maxLength={220} value={form.address} onChange={event => set('address', event.target.value)} placeholder="Gata och nummer"/></div>
          <div className="field-grid">
            <div className="field"><label htmlFor="postal">Postnummer</label><input id="postal" required autoComplete="postal-code" inputMode="numeric" maxLength={15} value={form.postal_code} onChange={event => set('postal_code', event.target.value)} placeholder="722 12"/></div>
            <div className="field"><label htmlFor="city">Ort</label><input id="city" required autoComplete="address-level2" maxLength={100} value={form.city} onChange={event => set('city', event.target.value)}/></div>
          </div><p className="field-hint">{zone ? `${zone.name} · Leverans ${formatSek(fee)}, ingår i totalpriset.` : 'Ange postnummer för att kontrollera leveransområde och avgift.'}</p>
        </> : <p className="preview-note">Hämtning: {settings.pickup_address || 'Plats meddelas vid bekräftelse.'}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="btn" onClick={() => goBack(1)}>← Tillbaka</button><button type="submit" className="btn btn-primary">Kontaktuppgifter →</button></div>
      </form>}
      {step === 3 && <form onSubmit={next}>
        <h2>Hur når vi dig?</h2><p className="muted">Vi använder uppgifterna för att bekräfta din catering.</p>
        <div className="field"><label htmlFor="name">Fullständigt namn</label><input id="name" required autoComplete="name" minLength={2} maxLength={120} value={form.full_name} onChange={event => set('full_name', event.target.value)}/></div>
        <div className="field-grid">
          <div className="field"><label htmlFor="email">E-post</label><input id="email" type="email" required autoComplete="email" maxLength={200} value={form.email} onChange={event => set('email', event.target.value)}/></div>
          <div className="field"><label htmlFor="phone">Telefon</label><input id="phone" type="tel" required autoComplete="tel" minLength={7} maxLength={30} value={form.phone} onChange={event => set('phone', event.target.value)}/></div>
        </div>
        <div className="field"><label htmlFor="notes">Allergier eller önskemål (frivilligt)</label><textarea id="notes" maxLength={1000} value={form.notes} onChange={event => set('notes', event.target.value)} placeholder="Berätta vad köket behöver veta."/></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="btn" onClick={() => goBack(2)}>← Tillbaka</button><button type="submit" className="btn btn-primary">Kontrollera förfrågan →</button></div>
      </form>}
      {step === 4 && <form onSubmit={submit}>
        <h2>Allt ser bra ut?</h2><p>Kontrollera dina val. Köket granskar din förfrågan innan maten bokas och betalning öppnas.</p>
        <div className="order-review"><CalendarDays size={22} aria-hidden="true"/><div><strong>{form.event_date} · {form.event_time}</strong>
          <p>{guests} personer · {occasions[form.occasion]}<br/>{form.fulfillment === 'pickup' ? 'Hämtning' : `${form.address}, ${form.postal_code} ${form.city}`}</p></div>
          <button type="button" className="text-link" onClick={() => goBack(2)}>Ändra</button></div>
        <div className="order-review"><div><strong>{form.full_name}</strong><p>{form.email}<br/>{form.phone}</p>{form.notes && <p>Önskemål: {form.notes}</p>}</div>
          <button type="button" className="text-link" onClick={() => goBack(3)}>Ändra</button></div>
        <fieldset className="plain-fieldset"><legend>Betalningssätt efter godkännande</legend>
          <div className="form-choice">{availableMethods.map(value => <label className="choice" key={value}>
            <input type="radio" name="payment" disabled={sending} checked={form.payment_preference === value} onChange={() => set('payment_preference', value)}/>{paymentLabels[value]}</label>)}</div></fieldset>
        {!availableMethods.length && <p className="preview-note">Betalningssätten visas när köket har öppnat beställningarna.</p>}
        {availableMethods.includes('card') ? <p className="field-hint">Apple Pay visas i säker Checkout på stödda enheter.</p> : null}
        <p className="approval-note"><ShieldCheck size={20} aria-hidden="true"/>Du betalar först efter kökets godkännande. Ett nytt pris kräver ditt godkännande. Kontant gäller endast vid hämtning.</p>
        <label className="checkbox-label"><input type="checkbox" required disabled={sending} checked={form.terms_accepted} onChange={event => set('terms_accepted', event.target.checked)}/>
          <span>Jag godkänner <a className="text-link" href="/villkor" target="_blank" rel="noopener noreferrer">villkoren</a> och har läst <a className="text-link" href="/integritet" target="_blank" rel="noopener noreferrer">integritetspolicyn</a>.</span></label>
        <div hidden aria-hidden="true"><label htmlFor="website">Lämna tomt</label><input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={event => set('website', event.target.value)}/></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" disabled={sending} className="btn" onClick={() => goBack(3)}>← Tillbaka</button>
          <button type="submit" className="btn btn-accent" disabled={!enabled || sending || !!quoteError || !availableMethods.includes(form.payment_preference)}>{sending ? 'Skickar…' : 'Skicka cateringförfrågan →'}</button></div>
      </form>}
      {!enabled && <p className="preview-note">Förhandsvisning. Köket behöver publicera godkända priser och inställningar innan förfrågningar öppnas.</p>}
    </div>
    <aside className="form-sidebar"><span className="eyebrow">DIN CATERING</span><h3>{custom ? 'Din egen meny' : menu?.title || 'Välj ett paket'}</h3><p>{guests} personer · {occasions[form.occasion]}</p>
      {custom && selected.length > 0 ? <div className="summary-lines">{selected.map(dish => <div key={dish.id}><span>{quantities[dish.id]} × {dish.title}<small>{formatSek(dish.price_ore)} / {dish.portion_label}</small></span><strong>{formatSek(quantities[dish.id] * dish.price_ore)}</strong></div>)}</div>
        : !custom && menu && <p className="field-hint">{guests} × {formatSek(menu.price_ore)} / person<br/>{menu.included.join(', ')}</p>}
      <div className="summary-list"><span>Mat</span><strong>{total ? formatSek(total.subtotal_ore) : 'Ej fastställt'}</strong>
        <span>Leverans</span><strong>{form.fulfillment === 'pickup' ? 'Hämtning: 0 kr' : zone ? formatSek(fee) : 'Ange postnummer'}</strong>
        <span className="total">{deliveryPending ? 'Mat totalt' : 'Totalt'}</span><strong className="total">{total ? formatSek(total.total_ore) : '–'}</strong>
        <span>Per person ({guests})</span><strong>{total ? formatSek(Math.round(total.total_ore / guests)) : '–'}</strong></div>
      {quoteError && <p className="form-error" role="alert">{quoteError}</p>}
      <p className="field-hint">{deliveryPending ? 'Leverans tillkommer. ' : ''}Pris per person är en jämförelse. Hela menyn är en gemensam beställning.</p>
      {step > 1 && <button type="button" disabled={sending} className="text-link" onClick={() => goBack(1)}>Ändra din meny</button>}
    </aside></div></>;
}
