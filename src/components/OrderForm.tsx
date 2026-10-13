'use client';

import { useMemo, useState } from 'react';
import type { Fulfillment, Menu, Occasion, PaymentPreference, Settings } from '@/types/domain';
import { calcTotal, formatSek, paymentLabels } from '@/lib/domain';

type Props = { menus: Menu[]; settings: Settings; initialMenu?: string; initialOccasion?: string; enabled: boolean; swishEnabled: boolean };

type FormState = {
  menu_id: string; guests: number; occasion: Occasion;
  event_date: string; event_time: string; fulfillment: Fulfillment;
  address: string; postal_code: string; city: string;
  full_name: string; email: string; phone: string; notes: string;
  payment_preference: PaymentPreference; terms_accepted: boolean; website: string;
};

export function OrderForm({ menus, settings, initialMenu, initialOccasion, enabled, swishEnabled }: Props) {
  const firstMenu = menus.find(menu => menu.id === initialMenu) || menus[0];
  const firstOccasion: Occasion = initialOccasion === 'fest' || initialOccasion === 'foretag' ? initialOccasion : 'hemma';
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({
    menu_id: firstMenu?.id || '', guests: firstMenu?.min_people || 10, occasion: firstOccasion,
    event_date: '', event_time: '12:00', fulfillment: settings.delivery_enabled ? 'delivery' : 'pickup', address: '', postal_code: '', city: settings.location_city,
    full_name: '', email: '', phone: '', notes: '', payment_preference: 'card', terms_accepted: false, website: ''
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState('');

  const menu = useMemo(() => menus.find(item => item.id === form.menu_id), [menus, form.menu_id]);
  const total = menu && Number.isSafeInteger(form.guests) && form.guests >= 1 ? calcTotal(menu.price_ore, form.guests, form.fulfillment, settings.delivery_fee_ore) : null;
  function set<K extends keyof FormState>(key: K, value: FormState[K]) { setForm(old => ({ ...old, [key]: value })); }

  function next(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!menu) return setError('Välj en cateringmeny.');
    if (form.guests < menu.min_people || form.guests > 1000) return setError(`Minst ${menu.min_people} personer krävs för denna meny.`);
    if (step === 2) {
      if (!form.event_date || !form.event_time) return setError('Välj datum och tid.');
      if (form.fulfillment === 'delivery' && (!form.address || !form.city || !form.postal_code)) return setError('Ange fullständig leveransadress.');
      if (form.payment_preference === 'cash' && form.fulfillment !== 'pickup') set('payment_preference', 'card');
    }
    setStep(previous => Math.min(previous + 1, 3));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!enabled) return setError('Beställningar är inte aktiverade. Ägaren behöver slutföra företagsinställningarna.');
    setSending(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
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
        }} required><option value="">Välj meny</option>{menus.map(menu => <option key={menu.id} value={menu.id}>{menu.title} · {menu.price_ore ? formatSek(menu.price_ore) + '/person' : 'Pris på förfrågan'}</option>)}</select></div>
        {menu && <p className="muted">{menu.description}<br/><small>Innehåller: {menu.included.join(', ')}. Allergener: {menu.allergens.join(', ') || 'Kontakta oss'}.</small></p>}
        <div className="field"><label htmlFor="guests">Antal personer</label><input type="number" id="guests" value={form.guests} min={menu?.min_people || 1} max="1000" onChange={event => set('guests', Number(event.target.value))} required/></div>
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
        <div className="form-choice">{settings.delivery_enabled && <label className="choice"><input type="radio" name="fulfillment" checked={form.fulfillment === 'delivery'} onChange={() => set('fulfillment', 'delivery')}/>Leverans</label>}{settings.pickup_enabled && <label className="choice"><input type="radio" name="fulfillment" checked={form.fulfillment === 'pickup'} onChange={() => set('fulfillment', 'pickup')}/>Hämtning</label>}</div>
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
        <div className="form-choice">{(['swish','card','apple_pay','cash'] as const).filter(value => (value !== 'cash' || (form.fulfillment === 'pickup' && settings.cash_enabled)) && (value !== 'swish' || swishEnabled)).map(value => <label className="choice" key={value}><input type="radio" checked={form.payment_preference === value} onChange={() => set('payment_preference', value)}/>{paymentLabels[value]}</label>)}</div>
        <p className="field-hint">Du betalar inte nu. Du får en säker betalningslänk efter att ägaren godkänt beställningen. Kontant betalas enbart vid hämtning.</p>
        <label className="checkbox-label"><input type="checkbox" checked={form.terms_accepted} onChange={event => set('terms_accepted', event.target.checked)} required/><span>Jag har läst <a className="text-link" href="/villkor" target="_blank">beställningsvillkoren</a> och <a className="text-link" href="/integritet" target="_blank">integritetspolicyn</a> och godkänner att min förfrågan behandlas.</span></label>
        <div style={{ display: 'none' }} aria-hidden="true"><label htmlFor="website">Lämna tomt</label><input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={event => set('website',event.target.value)}/></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions" style={{marginTop:22}}><button type="button" className="btn" onClick={() => setStep(2)}>← Tillbaka</button><button className="btn btn-primary" type="submit" disabled={!enabled || sending}>{sending ? 'Skickar...' : 'Skicka förfrågan →'}</button></div>
        {!enabled && <p className="preview-note">Förhandsvisning – ägaren måste aktivera databasen, priser, betalningar och villkor före riktiga beställningar.</p>}
      </form>}
    </div>
    <aside className="form-sidebar"><span className="eyebrow">DIN CATERING</span><h3>{menu?.title || 'Välj en meny'}</h3><p>{form.guests} personer · {form.occasion === 'foretag' ? 'Företag' : form.occasion === 'fest' ? 'Fest' : 'Hemma'}</p><div className="divider"/>
      <div className="summary-list"><span>Pris per person</span><strong>{menu && menu.price_ore ? formatSek(menu.price_ore) : 'Ej fastställt'}</strong><span>Antal gäster</span><strong>{form.guests}</strong><span>Leverans</span><strong>{form.fulfillment === 'delivery' ? formatSek(settings.delivery_fee_ore) : 'Hämtning'}</strong><span className="total">Totalt</span><strong className="total">{total && menu?.price_ore ? formatSek(total.total_ore) : 'Efter offert'}</strong></div>
      <div className="divider"/><p className="field-hint">Priset bygger på ägarens publicerade meny och bekräftas innan betalning. Cateringbeställningar accepteras efter manuell granskning.</p>
    </aside>
  </div>;
}
