'use client';
import { useEffect,useState } from 'react';
import { formatScheduledTime,type CapacityReservation } from '@yehabibi/shared';
type Zone={id:string;name:string};
const initial={resource:'kitchen' as 'kitchen'|'delivery',zone_id:'',starts_at:'',ends_at:'',units:1,reason:''};
export function AdminCapacity() {
  const [holds,setHolds]=useState<CapacityReservation[]>([]),[zones,setZones]=useState<Zone[]>([]);
  const [draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function load(signal?:AbortSignal) {
    const response=await fetch('/api/admin/capacity',{cache:'no-store',signal}),data=await response.json();
    if(!response.ok)throw new Error(data.error||'Kunde inte läsa kapaciteten.');setHolds(data.holds);setZones(data.zones);
  }
  useEffect(()=>{const controller=new AbortController();void load(controller.signal).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});return()=>controller.abort();},[]);
  async function save(event:React.FormEvent) {
    event.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');
    try {
      const response=await fetch('/api/admin/capacity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...draft,zone_id:draft.resource==='delivery'&&draft.zone_id?draft.zone_id:null})}),data=await response.json();
      if(!response.ok)throw new Error(data.error||'Bokningen kunde inte sparas.');await load();setDraft(initial);setMessage('Manuell kapacitet är bokad. Nya kundordrar räknar med den.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Kunde inte spara.');}finally{setBusy(false);}
  }
  async function release(id:string) {
    if(busy)return;setBusy(true);setError('');setMessage('');
    try {const response=await fetch('/api/admin/capacity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'release',id})}),data=await response.json();if(!response.ok)throw new Error(data.error);await load();setMessage('Den manuella kapaciteten är frigjord.');}
    catch(reason){setError(reason instanceof Error?reason.message:'Kunde inte frigöra kapaciteten.');}finally{setBusy(false);}
  }
  return <section className="admin-panel"><h2>Manuell kapacitet och belastning</h2><p className="admin-note">Registrera telefonbeställningar och arbete utanför systemet. Direktordrar och godkänd catering räknas automatiskt. Manuella bokningar räknas atomärt mot samma kapacitet.</p>
    <form onSubmit={save}><fieldset className="plain-fieldset" disabled={busy}><div className="field-grid"><div className="field"><label htmlFor="hold-resource">Resurs</label><select id="hold-resource" value={draft.resource} onChange={event=>setDraft(old=>({...old,resource:event.target.value as 'kitchen'|'delivery'}))}><option value="kitchen">Kök</option><option value="delivery">Leverans</option></select></div><div className="field"><label htmlFor="hold-units">Kapacitetsenheter</label><input id="hold-units" type="number" required min={1} max={1000} value={draft.units} onChange={event=>setDraft(old=>({...old,units:Number(event.target.value)}))}/></div></div>
      {draft.resource==='delivery'&&<div className="field"><label htmlFor="hold-zone">Leveranszon (frivillig)</label><select id="hold-zone" value={draft.zone_id} onChange={event=>setDraft(old=>({...old,zone_id:event.target.value}))}><option value="">Gemensam leveranskapacitet</option>{zones.map(zone=><option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></div>}
      <div className="field-grid">{(['starts_at','ends_at'] as const).map(key=><div className="field" key={key}><label htmlFor={`hold-${key}`}>{key==='starts_at'?'Från':'Till'} (ISO med UTC-offset)</label><input id={`hold-${key}`} required value={draft[key]} placeholder="2026-10-20T12:00:00+02:00" onChange={event=>setDraft(old=>({...old,[key]:event.target.value}))}/></div>)}</div>
      <div className="field"><label htmlFor="hold-reason">Orsak / intern referens</label><input id="hold-reason" required minLength={3} maxLength={300} value={draft.reason} onChange={event=>setDraft(old=>({...old,reason:event.target.value}))}/></div><p className="field-hint">Europe/Stockholm: +02:00 sommartid och +01:00 vintertid. För en telefonorder med leverans, boka både köks- och leveransarbete.</p><button className="btn btn-primary" type="submit">Boka manuell kapacitet</button></fieldset></form>
    {error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="preview-note" role="status">{message}</p>}
    <h3>Aktiva och kommande reservationer</h3><p className="admin-note">Visar högst 300 reservationer i tidsordning. Endast manuella bokningar frigörs här; kundordrar hanteras under Beställningar.</p>
    {!holds.length?<p>Inga aktiva reservationer.</p>:<table className="admin-table"><thead><tr><th>Tid</th><th>Resurs / ursprung</th><th>Kapacitet</th><th>Referens / åtgärd</th></tr></thead><tbody>{holds.map(hold=><tr key={hold.id}><td>{formatScheduledTime(hold.starts_at)}<br/>{formatScheduledTime(hold.ends_at)}</td><td>{hold.resource==='kitchen'?'Kök':'Leverans'} · {hold.source==='manual'?'Manuell':hold.source==='direct'?'Direktorder':'Catering'}{hold.zone_id&&<><br/>{zones.find(zone=>zone.id===hold.zone_id)?.name}</>}</td><td>{hold.units} · {hold.state==='held'?'Tillfällig':'Bekräftad'}</td><td>{hold.reason||hold.order_id}{hold.source==='manual'&&<button type="button" className="btn" disabled={busy} onClick={()=>release(hold.id)}>Frigör</button>}</td></tr>)}</tbody></table>}
  </section>;
}
