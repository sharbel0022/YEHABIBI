"use client";
import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, Mail, X } from "lucide-react";
import type { HospitalityCatalog } from "@yehabibi/shared";
import { DishPhoto } from "@/components/catering/DishPhoto";
import { QuantityStepper } from "@/components/catering/QuantityStepper";
import { useCateringSelection } from "@/components/catering/useCateringSelection";
import { inquiryHref, menuArtwork } from "@/components/catering/presentation";
import styles from "./CateringInquiry.module.css";

export function CateringInquiry({catalog, initialMenuIds=[], initialDishIds=[], initialQuantities, restoreDraft=false, emailReady=false}: {
 catalog: HospitalityCatalog; initialMenuIds?:string[]; initialDishIds?:string[]; initialQuantities?:Record<string,number>; restoreDraft?:boolean; emailReady?:boolean;
}) {
 const id=useId();
 const {menuIds,quantities,setMenuIds,setDishQuantity}=useCateringSelection({catalog,initialMenuIds,initialDishIds,initialQuantities,restoreDraft});
 const [people,setPeople]=useState(10);
 const [fulfillment,setFulfillment]=useState('pickup');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [receipt,setReceipt]=useState('');
 const startedAt=useRef(Date.now());
 const pending=useRef({fingerprint:'',requestId:''});
 const lock=useRef(false);
 const menus=catalog.menus.filter(menu=>menu.pricePerPerson!==null&&menuIds.includes(menu.id));
 const dishes=catalog.dishes.filter(dish=>quantities[dish.id]>0);
 const hasChoices=menus.some(menu=>menu.pricePerPerson!==null)||dishes.length>0;
 const base=menus.reduce((sum,menu)=>sum+(menu.pricePerPerson||0)*people,0);
 const quote=dishes.length>0||menus.some(menu=>menu.pricePerPerson===null);
 const plockHref=inquiryHref(menuIds,dishes.map(dish=>dish.id),quantities).replace('/catering/forfragan','/catering/plockmeny');
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault(); if(lock.current)return;
  setError(''); if(!hasChoices){setError('Välj en meny eller minst en rätt innan du skickar.');return;}
  const form=new FormData(event.currentTarget);
  const fields={name:String(form.get('name')||''),email:String(form.get('email')||''),phone:String(form.get('phone')||''),people:Number(form.get('people')),date:String(form.get('date')||''),time:String(form.get('time')||''),fulfillment:String(form.get('fulfillment')||'pickup'),address:String(form.get('address')||''),message:String(form.get('message')||''),allergies:String(form.get('allergies')||''),website:String(form.get('website')||''),menuIds:menus.map(menu=>menu.id),dishQuantities:quantities};
  const fingerprint=JSON.stringify(fields);
  if(pending.current.fingerprint!==fingerprint)pending.current={fingerprint,requestId:crypto.randomUUID()};
  lock.current=true;setBusy(true);
  try{
   const response=await fetch('/api/catering/inquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,requestId:pending.current.requestId,startedAt:startedAt.current}),signal:AbortSignal.timeout(15000)});
   const data=await response.json();
   if(!response.ok||data.ok!==true||!data.reference)throw new Error(data.error||'Förfrågan kunde inte skickas. Försök igen.');
   setReceipt(data.reference);
  }catch(e){setError(e instanceof Error&&e.name!=='TimeoutError'&&e.name!=='AbortError'?e.message:'Vi kunde inte bekräfta utskicket. Dina uppgifter finns kvar. Försök igen med samma förfrågan.');}
  finally{lock.current=false;setBusy(false);}
 }
 if(receipt)return <section className={styles.success} aria-live="polite"><Check size={36} aria-hidden="true"/><span className={styles.eyebrow}>TACK FÖR DIN FÖRFRÅGAN</span><h2>Förfrågan skickad</h2><p>Mejltjänsten har tagit emot din förfrågan till sharbelrasho@gmail.com. Vi återkommer med bekräftelse av datum, innehåll och pris.</p><p>Referens: <strong>{receipt}</strong></p><p>Du betalar på plats. Ingen betalning har dragits.</p><Link href="/catering">Till cateringmenyerna</Link></section>;
 return <div className={styles.checkout}>
  <ol className={styles.steps} aria-label="Steg i förfrågan"><li><Check size={15} aria-hidden="true"/>Välj meny</li><li aria-current="step">2. Dina uppgifter</li><li>3. Bekräftelse</li></ol>
  <div className={styles.columns}>
   <form className={styles.form} onSubmit={submit} aria-busy={busy}>
    <fieldset disabled={busy}>
     <h2>Dina uppgifter</h2><p className={styles.hint}>Fyll i en cateringförfrågan. Vi bekräftar beställningen personligen.</p>
     <div className={styles.fieldGrid}>
      <label>Namn<input name="name" autoComplete="name" required minLength={2} maxLength={120}/></label>
      <label>E-postadress<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
      <label>Telefonnummer<input name="phone" type="tel" autoComplete="tel" required minLength={7} maxLength={30}/></label>
      <label>Antal personer<input name="people" type="number" min="1" max="1000" required value={people} onChange={event=>setPeople(event.currentTarget.valueAsNumber||0)}/></label>
     </div>
     <h2>Ditt tillfälle</h2>
     <div className={styles.fieldGrid}>
      <label>Önskat datum<input name="date" type="date" min={today} required/></label>
      <label>Önskad tid<input name="time" type="time" required/></label>
     </div>
     <label>Hämtning eller leverans<select name="fulfillment" value={fulfillment} onChange={event=>setFulfillment(event.currentTarget.value)}><option value="pickup">Hämtning</option><option value="delivery">Önskar leverans</option></select></label>
     {fulfillment==='delivery'&&<label>Leveransadress<input name="address" autoComplete="street-address" required maxLength={300}/><small>Leveransmöjlighet och eventuell avgift bekräftas av oss.</small></label>}
     <label>Meddelande<textarea name="message" rows={3} maxLength={2000} placeholder="Berätta om tillfället och eventuella önskemål."/></label>
     <label>Allergier och specialkost <small>(valfritt)</small><textarea name="allergies" rows={2} maxLength={1000} placeholder="Ange bara information som behövs för maten, utan personnamn."/></label>
     <label className={styles.trap} aria-hidden="true">Webbplats<input name="website" tabIndex={-1} autoComplete="off"/></label>
     <p className={styles.payment}><Check size={17} aria-hidden="true"/><span><strong>Betalning på plats</strong><br/>Förfrågan skickas först. Vi bekräftar pris och tillgänglighet innan beställningen blir klar.</span></p>
     <p className={styles.hint}>När du skickar använder vi uppgifterna för att hantera din förfrågan. <Link href="/integritet">Läs om personuppgifter</Link>.</p>
     {!emailReady&&<p className={styles.notice} role="status">Formuläret är tillfälligt stängt för utskick. Du kan göra dina val och kontakta oss på {catalog.contact.phone} {catalog.contact.emailVerified && catalog.contact.email ? <>eller via <a href={'mailto:'+catalog.contact.email}>mejl</a></> : null}.</p>}
     {error&&<p className={styles.error} role="alert">{error}</p>}
     <button type="submit" className={styles.primary} disabled={busy||!emailReady||!hasChoices}><Mail size={18} aria-hidden="true"/>{busy?'Skickar…':'Skicka förfrågan'}</button>
     <p className={styles.hint}>Till sharbelrasho@gmail.com · Du betalar på plats</p>
    </fieldset>
   </form>
   <aside className={styles.summary} aria-labelledby={id+'-choices'}>
    <span className={styles.eyebrow}>DIN CATERING</span><h2 id={id+'-choices'}>Dina val</h2>
    <fieldset disabled={busy}>
     <ul className={styles.items}>
      {menus.map(menu=><li key={menu.id}><img src={menuArtwork[menu.id]||menu.image} alt="" width={76} height={57}/><div><strong>{menu.name}</strong><small>{menu.pricePerPerson===null?'Pris enligt offert':String(menu.pricePerPerson)+' kr/person'}</small></div><button type="button" className={styles.remove} aria-label={'Ta bort '+menu.name} onClick={()=>setMenuIds(menuIds.filter(value=>value!==menu.id))}><X size={17}/></button></li>)}
      {dishes.map(dish=><li className={styles.dish} key={dish.id}><DishPhoto name={dish.name} className={styles.photo}/><div><strong>{dish.name}</strong><small>{quantities[dish.id]} × önskat antal</small></div><button type="button" className={styles.remove} aria-label={'Ta bort '+dish.name} onClick={()=>setDishQuantity(dish.id,0)}><X size={17}/></button><div className={styles.quantity}><QuantityStepper value={quantities[dish.id]} onChange={value=>setDishQuantity(dish.id,value)} label={dish.name} min={1}/></div></li>)}
     </ul>
    </fieldset>
    {!hasChoices&&<p>Din sammanställning är tom. Välj en meny eller lägg till rätter.</p>}
    <div className={styles.total}><span>{menus.length ? 'Menypris för '+(people||0)+' personer' : 'Plockmeny'}</span><strong>{menus.length ? base.toLocaleString('sv-SE')+' kr' : 'Pris enligt offert'}</strong></div>
    {quote&&<p className={styles.hint}>Plockrätter och eventuella tillägg: pris enligt offert. Ingen slutlig totalsumma är fastställd ännu.</p>}
    <p className={styles.hint}>Vi bekräftar alla priser, portioner och eventuell leveransavgift.</p>
    <div className={styles.links}><Link href={plockHref}><ArrowLeft size={15}/>Lägg till rätter</Link><Link href="/catering">Ändra menyval</Link></div>
   </aside>
  </div>
 </div>;
}
