'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { OpeningHours, SchedulingSettings, SpecialOpeningHours } from '@yehabibi/shared';

const weekdays = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
const timeFields = [
  ['opens_at', 'Öppnar'], ['closes_at', 'Stänger'], ['cutoff_at', 'Köket slutar ta emot'],
  ['pickup_from', 'Hämtning från'], ['pickup_until', 'Hämtning till'],
  ['delivery_from', 'Leverans från'], ['delivery_until', 'Leverans till']
] as const;

function completeWeek(settings: SchedulingSettings): SchedulingSettings {
  return { ...settings, weekly_hours: [1, 2, 3, 4, 5, 6, 0].map(weekday => settings.weekly_hours.find(row => row.weekday === weekday) || {
    weekday, closed: true, opens_at: '10:00', closes_at: '20:00', cutoff_at: '19:00', pickup_from: '10:00', pickup_until: '20:00', delivery_from: '10:00', delivery_until: '20:00'
  }) };
}

function HoursEditor({ hours, id, onChange }: {
  hours: OpeningHours | SpecialOpeningHours; id: string;
  onChange: (key: 'closed' | typeof timeFields[number][0], value: string | boolean) => void;
}) {
  return <><label className="checkbox-label"><input type="checkbox" checked={hours.closed} onChange={event => onChange('closed', event.target.checked)}/>Stängt hela dagen</label>
    {!hours.closed && <div className="schedule-times">{timeFields.map(([key, label]) => <div className="field" key={key}>
      <label htmlFor={`${id}-${key}`}>{label}</label><input id={`${id}-${key}`} type="time" required value={hours[key]} onChange={event => onChange(key, event.target.value)}/>
    </div>)}</div>}</>;
}

export function AdminScheduling() {
  const [settings, setSettings] = useState<SchedulingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void fetch('/api/admin/scheduling', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Tidsinställningarna kunde inte läsas.');
      if (!controller.signal.aborted) setSettings(completeWeek(data.scheduling));
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Tidsinställningarna kunde inte läsas.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  function field<K extends keyof SchedulingSettings>(key: K, value: SchedulingSettings[K]) {
    setSettings(old => old ? { ...old, [key]: value } : old);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!settings || busy) return; setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/scheduling', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Kunde inte spara tidsinställningarna.');
      setSettings(completeWeek(data.scheduling)); setMessage('Tider och kapacitet är sparade. Webb och Expo använder samma inställningar.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunde inte spara.'); }
    finally { setBusy(false); }
  }
  if (loading) return <p role="status">Hämtar tider och kapacitet…</p>;
  if (!settings) return <div className="admin-panel"><p className="form-error" role="alert">{error || 'Tidsinställningarna saknas.'}</p><button type="button" className="btn" onClick={() => setReload(value => value + 1)}>Försök igen</button></div>;
  return <form className="admin-panel" onSubmit={save}><h2>Tider och kapacitet</h2>
    <p className="admin-note">Alla öppettider gäller Europe/Stockholm. Servern beräknar lediga tider och reserverar kapacitet när ordern sparas.</p>
    <fieldset className="plain-fieldset" disabled={busy}>
      <label className="checkbox-label"><input type="checkbox" checked={settings.enabled} onChange={event => field('enabled', event.target.checked)}/>Aktivera direktbeställningar</label>
      <label className="checkbox-label"><input type="checkbox" checked={settings.paused} onChange={event => field('paused', event.target.checked)}/>Pausa nya direktbeställningar tillfälligt</label>
      <label className="checkbox-label"><input type="checkbox" checked={settings.auto_approve} onChange={event => field('auto_approve', event.target.checked)}/>Godkänn direktbeställningar automatiskt</label>
      <p className="field-hint">Automatiskt godkännande öppnar kundens separata betalningssteg. Det startar ingen betalning eller produktion. Catering granskas som tidigare. Publika riktiga beställningar kräver dessutom en godkänd företagsmiljö.</p>
      <div className="field-grid">{([
        ['interval_minutes', 'Bokningsintervall (minuter)', 5, 120], ['min_advance_minutes', 'Minsta framförhållning (minuter)', 0, 10080],
        ['capacity_per_slot', 'Max beställningar per tidsintervall', 1, 1000], ['capacity_buffer_minutes', 'Kökets kapacitetsbuffert (minuter)', 0, 1440],
        ['max_days_ahead', 'Visa tider så här många dagar framåt', 1, 30]
      ] as const).map(([key, label, min, max]) => <div className="field" key={key}><label htmlFor={`schedule-${key}`}>{label}</label><input id={`schedule-${key}`} required type="number" min={min} max={max} value={settings[key]} onChange={event => field(key, Number(event.target.value))}/></div>)}</div>
      <h3>Öppettider per veckodag</h3>
      <p className="field-hint">Dagar utan sparade öppettider börjar som stängda. Kontrollera samtliga tider innan du öppnar en dag. Stängning senast vid öppning betyder nästa dygn. Tider före öppning räknas då också till nästa dygn. Datumavvikelser nedan ersätter veckodagens tider.</p>
      {settings.weekly_hours.map((hours, index) => <details className="schedule-day" key={hours.weekday}><summary>{weekdays[hours.weekday]} <span>{hours.closed ? 'Stängt' : `${hours.opens_at}–${hours.closes_at}`}</span></summary>
        <HoursEditor hours={hours} id={`weekly-${hours.weekday}`} onChange={(key, value) => field('weekly_hours', settings.weekly_hours.map((row, position) => position === index ? { ...row, [key]: value } : row))}/>
      </details>)}
      <h3>Särskilda öppettider och stängda datum</h3>
      {settings.special_hours.map((hours, index) => <div className="schedule-special" key={index}><div className="field"><label htmlFor={`special-${index}`}>Datum i Stockholm</label><input id={`special-${index}`} type="date" required value={hours.date} onChange={event => field('special_hours', settings.special_hours.map((row, position) => position === index ? { ...row, date: event.target.value } : row))}/></div>
        <HoursEditor hours={hours} id={`special-${index}`} onChange={(key, value) => field('special_hours', settings.special_hours.map((row, position) => position === index ? { ...row, [key]: value } : row))}/>
        <button type="button" className="text-link" onClick={() => field('special_hours', settings.special_hours.filter((_, position) => position !== index))}>Ta bort datumavvikelse</button>
      </div>)}
      <button type="button" className="btn" onClick={() => {
        const source = settings.weekly_hours.find(row => !row.closed) || settings.weekly_hours[0];
        if (source) { const { weekday: _weekday, ...hours } = source; field('special_hours', [...settings.special_hours, { ...hours, date: '', closed: true }]); }
      }}>Lägg till särskilt datum</button>
      <h3>Stäng ett tidsintervall</h3>
      <p className="field-hint">Ange exakta tider med UTC-offset, till exempel 2026-10-20T12:00:00+02:00. Under vintertid används +01:00. Offset gör även omställningsdygn entydiga. Ett stängt intervall påverkar nya beställningar; befintliga ordrar finns kvar.</p>
      {settings.blocked_slots.map((blocked, index) => <div className="schedule-special" key={index}><div className="field-grid">{(['starts_at', 'ends_at'] as const).map(key => <div className="field" key={key}><label htmlFor={`blocked-${index}-${key}`}>{key === 'starts_at' ? 'Från (med UTC-offset)' : 'Till (med UTC-offset)'}</label><input id={`blocked-${index}-${key}`} required type="text" placeholder="2026-10-20T12:00:00+02:00" value={blocked[key]} onChange={event => field('blocked_slots', settings.blocked_slots.map((row, position) => position === index ? { ...row, [key]: event.target.value } : row))}/></div>)}</div><button className="text-link" type="button" onClick={() => field('blocked_slots', settings.blocked_slots.filter((_, position) => position !== index))}>Öppna intervallet igen</button></div>)}
      <button type="button" className="btn" onClick={() => field('blocked_slots', [...settings.blocked_slots, { starts_at: '', ends_at: '' }])}>Lägg till stängt intervall</button>
      <p className="admin-note">Tillagningstid ställs in per paket under Menyer. Leveransområden, avgifter och företagets transportbuffert finns under Kampanjer & leverans.</p>
      <button type="submit" className="btn btn-primary">{busy ? 'Sparar…' : 'Spara tider och kapacitet'}</button>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="preview-note" role="status">{message}</p>}
  </form>;
}
