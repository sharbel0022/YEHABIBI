'use client';

import {useMemo,useState} from 'react';
import {ItemPicker} from '@/components/ItemPicker';
import type {Fulfillment,Menu,MenuItem,Occasion,PaymentPreference,Settings} from '@/types/domain';
import {calcItemsTotal,calcTotal,deliveryFeeFor,formatSek,paymentLabels} from '@/lib/domain';

type Props = {
  menus:Menu[]; items:MenuItem[]; settings:Settings; enabled:boolean; swishEnabled:boolean;
  initialMenu?:string; initialOccasion?:string; initialMode?:string;
  initialItems?:string; initialGuests?:string;
};
type FormState = {
  menu_id:string; guests:number; occasion:Occasion;
  event_date:string;event_time:string;fulfillment:Fulfillment;
  address:string;postal_code:string;city:string;
  full_name:string;email:string;phone:string;notes:string;
  payment_preference:PaymentPreference;terms_accepted:boolean;website:string;
};

/** The customer can request a package OR pick individual dishes. No payment is taken here. */
export function OrderForm({
  menus,items,settings,enabled,swishEnabled,initialMenu,initialOccasion,
  initialMode,initialItems,initialGuests
}:Props) {
  const firstMenu=menus.find(menu=>menu.id===initialMenu)||menus[0];
  const startCustom=initialMode==='bygg'||!!initialItems||!firstMenu;
  const firstOccasion:Occasion=initialOccasion==='fest'||initialOccasion==='foretag'?initialOccasion:'hemma';
  const chosenCount=Number(initialGuests);
  const startGuests=Number.isSafeInteger(chosenCount)&&chosenCount>=1&&chosenCount<=1000
    ? chosenCount : startCustom?Math.max(settings.custom_min_people,6):firstMenu?.min_people||10;
  const initialQuantities:Record<string,number>={};
  for(const part of (initialItems||'').split(',').slice(0,40)) {
    const [id,n]=part.split(':');
    const quantity=Number(n);
    if(items.some(item=>item.id===id)&&Number.isSafeInteger(quantity)&&quantity>=1&&quantity<=100) {
      initialQuantities[id]=quantity;
    }
  }
  const [mode,setMode]=useState<'paket'|'bygg'>(startCustom?'bygg':'paket');
  const [quantities,setQuantities]=useState<Record<string,number>>(initialQuantities);
  const [step,setStep]=useState(1);
  const [form,setForm]=useState<FormState>({
    menu_id:firstMenu?.id||'',guests:startGuests,occasion:firstOccasion,
    event_date:'',event_time:'12:00',fulfillment:settings.delivery_enabled?'delivery':'pickup',
    address:'',postal_code:'',city:settings.location_city,
    full_name:'',email:'',phone:'',notes:'',payment_preference:'card',
    terms_accepted:false,website:''
  });
  const [sending,setSending]=useState(false);
  const [error,setError]=useState('');
  const [tracking,setTracking]=useState('');
  const menu=menus.find(item=>item.id===form.menu_id);
  const selected=useMemo(()=>items.filter(item=>(quantities[item.id]||0)>0).map(item=>({
    ...item,quantity:quantities[item.id]
  })),[items,quantities]);
  const deliveryFee=deliveryFeeFor(form.postal_code,settings.delivery_fee_ore,settings.delivery_zones||[]);
  const total=useMemo(()=>{
    try {
      if(mode==='bygg')return selected.length?calcItemsTotal(selected.map(item=>({
        unit_price_ore:item.unit_price_ore,quantity:item.quantity
      })),form.guests,form.fulfillment,deliveryFee):null;
      return menu?{...calcTotal(menu.price_ore,form.guests,form.fulfillment,deliveryFee),
        per_person_ore:Math.round((menu.price_ore*form.guests+(form.fulfillment==='delivery'?deliveryFee:0))/form.guests)}:null;
    }catch{return null;}
  },[mode,selected,form.guests,form.fulfillment,deliveryFee,menu]);

  function set<K extends keyof FormState>(key:K,value:FormState[K]){
    setForm(old=>({...old,[key]:value}));
  }
  function chooseMode(next:'paket'|'bygg'){
    setMode(next);
    setError('');
    setForm(old=>({...old,guests:next==='paket'
      ?Math.max(old.guests,menu?.min_people||10)
      :Math.max(old.guests,settings.custom_min_people)}));
  }
  function changeQuantity(itemId:string,quantity:number){
    setQuantities(old=>({...old,[itemId]:quantity}));
  }
  function next(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError('');
    if(step===1){
      if(mode==='paket'&&(!menu||form.guests<menu.min_people)) {
        return setError(`Välj ett paket för minst ${menu?.min_people||1} personer.`);
      }
      if(mode==='bygg'&&(!selected.length||form.guests<settings.custom_min_people)) {
        return setError(`Välj maträtter och minst ${settings.custom_min_people} personer.`);
      }
      if(!total||total.total_ore<=0||!Number.isSafeInteger(total.total_ore)) {
        return setError('Kontrollera antal och priser.');
      }
    }
    if(step===2){
      if(!form.event_date||!form.event_time)return setError('Välj datum och tid.');
      if(form.fulfillment==='delivery'&&(!form.address||!form.city||!form.postal_code)) {
        return setError('Fyll i en fullständig leveransadress.');
      }
      if(form.fulfillment==='delivery'&&form.payment_preference==='cash')set('payment_preference','card');
    }
    setStep(old=>Math.min(old+1,3));
  }

  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError('');
    if(!enabled)return setError('Beställningar är inte aktiverade. Ägaren måste först godkänna priser och företagsinställningar.');
    if(!total||total.total_ore<=0)return setError('Lägg till rätter med godkända priser.');
    setSending(true);
    try {
      const payload={
        ...form,
        menu_id:mode==='paket'?form.menu_id:null,
        items:mode==='bygg'?selected.map(item=>({item_id:item.id,quantity:item.quantity})):undefined
      };
      const response=await fetch('/api/orders',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Kunde inte skicka förfrågan.');
      setTracking(result.tracking_url);
    }catch(e){setError(e instanceof Error?e.message:'Ett oväntat fel inträffade.');}
    finally{setSending(false);}
  }

  if(tracking)return <div className="order-panel form-success" role="status">
    <h2>Tack! Vi har fått din förfrågan.</h2>
    <p>Vi granskar den och skickar en bekräftelse. Du betalar först efter godkännande.</p>
    <a href={tracking} className="btn btn-primary">Följ din beställning →</a>
  </div>;

  return <div className="form-layout">
    <div className="order-panel">
      <span className="eyebrow">STEG {step} AV 3</span>
      {step===1&&<form onSubmit={next}>
        <h2>1. Välj din mat</h2>
        <div className="catalog-tabs" role="group" aria-label="Menytyp">
          <button type="button" aria-pressed={mode==='paket'} className={mode==='paket'?'active':''} onClick={()=>chooseMode('paket')}>Färdiga paket</button>
          <button type="button" aria-pressed={mode==='bygg'} className={mode==='bygg'?'active':''} onClick={()=>chooseMode('bygg')}>Bygg din meny</button>
        </div>
        <div className="field"><label htmlFor="guests">Antal personer</label>
          <input id="guests" type="number" required min={mode==='bygg'?settings.custom_min_people:menu?.min_people||1} max="1000" value={form.guests}
            onChange={e=>set('guests',Number(e.target.value))}/>
        </div>
        <strong>Vart ska maten?</strong>
        <div className="form-choice">
          {([['hemma','Hemma'],['fest','Fest'],['foretag','Företag']] as const).map(([value,label])=>
            <label key={value} className="choice"><input type="radio" name="occasion" checked={form.occasion===value}
              onChange={()=>set('occasion',value)}/>{label}</label>)}
        </div>
        {mode==='paket'?<div className="field">
          <label htmlFor="menu">Välj färdigt cateringpaket</label>
          <select id="menu" value={form.menu_id} onChange={e=>{
            const chosen=menus.find(menu=>menu.id===e.target.value);
            if(chosen)setForm(old=>({...old,menu_id:chosen.id,guests:Math.max(old.guests,chosen.min_people)}));
          }}><option value="">Välj paket</option>
            {menus.map(menu=><option key={menu.id} value={menu.id}>{menu.title} – {menu.price_ore?formatSek(menu.price_ore)+'/person':'Pris på förfrågan'}</option>)}
          </select>
          {menu&&<p className="field-hint">{menu.description}<br/>Allergener: {menu.allergens.join(', ')||'Fråga oss'}.</p>}
        </div>:<>
          <p className="field-hint">Lägg till ostrullar, hummus, grill och andra rätter. Du bestämmer mängden.</p>
          <ItemPicker items={items} guests={form.guests} quantities={quantities} onQuantityChange={changeQuantity}/>
        </>}
        {error&&<p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary">Nästa: Datum och plats →</button>
      </form>}
      {step===2&&<form onSubmit={next}>
        <h2>2. Datum och plats</h2>
        <div className="field-grid">
          <div className="field"><label htmlFor="date">Datum</label><input type="date" required id="date" value={form.event_date} onChange={e=>set('event_date',e.target.value)}/></div>
          <div className="field"><label htmlFor="time">Tid</label><input type="time" required id="time" value={form.event_time} onChange={e=>set('event_time',e.target.value)}/></div>
        </div>
        <p className="field-hint">Beställ minst {settings.min_advance_days} dagar i förväg. Vi bekräftar tillgängligheten.</p>
        <strong>Leverans eller hämtning</strong>
        <div className="form-choice">
          {settings.delivery_enabled&&<label className="choice"><input type="radio" checked={form.fulfillment==='delivery'} onChange={()=>set('fulfillment','delivery')}/>Hemleverans</label>}
          {settings.pickup_enabled&&<label className="choice"><input type="radio" checked={form.fulfillment==='pickup'}
            onChange={()=>setForm(old=>({...old,fulfillment:'pickup'}))}/>Hämtning</label>}
        </div>
        {form.fulfillment==='delivery'?<>
          <div className="field"><label htmlFor="address">Adress</label><input id="address" required maxLength={220} value={form.address} onChange={e=>set('address',e.target.value)} placeholder="Gata och nummer"/></div>
          <div className="field-grid">
            <div className="field"><label htmlFor="postal">Postnummer</label><input id="postal" required maxLength={15} value={form.postal_code} onChange={e=>set('postal_code',e.target.value)} placeholder="722 12"/></div>
            <div className="field"><label htmlFor="city">Ort</label><input id="city" required maxLength={100} value={form.city} onChange={e=>set('city',e.target.value)}/></div>
          </div>
          <p className="field-hint">Beräknad leveransavgift: {formatSek(deliveryFee)}. Avgiften ingår i totalpriset.</p>
        </>:<p className="preview-note">Hämtning på överenskommen plats: {settings.pickup_address||'Adress meddelas vid bekräftelse.'}</p>}
        {error&&<p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="btn" onClick={()=>setStep(1)}>← Tillbaka</button>
          <button type="submit" className="btn btn-primary">Nästa: Kontakt →</button></div>
      </form>}
      {step===3&&<form onSubmit={submit}>
        <h2>3. Skicka förfrågan</h2>
        <div className="field"><label htmlFor="name">Namn</label><input id="name" required autoComplete="name" maxLength={120} value={form.full_name} onChange={e=>set('full_name',e.target.value)}/></div>
        <div className="field-grid">
          <div className="field"><label htmlFor="email">E-post</label><input id="email" type="email" required autoComplete="email" value={form.email} onChange={e=>set('email',e.target.value)}/></div>
          <div className="field"><label htmlFor="phone">Telefon</label><input id="phone" type="tel" required autoComplete="tel" value={form.phone} onChange={e=>set('phone',e.target.value)}/></div>
        </div>
        <div className="field"><label htmlFor="notes">Önskemål eller allergier (frivilligt)</label>
          <textarea id="notes" maxLength={1000} value={form.notes} onChange={e=>set('notes',e.target.value)}/></div>
        <strong>Hur vill du betala efter godkännande?</strong>
        <div className="form-choice">{(['swish','card','apple_pay','cash'] as const)
          .filter(value=>(value!=='cash'||(form.fulfillment==='pickup'&&settings.cash_enabled))&&
            (value!=='swish'||swishEnabled))
          .map(value=><label key={value} className="choice">
            <input type="radio" checked={form.payment_preference===value} onChange={()=>set('payment_preference',value)}/>{paymentLabels[value]}
          </label>)}</div>
        <p className="field-hint">Inga pengar dras nu. Ägaren godkänner först och skickar en säker betalningslänk. Kontant betalas endast vid hämtning.</p>
        <label className="checkbox-label"><input type="checkbox" required checked={form.terms_accepted} onChange={e=>set('terms_accepted',e.target.checked)}/>
          <span>Jag godkänner <a className="text-link" href="/villkor" target="_blank">beställningsvillkoren</a> och har läst <a className="text-link" href="/integritet" target="_blank">integritetspolicyn</a>.</span>
        </label>
        <div style={{display:'none'}} aria-hidden="true"><label htmlFor="website">Lämna tomt</label><input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={e=>set('website',e.target.value)}/></div>
        {error&&<p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="btn" onClick={()=>setStep(2)}>← Tillbaka</button>
          <button type="submit" className="btn btn-primary" disabled={!enabled||sending}>{sending?'Skickar...':'Skicka förfrågan →'}</button></div>
        {!enabled&&<p className="preview-note">Förhandsvisning – inga beställningar skickas innan ägaren aktiverat systemet.</p>}
      </form>}
    </div>
    <aside className="form-sidebar">
      <span className="eyebrow">DIN CATERING</span>
      <h3>{mode==='bygg'?'Din egen meny':menu?.title||'Välj ett paket'}</h3>
      <p>{form.guests} personer · {form.occasion==='foretag'?'Företag':form.occasion==='fest'?'Fest':'Hemma'}</p>
      <div className="divider"/>
      {mode==='bygg'&&selected.length>0&&<div className="summary-lines">
        {selected.map(item=><div key={item.id}><span>{item.quantity} × {item.title} ({formatSek(item.unit_price_ore)})</span>
          <strong>{formatSek(item.quantity*item.unit_price_ore)}</strong></div>)}
      </div>}
      <div className="summary-list">
        <span>Mat</span><strong>{total?formatSek(total.subtotal_ore):'Välj maträtter'}</strong>
        <span>Leverans</span><strong>{form.fulfillment==='delivery'?formatSek(deliveryFee):'Hämtning: 0 kr'}</strong>
        <span className="total">Totalt</span><strong className="total">{total?formatSek(total.total_ore):'–'}</strong>
        <span>Per person ({form.guests})</span><strong>{total?formatSek(total.per_person_ore):'–'}</strong>
      </div>
      <p className="field-hint">Priset per person är en jämförelse. Alla betalar för en gemensam order, och slutpriset bekräftas av ägaren.</p>
    </aside>
  </div>;
}
