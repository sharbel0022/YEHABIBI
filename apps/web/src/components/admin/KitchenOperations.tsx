'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
type Operations = { server_now:string; paused:boolean; buffer_minutes:number; alerts:{id:string;code:string}[] };
export function KitchenOperations() {
  const router=useRouter();
  const [state,setState]=useState<Operations|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch('/api/admin/kitchen',{cache:'no-store',signal});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||'Köksmottagningen kunde inte kontrolleras.');
    setState(data);
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    void refresh(controller.signal).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    const timer=window.setInterval(()=>{
      if(document.hidden) return;
      void refresh(controller.signal).then(()=>router.refresh()).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    },30000);
    return ()=>{controller.abort();window.clearInterval(timer);};
  },[refresh,router]);
  async function control(action:'pause'|'resume'|'delay',minutes?:number) {
    if(busy)return;setBusy(true);setError('');
    try {
      const response=await fetch('/api/admin/scheduling',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,minutes})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Köksinställningen kunde inte sparas.');
      await refresh();router.refresh();
    } catch(reason){setError(reason instanceof Error?reason.message:'Åtgärden misslyckades.');}
    finally{setBusy(false);}
  }
  return <div className="admin-panel"><h2>Kökets mottagning</h2>
    <p role="status">{state ? `${state.paused?'Nya direktordrar är pausade':'Mottagning av nya direktordrar följer öppettiderna'} · Extra väntetid ${state.buffer_minutes} min` : 'Kontrollerar kökets mottagning…'}</p>
    {state?.alerts.length ? <div className="form-error" role="alert"><strong>{state.alerts.length} beställningar behöver uppmärksammas.</strong><p>Kvittera varje order nedan efter kontroll. En automatisk paus hävs endast av köket.</p><p>{state.alerts.map(alert=>`#${alert.code}`).join(', ')}</p></div> : null}
    <div className="kitchen-controls"><button className="btn btn-accent" disabled={busy||!state} type="button" onClick={()=>control(state?.paused?'resume':'pause')}>{state?.paused?'Återuppta nya beställningar':'Pausa nya beställningar'}</button>
      <button className="btn" disabled={busy||!state} type="button" onClick={()=>control('delay',15)}>Öka väntetiden +15 min</button>
      <button className="btn" disabled={busy||!state||!state.buffer_minutes} type="button" onClick={()=>control('delay',-15)}>Minska väntetiden −15 min</button>
      <button className="btn" disabled={busy} type="button" onClick={()=>{setError('');void refresh().then(()=>router.refresh()).catch(reason=>setError(reason.message));}}>Uppdatera order</button></div>
    <p className="admin-note">Paus och väntetid gäller nya beställningar. Bekräftade kundtider ändras inte. Sidan kontrollerar mottagningen var 30:e sekund; serverns orderkontroll fungerar även när sidan är stängd.</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div>;
}
