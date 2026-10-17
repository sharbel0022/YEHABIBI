'use client';

import { useMemo, useState } from 'react';
import type { DeliveryZone, Dish, Fulfillment, Menu, Occasion, PaymentPreference, Settings } from '@/types/domain';
import { calcDishTotal, calcTotal, findDeliveryZone, formatSek, paymentLabels } from '@/lib/domain';

type Props = { menus: Menu[]; dishes: Dish[]; zones: DeliveryZone[]; settings: Settings; initialMenu?: string; initialOccasion?: string; enabled: boolean; paymentMethods: PaymentPreference[] };

type FormState = {
  menu_id: string; guests: number; occasion: Occasion;
  event_date: string; event_time: string; fulfillment: Fulfillment;
  address: string; postal_code: string; city: string;
  full_name: string; email: string; phone: string; notes: string;
  payment_preference: PaymentPreference; terms_accepted: boolean; website: string;
};

export function OrderForm({ menus, dishes, zones, settings, initialMenu, initialOccasion, enabled, paymentMethods }: Props) {
  const canDeliver = settings.delivery_enabled && zones.length > 0 && paymentMethods.some(method => method !== 'cash');
  const firstMenu = menus.find(menu => menu.id === initialMenu) || menus[0];
  const firstOccasion: Occasion = initialOccasion === 'fest' || initialOccasion === 'foretag' ? initialOccasion : 'hemma';
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({
    menu_id: initialMenu === 'egen' ? 'egen' : firstMenu?.id || '', guests: firstMenu?.min_people || 10, occasion: firstOccasion,
    event_date: '', event_time: '12:00', fulfillment: canDeliver ? 'delivery' : 'pickup', address: '', postal_code: '', city: settings.location_city,
    full_name: '', email: '', phone: '', notes: '', payment_preference: paymentMethods.find(method => method !== 'cash') || paymentMethods[0] || 'card', terms_accepted: false, website: ''
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const menu = useMemo(() => menus.find(item => item.id === form.menu_id), [menus, form.menu_id]);
  const custom = form.menu_id === 'egen';
  const items = dishes.filter(dish => quantities[dish.id] > 0).map(dish => ({ dish_id: dish.id, quantity: quantities[dish.id] }));
  const zone = findDeliveryZone(zones, form.postal_code);
  const fee = zone?.fee_ore ?? 0;
  const validGuests = Number.isSafeInteger(form.guests) && form.guests >= 1 && form.guests <= 1000;
  let total: ReturnType<typeof calcTotal> | null = null;
  let quoteError = '';
  try {
    if (validGuests) total = custom && items.length ? calcDishTotal(items, dishes, form.guests, form.fulfillment, fee) : !custom && menu ? calcTotal(menu.price_ore, form.guests, form.fulfillment, fee) : null;
  } catch { quoteError = 'Beställningen överstiger beloppsgränsen. Minska antal eller kontakta oss för en offert.'; }
  const availableMethods = paymentMethods.filter(method => method !== 'cash' || (form.fulfillment === 'pickup' && settings.cash_enabled));
  function set<K extends keyof FormState>(key: K, value: FormState[K]) { setForm(old => ({ ...old, [key]: value })); }

  function next(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (quoteError) return setError(quoteError);
    if ((!custom && !menu) || (custom && !items.length)) return setError('Välj ett cateringpaket eller minst en maträtt.');
    if (!validGuests || form.guests < (custom ? 1 : menu?.min_people || 1)) return setError(`Välj mellan ${custom ? 1 : menu?.min_people || 1} och 1 000 personer.`);
    if (step === 2) {
      if (!form.event_date || !form.event_time) return setError('Välj datum och tid.');
      if (form.fulfillment === 'delivery' && (!form.address || !form.city || !form.postal_code)) return setError('Ange fullständig leveransadress.');
      if (form.fulfillment === 'delivery' && zones.length && !zone) return setError('Postnumret ligger utanför våra leveranszoner. Välj hämtning eller kontakta oss.');
      if (!availableMethods.includes(form.payment_preference)) return setError('Välj ett tillgängligt betalningssätt eller välj hämtning.');
    }
    setStep(previous => Math.min(previous + 1, 3));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!enabled) return setError('Beställningar är inte aktiverade. Ägaren behöver slutföra företagsinställningarna.');
    if (quoteError || !total || (!custom && !menu?.price_ore)) return setError(quoteError || 'Menyns priser är ännu inte fastställda.');
    if (!availableMethods.includes(form.payment_preference)) return setError('Välj ett tillgängligt betalningssätt.');
    setSending(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, menu_id: custom ? undefined : form.menu_id, items: custom ? items : undefined, delivery_zone_id: form.fulfillment === 'delivery' ? zone?.id : undefined })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Kunde inte skicka din förfrågan.');
      setTracking(result.tracking_url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ett oväntat fel inträffade.');
    } finally { setSending(false); }
  }

  if (tracking) return <div className="order-panel form-success" role="status">
    <h2>Vi har fått din förfrågan!</h2>
    <p>Ägaren granskar den nu. Du får en bekräftelse innan betalning.</p>
    <a className="btn btn-primary" href={tracking}>Följ din beställning →</a>
  </div>;

  return <div className="form-layout">
    <div className="order-panel">
      <div className="eyebrow">STEG {step} AV 3</div>
      {step === 1 && <form onSubmit={next}>
        <h2>1. Välj din meny</h2>
        <div className="field"><label htmlFor="menu">Cateringpaket</label><select id="menu" value={form.menu_id} onChange={event => {
          const chosen = menus.find(item => item.id === event.target.value);
          if (chosen) setForm(old => ({ ...old, menu_id: chosen.id, guests: Math.max(old.guests, chosen.min_people) }));
          else if (event.target.value === 'egen') set('menu_id', 'egen');
        }} required><option value="">Välj meny</option>{menus.map(menu => <option key={menu.id} value={menu.id}>{menu.title} · {menu.price_ore ? formatSek(menu.price_ore) + '/person' : 'Pris på förfrågan'}</option>)}{dishes.length > 0 && <option value="egen">Bygg din egen catering</option>}</select></div>
        {menu && <p className="muted">{menu.description}<br/><small>Innehåller: {menu.included.join(', ')}. Allergener: {menu.allergens.join(', ') || 'Kontakta oss'}.</small></p>}
        <div className="field"><label htmlFor="guests">Antal personer</label><input type="number" id="guests" value={form.guests} min={custom ? 1 : menu?.min_people || 1} max="1000" onChange={event => set('guests', Number(event.target.value))} required/></div>
        {custom && <div className="dish-list">{dishes.map(dish => <div className="dish-row" key={dish.id}>
          {dish.image_url && <img src={dish.image_url} alt={dish.title} width={84} height={84} loading="lazy"/>}
          <div><strong>{dish.title}</strong><p>{dish.description}</p><small>{dish.price_ore > 0 ? `${formatSek(dish.price_ore)}/${dish.portion_label}` : 'Styckpris fastställs av ägaren'} · Allergener: {dish.allergens.join(', ') || 'Kontakta oss'}</small>
            <div className="quantity"><button type="button" className="btn" aria-label={`Minska ${dish.title}`} disabled={!quantities[dish.id]} onClick={() => setQuantities(old => ({ ...old, [dish.id]: Math.max(0, (old[dish.id] || 0) - 1) }))}>−</button><output aria-live="polite">{quantities[dish.id] || 0}</output><button type="button" className="btn" aria-label={`Öka ${dish.title}`} disabled={dish.price_ore <= 0 || quantities[dish.id] >= 1000} onClick={() => setQuantities(old => ({ ...old, [dish.id]: (old[dish.id] || 0) + 1 }))}>+</button><strong>{dish.price_ore > 0 ? formatSek(dish.price_ore * (quantities[dish.id] || 0)) : 'Ej fastställt'}</strong></div>
          </div></div>)}</div>}
        <strong>Vad planerar du?</strong>
        <div className="form-choice">{([['hemma','Hemma'],['fest','Fest'],['foretag','Företag']] as const).map(([value,label]) => <label className="choice" key={value}><input type="radio" name="occasion" checked={form.occasion === value} onChange={() => set('occasion', value)}/>{label}</label>)}</div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit">Nästa: Datum och plats →</button>
      </form>}
      {step === 2 && <form onSubmit={next}>
        <h2>2. Datum och plats</h2>
        <div className="field-grid"><div className="field"><label htmlFor="date">Datum</label><input type="date" id="date" required value={form.event_date} onChange={event => set('event_date', event.target.value)}/></div><div className="field"><label htmlFor="time">Tid</label><input type="time" id="time" required value={form.event_time} onChange={event => set('event_time', event.target.value)}/></div></div>
        <p className="field-hint">Beställ minst {settings.min_advance_days} dagar i förväg. Datum måste bekräftas av ägaren.</p>
        <strong>Hur vill du få maten?</strong>
        <div className="form-choice">{canDeliver && <label className="choice"><input type="radio" name="fulfillment" checked={form.fulfillment === 'delivery'} onChange={() => {set('fulfillment', 'delivery'); if(form.payment_preference === 'cash') set('payment_preference', paymentMethods.find(method => method !== 'cash')!);}}/>Leverans</label>}{settings.pickup_enabled && <label className="choice"><input type="radio" name="fulfillment" checked={form.fulfillment === 'pickup'} onChange={() => set('fulfillment', 'pickup')}/>Hämtning</label>}</div>
        {!canDeliver && settings.delivery_enabled && <p className="field-hint">Leverans öppnar när leveranszoner och onlinebetalning är konfigurerade. Kontanter erbjuds enbart vid hämtning.</p>}
        {form.fulfillment === 'delivery' && <><div className="field"><label htmlFor="address">Adress</label><input id="address" required maxLength={220} value={form.address} onChange={event => set('address', event.target.value)} placeholder="Gata och nummer"/></div><div className="field-grid"><div className="field"><label htmlFor="post">Postnummer</label><input id="post" required value={form.postal_code} maxLength={15} onChange={event => set('postal_code', event.target.value)}/></div><div className="field"><label htmlFor="city">Ort</label><input id="city" required value={form.city} maxLength={100} onChange={event => set('city', event.target.value)}/></div></div></>}
        {form.fulfillment === 'pickup' && <p className="preview-note">Hämtning sker på överenskommen plats efter att din förfrågan godkänts. {settings.pickup_address}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="btn" onClick={() => setStep(1)}>← Tillbaka</button><button type="submit" className="btn btn-primary">Nästa: Kontakt →</button></div>
      </form>}
      {step === 3 && <form onSubmit={submit}>
        <h2>3. Kontakt och betalningsval</h2>
        <div className="field"><label htmlFor="name">Namn</label><input id="name" required autoComplete="name" maxLength={120} value={form.full_name} onChange={event => set('full_name', event.target.value)}/></div>
        <div className="field-grid"><div className="field"><label htmlFor="email">E-post</label><input id="email" type="email" required autoComplete="email" value={form.email} onChange={event => set('email', event.target.value)}/></div><div className="field"><label htmlFor="phone">Telefon</label><input id="phone" type="tel" required autoComplete="tel" value={form.phone} onChange={event => set('phone', event.target.value)}/></div></div>
        <div className="field"><label htmlFor="notes">Önskemål eller allergier (frivilligt)</label><textarea id="notes" maxLength={1000} value={form.notes} onChange={event => set('notes', event.target.value)} placeholder="Berätta gärna om ditt evenemang..."/></div>
        <strong>Hur vill du betala efter godkännande?</strong>
        <div className="form-choice">{availableMethods.map(value => <label className="choice" key={value}><input type="radio" checked={form.payment_preference === value} onChange={() => set('payment_preference', value)}/>{paymentLabels[value]}</label>)}</div>
        <p className="field-hint">Du betalar inte nu. Du får en säker betalningslänk efter att ägaren godkänt beställningen. Kontant betalas enbart vid hämtning.</p>
        <label className="checkbox-label"><input type="checkbox" checked={form.terms_accepted} onChange={event => set('terms_accepted', event.target.checked)} required/><span>Jag har läst <a className="text-link" href="/villkor" target="_blank">beställningsvillkoren</a> och <a className="text-link" href="/integritet" target="_blank">integritetspolicyn</a> och godkänner att min förfrågan behandlas.</span></label>
        <div style={{ display: 'none' }} aria-hidden="true"><label htmlFor="website">Lämna tomt</label><input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={event => set('website',event.target.value)}/></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions" style={{marginTop:22}}><button type="button" className="btn" onClick={() => setStep(2)}>← Tillbaka</button><button className="btn btn-primary" type="submit" disabled={!enabled || sending || !!quoteError || !availableMethods.includes(form.payment_preference)}>{sending ? 'Skickar...' : 'Skicka förfrågan →'}</button></div>
        {!enabled && <p className="preview-note">Förhandsvisning – ägaren måste aktivera databasen, priser, betalningar och villkor före riktiga beställningar.</p>}
      </form>}
    </div>
    <aside className="form-sidebar"><span className="eyebrow">DIN CATERING</span><h3>{custom ? 'Egen catering' : menu?.title || 'Välj en meny'}</h3><p>{form.guests} personer · {form.occasion === 'foretag' ? 'Företag' : form.occasion === 'fest' ? 'Fest' : 'Hemma'}</p><div className="divider"/>
      <div className="summary-list"><span>Pris per person</span><strong>{total && (custom || menu?.price_ore) ? formatSek(total.subtotal_ore / form.guests) : 'Ej fastställt'}</strong><span>Antal gäster</span><strong>{form.guests}</strong><span>Leverans{zone ? ` (${zone.name})` : ''}</span><strong>{form.fulfillment === 'delivery' ? formatSek(fee) : 'Hämtning'}</strong><span className="total">Totalt</span><strong className="total">{total && (custom || menu?.price_ore) ? formatSek(total.total_ore) : 'Efter offert'}</strong></div>
      {quoteError && <p className="form-error" role="alert">{quoteError}</p>}<div className="divider"/><p className="field-hint">Priset bygger på ägarens publicerade meny och bekräftas innan betalning. Cateringbeställningar accepteras efter manuell granskning.</p>
    </aside>
  </div>;
}
