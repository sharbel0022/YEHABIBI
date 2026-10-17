'use client';

import { useState, type FormEvent } from 'react';
import { ItemPicker } from '@/components/ItemPicker';
import type { DeliveryZone, Dish, Fulfillment, Menu, Occasion, PaymentPreference, Settings } from '@/types/domain';
import { calcDishTotal, calcTotal, findDeliveryZone, formatSek, paymentLabels } from '@/lib/domain';

type Props = {
  menus: Menu[]; dishes: Dish[]; zones: DeliveryZone[]; settings: Settings;
  enabled: boolean; paymentMethods: PaymentPreference[];
  initialMenu?: string; initialOccasion?: string; initialMode?: string; initialItems?: string; initialGuests?: string;
};
type FormState = {
  menu_id: string; guests: number; occasion: Occasion; event_date: string; event_time: string;
  fulfillment: Fulfillment; address: string; postal_code: string; city: string;
  full_name: string; email: string; phone: string; notes: string;
  payment_preference: PaymentPreference; terms_accepted: boolean; website: string;
};

// Länken från menykatalogen innehåller bara rätt-id och antal. Priset hämtas alltid ur katalogen.
function initialQuantities(value: string | undefined, dishes: Dish[]) {
  const quantities: Record<string, number> = {};
  for (const part of (value || '').split(',').slice(0, 50)) {
    const [id, amount] = part.split(':');
    const quantity = Number(amount);
    if (dishes.some(dish => dish.id === id && dish.price_ore > 0) && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 1000) {
      quantities[id] = quantity;
    }
  }
  return quantities;
}

export function OrderForm({ menus, dishes, zones, settings, enabled, paymentMethods,
  initialMenu, initialOccasion, initialMode, initialItems, initialGuests }: Props) {
  const firstMenu = menus.find(menu => menu.id === initialMenu) || menus[0];
  const startCustom = initialMode === 'bygg' || initialMenu === 'egen' || !!initialItems || !firstMenu;
  const customMinimum = settings.custom_min_people;
  const canDeliver = settings.delivery_enabled && zones.length > 0 && paymentMethods.some(method => method !== 'cash');
  const chosenGuests = Number(initialGuests);
  const startMinimum = startCustom ? customMinimum : firstMenu?.min_people || 1;
  const startGuests = Number.isSafeInteger(chosenGuests) && chosenGuests >= startMinimum && chosenGuests <= 1000
    ? chosenGuests : Math.max(startMinimum, startCustom ? 6 : 10);
  const [mode, setMode] = useState<'paket' | 'bygg'>(startCustom ? 'bygg' : 'paket');
  const [quantities, setQuantities] = useState(() => initialQuantities(initialItems, dishes));
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({
    menu_id: firstMenu?.id || '', guests: startGuests,
    occasion: initialOccasion === 'fest' || initialOccasion === 'foretag' ? initialOccasion : 'hemma',
    event_date: '', event_time: '12:00', fulfillment: canDeliver ? 'delivery' : 'pickup',
    address: '', postal_code: '', city: settings.location_city, full_name: '', email: '', phone: '', notes: '',
    payment_preference: paymentMethods.find(method => method !== 'cash') || paymentMethods[0] || 'card',
    terms_accepted: false, website: ''
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState('');
  const custom = mode === 'bygg';
  const menu = menus.find(item => item.id === form.menu_id);
  const selected = dishes.filter(dish => quantities[dish.id] > 0);
  const items = selected.map(dish => ({ dish_id: dish.id, quantity: quantities[dish.id] }));
  const zone = findDeliveryZone(zones, form.postal_code);
  const fee = zone?.fee_ore ?? 0;
  const deliveryPending = form.fulfillment === 'delivery' && !zone;
  const validGuests = Number.isSafeInteger(form.guests) && form.guests >= 1 && form.guests <= 1000;
  const availableMethods = paymentMethods.filter(method => method !== 'cash' || (form.fulfillment === 'pickup' && settings.cash_enabled));
  let total: ReturnType<typeof calcTotal> | null = null;
  let quoteError = '';
  try {
    if (validGuests) total = custom && items.length ? calcDishTotal(items, dishes, form.guests, form.fulfillment, fee)
      : !custom && menu?.price_ore ? calcTotal(menu.price_ore, form.guests, form.fulfillment, fee) : null;
  } catch { quoteError = 'Beställningen överstiger beloppsgränsen. Minska antal eller kontakta oss för en offert.'; }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(old => ({ ...old, [key]: value }));
  }
  function chooseMode(value: 'paket' | 'bygg') {
    setMode(value); setError('');
    set('guests', Math.max(form.guests, value === 'bygg' ? customMinimum : menu?.min_people || 1));
  }
  function validationError() {
    if (quoteError) return quoteError;
    if ((!custom && !menu) || (custom && !items.length)) return 'Välj ett cateringpaket eller minst en maträtt.';
    const minimum = custom ? customMinimum : menu?.min_people || 1;
    if (!validGuests || form.guests < minimum) return `Välj mellan ${minimum} och 1 000 personer.`;
    if (!total || total.total_ore <= 0) return 'Priserna behöver fastställas av ägaren innan beställning.';
    return '';
  }
  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const message = validationError();
    if (message) return setError(message);
    if (step === 2) {
      if (!form.event_date || !form.event_time) return setError('Välj datum och tid.');
      if (form.fulfillment === 'delivery' && !canDeliver) return setError('Leverans är inte tillgänglig. Välj hämtning.');
      if (form.fulfillment === 'pickup' && !settings.pickup_enabled) return setError('Hämtning är inte tillgänglig. Kontakta oss.');
      if (form.fulfillment === 'delivery' && (!form.address || !form.city || !form.postal_code)) return setError('Ange fullständig leveransadress.');
      if (form.fulfillment === 'delivery' && !zone) return setError('Postnumret ligger utanför våra leveranszoner. Välj hämtning eller kontakta oss.');
      if (!availableMethods.includes(form.payment_preference)) return setError('Välj ett tillgängligt betalningssätt eller välj hämtning.');
    }
    setStep(old => Math.min(old + 1, 3));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!enabled) return setError('Beställningar är inte aktiverade. Ägaren behöver godkänna priser och företagsinställningar.');
    const message = validationError();
    if (message) return setError(message);
    if (!availableMethods.includes(form.payment_preference)) return setError('Välj ett tillgängligt betalningssätt.');
    setSending(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, menu_id: custom ? undefined : form.menu_id,
          items: custom ? items : undefined, delivery_zone_id: form.fulfillment === 'delivery' ? zone?.id : undefined })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Kunde inte skicka förfrågan.');
      setTracking(result.tracking_url);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Ett oväntat fel inträffade.'); }
    finally { setSending(false); }
  }

  if (tracking) return <div className="order-panel form-success" role="status">
    <h2>Tack! Vi har fått din förfrågan.</h2><p>Vi granskar den och skickar en bekräftelse. Du betalar först efter godkännande.</p>
    <a href={tracking} className="btn btn-primary">Följ din beställning →</a>
  </div>;

  return <div className="form-layout">
    <div className="order-panel"><span className="eyebrow">STEG {step} AV 3</span>
      {step === 1 && <form onSubmit={next}>
        <h2>1. Välj din mat</h2>
        <div className="catalog-tabs" role="group" aria-label="Menytyp">
          <button type="button" aria-pressed={!custom} className={!custom ? 'active' : ''} onClick={() => chooseMode('paket')}>Färdiga paket</button>
          <button type="button" aria-pressed={custom} className={custom ? 'active' : ''} onClick={() => chooseMode('bygg')}>Bygg din meny</button>
        </div>
        <div className="field"><label htmlFor="guests">Antal personer</label>
          <input id="guests" type="number" required min={custom ? customMinimum : menu?.min_people || 1} max="1000"
            value={form.guests} onChange={event => set('guests', Number(event.target.value))}/></div>
        <strong>Vad planerar du?</strong>
        <div className="form-choice">{([['hemma', 'Hemma'], ['fest', 'Fest'], ['foretag', 'Företag']] as const).map(([value, label]) =>
          <label className="choice" key={value}><input type="radio" name="occasion" checked={form.occasion === value}
            onChange={() => set('occasion', value)}/>{label}</label>)}</div>
        {!custom ? <div className="field"><label htmlFor="menu">Välj färdigt cateringpaket</label>
          <select id="menu" value={form.menu_id} onChange={event => {
            const chosen = menus.find(item => item.id === event.target.value);
            if (chosen) setForm(old => ({ ...old, menu_id: chosen.id, guests: Math.max(old.guests, chosen.min_people) }));
          }} required><option value="">Välj paket</option>{menus.map(item => <option key={item.id} value={item.id}>
            {item.title} · {item.price_ore ? `${formatSek(item.price_ore)}/person` : 'Pris på förfrågan'}</option>)}</select>
          {menu && <p className="field-hint">{menu.description}<br/>Innehåller: {menu.included.join(', ')}.<br/>
            Allergener: {menu.allergens.join(', ') || 'Fråga oss före beställning'}.</p>}
        </div> : <><p className="field-hint">Välj dina rätter och mängder. Portionsförslagen är kökets vägledning.</p>
          <ItemPicker dishes={dishes} guests={form.guests} quantities={quantities}
            onQuantityChange={(id, quantity) => setQuantities(old => ({ ...old, [id]: quantity }))}/></>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit">Nästa: Datum och plats →</button>
      </form>}
      {step === 2 && <form onSubmit={next}>
        <h2>2. Datum och plats</h2>
        <div className="field-grid">
          <div className="field"><label htmlFor="date">Datum</label><input id="date" type="date" required value={form.event_date} onChange={event => set('event_date', event.target.value)}/></div>
          <div className="field"><label htmlFor="time">Tid</label><input id="time" type="time" required value={form.event_time} onChange={event => set('event_time', event.target.value)}/></div>
        </div>
        <p className="field-hint">Beställ minst {settings.min_advance_days} dagar i förväg. Vi bekräftar tillgängligheten.</p>
        <strong>Leverans eller hämtning</strong>
        <div className="form-choice">
          {canDeliver && <label className="choice"><input type="radio" name="fulfillment" checked={form.fulfillment === 'delivery'} onChange={() => {
            set('fulfillment', 'delivery');
            if (form.payment_preference === 'cash') set('payment_preference', paymentMethods.find(method => method !== 'cash')!);
          }}/>Hemleverans</label>}
          {settings.pickup_enabled && <label className="choice"><input type="radio" name="fulfillment" checked={form.fulfillment === 'pickup'} onChange={() => set('fulfillment', 'pickup')}/>Hämtning</label>}
        </div>
        {!canDeliver && settings.delivery_enabled && <p className="field-hint">Leverans öppnar när leveranszoner och onlinebetalning är konfigurerade. Kontanter erbjuds enbart vid hämtning.</p>}
        {form.fulfillment === 'delivery' ? <>
          <div className="field"><label htmlFor="address">Adress</label><input id="address" required maxLength={220} value={form.address} onChange={event => set('address', event.target.value)} placeholder="Gata och nummer"/></div>
          <div className="field-grid">
            <div className="field"><label htmlFor="postal">Postnummer</label><input id="postal" required maxLength={15} value={form.postal_code} onChange={event => set('postal_code', event.target.value)} placeholder="722 12"/></div>
            <div className="field"><label htmlFor="city">Ort</label><input id="city" required maxLength={100} value={form.city} onChange={event => set('city', event.target.value)}/></div>
          </div>
          <p className="field-hint">{zone ? `Leveransavgift: ${formatSek(fee)} (${zone.name}). Ingår i totalpriset.` : 'Ange postnummer för att se leveranszon och avgift.'}</p>
        </> : <p className="preview-note">Hämtning på överenskommen plats: {settings.pickup_address || 'Adress meddelas vid bekräftelse.'}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="btn" onClick={() => setStep(1)}>← Tillbaka</button>
          <button type="submit" className="btn btn-primary">Nästa: Kontakt →</button></div>
      </form>}
      {step === 3 && <form onSubmit={submit}>
        <h2>3. Skicka förfrågan</h2>
        <div className="field"><label htmlFor="name">Namn</label><input id="name" required autoComplete="name" maxLength={120} value={form.full_name} onChange={event => set('full_name', event.target.value)}/></div>
        <div className="field-grid">
          <div className="field"><label htmlFor="email">E-post</label><input id="email" type="email" required autoComplete="email" value={form.email} onChange={event => set('email', event.target.value)}/></div>
          <div className="field"><label htmlFor="phone">Telefon</label><input id="phone" type="tel" required autoComplete="tel" value={form.phone} onChange={event => set('phone', event.target.value)}/></div>
        </div>
        <div className="field"><label htmlFor="notes">Önskemål eller allergier (frivilligt)</label><textarea id="notes" maxLength={1000} value={form.notes} onChange={event => set('notes', event.target.value)}/></div>
        <strong>Hur vill du betala efter godkännande?</strong>
        <div className="form-choice">{availableMethods.map(value => <label className="choice" key={value}>
          <input type="radio" name="payment" checked={form.payment_preference === value} onChange={() => set('payment_preference', value)}/>{paymentLabels[value]}</label>)}</div>
        <p className="field-hint">Du betalar inte nu. Ägaren godkänner först och skickar en säker betalningslänk. Kontant betalas endast vid hämtning.</p>
        <label className="checkbox-label"><input type="checkbox" required checked={form.terms_accepted} onChange={event => set('terms_accepted', event.target.checked)}/>
          <span>Jag godkänner <a className="text-link" href="/villkor" target="_blank" rel="noopener noreferrer">beställningsvillkoren</a> och har läst <a className="text-link" href="/integritet" target="_blank" rel="noopener noreferrer">integritetspolicyn</a>.</span></label>
        <div hidden aria-hidden="true"><label htmlFor="website">Lämna tomt</label><input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={event => set('website', event.target.value)}/></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="btn" onClick={() => setStep(2)}>← Tillbaka</button>
          <button type="submit" className="btn btn-primary" disabled={!enabled || sending || !!quoteError || !availableMethods.includes(form.payment_preference)}>{sending ? 'Skickar...' : 'Skicka förfrågan →'}</button></div>
        {!enabled && <p className="preview-note">Förhandsvisning – beställningarna öppnar när ägaren godkänt priser och företagsinställningar.</p>}
      </form>}
    </div>
    <aside className="form-sidebar"><span className="eyebrow">DIN CATERING</span>
      <h3>{custom ? 'Din egen meny' : menu?.title || 'Välj ett paket'}</h3>
      <p>{form.guests} personer · {form.occasion === 'foretag' ? 'Företag' : form.occasion === 'fest' ? 'Fest' : 'Hemma'}</p>
      {custom && selected.length > 0 && <div className="summary-lines">{selected.map(dish => <div key={dish.id}>
        <span>{quantities[dish.id]} × {dish.title} ({formatSek(dish.price_ore)}/{dish.portion_label})</span>
        <strong>{formatSek(quantities[dish.id] * dish.price_ore)}</strong></div>)}</div>}
      <div className="summary-list">
        <span>Mat</span><strong>{total ? formatSek(total.subtotal_ore) : 'Ej fastställt'}</strong>
        <span>Leverans{zone ? ` (${zone.name})` : ''}</span><strong>{form.fulfillment === 'pickup' ? 'Hämtning: 0 kr' : zone ? formatSek(fee) : 'Ange postnummer'}</strong>
        <span className="total">{deliveryPending ? 'Mat totalt' : 'Totalt'}</span><strong className="total">{total ? formatSek(total.total_ore) : '–'}</strong>
        <span>{deliveryPending ? 'Mat per person' : 'Per person'} ({form.guests})</span><strong>{total ? formatSek(Math.round(total.total_ore / form.guests)) : '–'}</strong>
      </div>
      {quoteError && <p className="form-error" role="alert">{quoteError}</p>}
      <p className="field-hint">{deliveryPending ? 'Leveransavgift tillkommer när du angett postnummer. ' : ''}Det är en gemensam beställning. Ägaren bekräftar slutpriset innan betalning.</p>
    </aside>
  </div>;
}
