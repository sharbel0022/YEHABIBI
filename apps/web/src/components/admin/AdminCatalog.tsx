'use client';
import { useState } from 'react';
import type { Campaign, DeliveryZone, Dish, ItemCategory, Menu } from '@/types/domain';
import { formatSek } from '@/lib/domain';
import { uploadAdminFile } from '@/lib/browser-upload';

type Kind = 'dishes' | 'campaigns' | 'delivery_zones';
type CatalogItem = Dish | Campaign | DeliveryZone;
type Draft = {
  id?:string; title:string; description:string; price:string; allergens:string; portion_label:string;
  media_url:string; active:boolean; sort_order:number; starts_at:string; ends_at:string; menu_ids:string[]; postal_prefixes:string;
  category:ItemCategory; suggested_per_person:number;
  direct_enabled:boolean; travel_minutes:string;
  direct_addon_enabled:boolean;kitchen_units:number;preparation_minutes:number;
  capacity_per_slot:number;max_package_quantity:number;delivery_window_minutes:number;
  order_cutoff_at:string;fulfillment_dates:string;quantity_limit:string;
};
function draftFor(item?:CatalogItem):Draft {
  return {id:item?.id,title:item ? ('title' in item ? item.title : item.name) : '',description:item && 'description' in item ? item.description : '',
    price:item ? String(('price_ore' in item ? item.price_ore : 'fee_ore' in item ? item.fee_ore : 0)/100) : '',
    allergens:item && 'allergens' in item ? item.allergens.join(', ') : '',portion_label:item && 'portion_label' in item ? item.portion_label : '1 portion',
    media_url:item && 'image_url' in item ? item.image_url || '' : item && 'media_url' in item ? item.media_url || '' : '',active:item?.active ?? false,
    sort_order:item && 'sort_order' in item ? item.sort_order : 10,
    starts_at:item && 'starts_at' in item ? item.starts_at : new Date().toISOString(),
    ends_at:item && 'ends_at' in item ? item.ends_at : new Date(Date.now()+7*86400000).toISOString(),
    menu_ids:item && 'menu_ids' in item ? item.menu_ids : [],postal_prefixes:item && 'postal_prefixes' in item ? item.postal_prefixes.join(', ') : '',
    category:item && 'category' in item ? item.category||'kalla_meze' : 'kalla_meze',suggested_per_person:item && 'suggested_per_person' in item ? item.suggested_per_person||0 : 0,
    direct_enabled:item && 'direct_enabled' in item ? item.direct_enabled === true : false,
    travel_minutes:item && 'travel_minutes' in item && item.travel_minutes != null ? String(item.travel_minutes) : '',
    direct_addon_enabled:item&&'direct_addon_enabled'in item?item.direct_addon_enabled===true:false,kitchen_units:item&&'kitchen_units'in item?item.kitchen_units??1:1,preparation_minutes:item&&'preparation_minutes'in item?item.preparation_minutes??0:0,
    capacity_per_slot:item&&'capacity_per_slot'in item?item.capacity_per_slot??4:4,max_package_quantity:item&&'max_package_quantity'in item?item.max_package_quantity??20:20,delivery_window_minutes:item&&'delivery_window_minutes'in item?item.delivery_window_minutes??15:15,
    order_cutoff_at:item&&'order_cutoff_at'in item?item.order_cutoff_at||'':'',fulfillment_dates:item&&'fulfillment_dates'in item?item.fulfillment_dates?.join(', ')||'':'',quantity_limit:item&&'quantity_limit'in item&&item.quantity_limit!=null?String(item.quantity_limit):''};
}
const titles:Record<Kind,string> = {dishes:'Maträtter',campaigns:'Kampanjer',delivery_zones:'Leveranszoner'};
const split = (value:string) => value.split(',').map(part=>part.trim()).filter(Boolean);

export function AdminCatalog({initialDishes,initialCampaigns,initialZones,menus,allowedKinds=['dishes','campaigns','delivery_zones']}:{initialDishes:Dish[];initialCampaigns:Campaign[];initialZones:DeliveryZone[];menus:Pick<Menu,'id'|'title'>[];allowedKinds?:Kind[]}) {
  const [records,setRecords] = useState<Record<Kind,CatalogItem[]>>({dishes:initialDishes,campaigns:initialCampaigns,delivery_zones:initialZones});
  const [kind,setKind] = useState<Kind>(allowedKinds[0]);
  const [draft,setDraft] = useState<Draft|null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [failed,setFailed] = useState(false);
  const [pushToken,setPushToken] = useState('');
  function update(field:keyof Draft,value:Draft[keyof Draft]) { setDraft(old=>old ? {...old,[field]:value} : old); }
  async function saveItem(value?:Record<string,unknown>,id?:string,archive=false) {
    if(busy)return;setBusy(true);setMessage('');setFailed(false);
    try {
      const response = await fetch('/api/admin/catalog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,id,archive,value})});
      const data = await response.json();
      if(!response.ok) throw new Error(data.error || 'Kunde inte spara.');
      setRecords(old=>({...old,[kind]:[...old[kind].filter(item=>item.id!==data.item.id),data.item]}));
      setDraft(null);setMessage('Sparat. Samma katalog används av Expo och hemsidan.');
    } catch(error) { setFailed(true);setMessage(error instanceof Error ? error.message : 'Kunde inte spara.'); }
    finally { setBusy(false); }
  }
  async function save(event:React.FormEvent) {
    event.preventDefault(); if(!draft || busy) return;
    try {
    const amount = Number(draft.price.replace(',','.'));
    if(kind!=='campaigns' && (!Number.isFinite(amount) || amount<0 || !draft.price.trim())) throw new Error('Ange ett giltigt pris i kronor.');
    if(kind==='dishes' && draft.active && amount<=0) throw new Error('Ange ett godkänt pris större än 0 kr innan rätten publiceras.');
    if(kind==='campaigns' && (!draft.starts_at || !draft.ends_at || Date.parse(draft.ends_at)<=Date.parse(draft.starts_at))) throw new Error('Välj ett slutdatum efter startdatumet.');
    const travel = draft.travel_minutes.trim() ? Number(draft.travel_minutes) : null;
    if (kind === 'delivery_zones' && travel !== null && (!Number.isInteger(travel) || travel < 0 || travel > 480)) throw new Error('Ange en bekräftad transporttid i hela minuter mellan 0 och 480, eller lämna tomt.');
    const common = {active:draft.active};
    const value = kind==='dishes' ? {...common,title:draft.title,description:draft.description,price_ore:Math.round(amount*100),allergens:split(draft.allergens),portion_label:draft.portion_label,image_url:draft.media_url||null,sort_order:draft.sort_order,category:draft.category,suggested_per_person:draft.suggested_per_person,direct_addon_enabled:draft.direct_addon_enabled,kitchen_units:draft.kitchen_units,preparation_minutes:draft.preparation_minutes}
      : kind==='delivery_zones' ? {...common,name:draft.title,postal_prefixes:split(draft.postal_prefixes),fee_ore:Math.round(amount*100),direct_enabled:draft.direct_enabled,travel_minutes:travel,capacity_per_slot:draft.capacity_per_slot,max_package_quantity:draft.max_package_quantity,delivery_window_minutes:draft.delivery_window_minutes}
      : {...common,title:draft.title,description:draft.description,media_url:draft.media_url||null,starts_at:draft.starts_at,ends_at:draft.ends_at,menu_ids:draft.menu_ids,order_cutoff_at:draft.order_cutoff_at||null,fulfillment_dates:split(draft.fulfillment_dates),quantity_limit:draft.quantity_limit.trim()?Number(draft.quantity_limit):null};
    await saveItem(value,draft.id);
    } catch(error) { setFailed(true);setMessage(error instanceof Error ? error.message : 'Kontrollera priset och datumen.'); }
  }
  async function upload(file?:File) {
    if(!file || busy) return;setBusy(true);setMessage('Laddar upp filen…');setFailed(false);
    try { update('media_url',await uploadAdminFile(file));setMessage('Filen är uppladdad. Tryck Spara för att publicera.'); }
    catch(error) { setFailed(true);setMessage(error instanceof Error ? error.message : 'Uppladdningen misslyckades.'); }
    finally { setBusy(false); }
  }
  async function registerPush(event:React.FormEvent) {
    event.preventDefault();if(busy)return;setBusy(true);setMessage('');setFailed(false);
    try {
      const response = await fetch('/api/admin/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:pushToken})});
      const data = await response.json(); if(!response.ok) throw new Error(data.error);
      setPushToken('');setMessage('Pushtoken sparad. Mejl används alltid som reserv.');
    } catch(error) { setFailed(true);setMessage(error instanceof Error ? error.message : 'Kunde inte registrera push.'); }
    finally { setBusy(false); }
  }
  async function checkPush() {
    if(busy)return;setBusy(true);setMessage('');setFailed(false);
    try {
      const response = await fetch('/api/admin/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'check'})});
      const data = await response.json(); if(!response.ok) throw new Error(data.error);
      setMessage(`${data.checked} pushkvitton kontrollerade. Nya kvitton kan dröja cirka 15 minuter.`);
    } catch(error) { setFailed(true);setMessage(error instanceof Error ? error.message : 'Kunde inte kontrollera push.'); }
    finally { setBusy(false); }
  }
  return <div className="admin-panel">
    <div className="admin-actions">{allowedKinds.map(tab=><button type="button" disabled={busy} className={`btn ${kind===tab?'btn-primary':''}`} key={tab} onClick={()=>{setKind(tab);setDraft(null);setMessage('');setFailed(false);}}>{titles[tab]}</button>)}</div>
    <div className="admin-top"><h2>{titles[kind]}</h2><button type="button" disabled={busy} className="btn btn-primary" onClick={()=>{setDraft(draftFor());setMessage('');setFailed(false);}}>Lägg till</button></div>
    <p className="admin-note">Priser anges i kronor. Avpublicerade objekt sparas för orderhistoriken. En leveranszon matchar början på ett svenskt postnummer.</p>
    <div style={{overflowX:'auto'}}><table className="admin-table"><thead><tr><th>Namn</th><th>Pris / period</th><th>Publicerad</th><th>Åtgärder</th></tr></thead><tbody>{records[kind].map(item=><tr key={item.id}>
      <td>{'title' in item ? item.title : item.name}</td><td>{'price_ore' in item ? `${formatSek(item.price_ore)} / ${item.portion_label}` : 'fee_ore' in item ? `${formatSek(item.fee_ore)} · ${item.postal_prefixes.join(', ')}` : `${new Date(item.starts_at).toLocaleDateString('sv-SE')} – ${new Date(item.ends_at).toLocaleDateString('sv-SE')}`}</td>
      <td>{item.active?'Ja':'Nej'}</td><td><button className="btn" disabled={busy} onClick={()=>setDraft(draftFor(item))}>Ändra</button>{item.active&&<button className="btn" disabled={busy} onClick={()=>saveItem(undefined,item.id,true)}>Avpublicera</button>}</td>
    </tr>)}</tbody></table></div>
    {draft&&<form onSubmit={save} style={{marginTop:24}}><h3>{draft.id?'Ändra':'Lägg till'} {titles[kind].toLowerCase()}</h3><fieldset className="plain-fieldset" disabled={busy}>
      <div className="field"><label htmlFor="catalog-name">Namn / rubrik</label><input id="catalog-name" required maxLength={100} value={draft.title} onChange={event=>update('title',event.target.value)}/></div>
      {kind!=='delivery_zones'&&<div className="field"><label htmlFor="catalog-description">Beskrivning</label><textarea id="catalog-description" maxLength={kind==='dishes'?350:500} value={draft.description} onChange={event=>update('description',event.target.value)}/></div>}
      {kind!=='campaigns'&&<div className="field"><label htmlFor="catalog-price">{kind==='dishes'?'Styckpris i kronor':'Leveransavgift i kronor'}</label><input id="catalog-price" inputMode="decimal" required value={draft.price} onChange={event=>update('price',event.target.value)}/></div>}
      {kind==='dishes'&&<div className="field-grid"><div className="field"><label htmlFor="catalog-category">Kategori</label><select id="catalog-category" value={draft.category} onChange={event=>update('category',event.target.value as ItemCategory)}>{Object.entries({kalla_meze:'Kalla meze',varma_meze:'Varma meze',grill:'Grill',vegetariskt:'Vegetariskt',brod_saser:'Bröd och såser',dessert:'Dessert'}).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><div className="field"><label htmlFor="catalog-suggestion">Rekommenderat antal per person</label><input id="catalog-suggestion" type="number" min={0} max={20} step={0.01} value={draft.suggested_per_person} onChange={event=>update('suggested_per_person',Number(event.target.value))}/></div></div>}
      {kind==='dishes'&&<><div className="field"><label htmlFor="catalog-portion">Portionsstorlek, exempelvis 1 spett eller 250 g</label><input id="catalog-portion" required maxLength={100} value={draft.portion_label} onChange={event=>update('portion_label',event.target.value)}/></div><div className="field"><label htmlFor="catalog-allergens">Allergener (kommatecken)</label><input id="catalog-allergens" value={draft.allergens} onChange={event=>update('allergens',event.target.value)}/></div><div className="field"><label htmlFor="catalog-sort">Sortering</label><input id="catalog-sort" type="number" min={0} max={500} value={draft.sort_order} onChange={event=>update('sort_order',Number(event.target.value))}/></div></>}
      {kind==='dishes'&&<><label className="checkbox-label"><input type="checkbox" checked={draft.direct_addon_enabled} onChange={event=>update('direct_addon_enabled',event.target.checked)}/>Tillgänglig som tillbehör för direktpaket</label><div className="field-grid"><div className="field"><label htmlFor="addon-units">Kapacitetsenheter per tillbehör</label><input id="addon-units" type="number" min={1} max={10000} value={draft.kitchen_units} onChange={event=>update('kitchen_units',Number(event.target.value))}/></div><div className="field"><label htmlFor="addon-prep">Förberedelsetid för tillbehör (minuter)</label><input id="addon-prep" type="number" min={0} max={1440} value={draft.preparation_minutes} onChange={event=>update('preparation_minutes',Number(event.target.value))}/></div></div></>}
      {kind==='delivery_zones'&&<div className="field"><label htmlFor="catalog-postal">Postnummerprefix (kommatecken), exempelvis 721, 722</label><input id="catalog-postal" required value={draft.postal_prefixes} onChange={event=>update('postal_prefixes',event.target.value)}/></div>}
      {kind==='delivery_zones'&&<><label className="checkbox-label"><input type="checkbox" checked={draft.direct_enabled} onChange={event=>update('direct_enabled',event.target.checked)}/>Tillåt direktleverans i zonen</label><div className="field"><label htmlFor="catalog-travel">Företagets bekräftade transportbuffert (minuter)</label><input id="catalog-travel" type="number" min={0} max={480} value={draft.travel_minutes} onChange={event=>update('travel_minutes',event.target.value)}/><p className="field-hint">Använd endast en tid som företaget har fastställt eller verifierat hos en leveranstjänst. Tomt värde stänger direktleverans för zonen. Detta är en planeringsbuffert, ingen exakt körtidsprognos.</p></div></>}
      {kind==='delivery_zones'&&<div className="field-grid">{([['capacity_per_slot','Leveranskapacitet i zonen',1,1000],['max_package_quantity','Största antal paket per leverans',1,100],['delivery_window_minutes','Leveransfönstrets längd i minuter',5,120]] as const).map(([key,label,min,max])=><div className="field" key={key}><label htmlFor={`zone-${key}`}>{label}</label><input id={`zone-${key}`} type="number" required min={min} max={max} value={draft[key]} onChange={event=>update(key,Number(event.target.value))}/></div>)}</div>}
      {kind==='campaigns'&&<><div className="field-grid"><div className="field"><label htmlFor="campaign-start">Visas från (ISO med UTC-offset)</label><input id="campaign-start" required value={draft.starts_at} onChange={event=>update('starts_at',event.target.value)}/></div><div className="field"><label htmlFor="campaign-end">Visas till (ISO med UTC-offset)</label><input id="campaign-end" required value={draft.ends_at} onChange={event=>update('ends_at',event.target.value)}/></div></div><div className="field"><label htmlFor="campaign-cutoff">Sista beställningstid (ISO med UTC-offset, frivillig)</label><input id="campaign-cutoff" placeholder="2026-12-20T18:00:00+01:00" value={draft.order_cutoff_at} onChange={event=>update('order_cutoff_at',event.target.value)}/></div><div className="field"><label htmlFor="campaign-dates">Tillåtna hämtnings- och leveransdatum (ÅÅÅÅ-MM-DD, kommatecken)</label><input id="campaign-dates" value={draft.fulfillment_dates} onChange={event=>update('fulfillment_dates',event.target.value)}/><p className="field-hint">Tom lista följer ordinarie tidssystem. Servern kontrollerar kampanjdatum, sista beställningstid och mängdgräns.</p></div><div className="field"><label htmlFor="campaign-limit">Begränsad total mängd paket (frivillig)</label><input id="campaign-limit" type="number" min={1} max={1000000} value={draft.quantity_limit} onChange={event=>update('quantity_limit',event.target.value)}/></div><fieldset><legend>Beställningsbara paket</legend>{menus.map(menu=><label className="checkbox-label" key={menu.id}><input type="checkbox" checked={draft.menu_ids.includes(menu.id)} onChange={event=>update('menu_ids',event.target.checked?[...draft.menu_ids,menu.id]:draft.menu_ids.filter(id=>id!==menu.id))}/>{menu.title}</label>)}</fieldset></>}
      {kind!=='delivery_zones'&&<><div className="field"><label htmlFor="catalog-media">Bild {kind==='campaigns'?'eller video':''}</label><input id="catalog-media" type="file" accept={kind==='campaigns'?'image/jpeg,image/png,image/webp,video/mp4,video/webm':'image/jpeg,image/png,image/webp'} onChange={event=>upload(event.target.files?.[0])}/></div><div className="field"><label htmlFor="catalog-url">Mediaadress (HTTPS)</label><input id="catalog-url" value={draft.media_url} onChange={event=>update('media_url',event.target.value)}/></div></>}
      <label className="checkbox-label"><input type="checkbox" checked={draft.active} onChange={event=>update('active',event.target.checked)}/>{kind==='campaigns'?'Publicera inom den valda perioden':'Publicera godkända uppgifter'}</label>
      <div className="form-actions"><button disabled={busy} className="btn btn-primary" type="submit">Spara</button><button type="button" className="btn" onClick={()=>setDraft(null)}>Avbryt</button></div>
    </fieldset></form>}
    {(busy || message)&&<p className={failed?'form-error':'preview-note'} role={failed?'alert':'status'}>{busy?'Arbetar… Vänta tills åtgärden är klar.':message}</p>}
    <details style={{marginTop:32}}><summary>Ägarens pushnotiser</summary><p>Registrera en Expo-pushtoken från ägarens development build. EAS-projekt och FCM/APNs måste konfigureras innan push aktiveras. Ordermejl skickas alltid separat.</p><form onSubmit={registerPush}><div className="field"><label htmlFor="owner-push">Expo-pushtoken</label><input id="owner-push" required value={pushToken} onChange={event=>setPushToken(event.target.value)} autoComplete="off"/></div><button disabled={busy} className="btn" type="submit">Registrera enheten</button></form><button disabled={busy} className="btn" onClick={checkPush}>Kontrollera pushleverans</button></details>
  </div>;
}
