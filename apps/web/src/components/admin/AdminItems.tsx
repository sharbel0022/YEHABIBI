'use client';

import {useState} from 'react';
import type {ItemCategory,MenuItem} from '@/types/domain';
import {formatSek} from '@/lib/domain';
import {uploadAdminFile} from '@/lib/browser-upload';

const categoryLabels:Record<ItemCategory,string>={
  kalla_meze:'Kalla meze',varma_meze:'Varma meze',grill:'Grill',
  vegetariskt:'Vegetariskt',brod_saser:'Bröd & såser',dessert:'Dessert'
};
type Draft={
  title:string;description:string;category:ItemCategory;unit_label:string;
  unitPrice:string;suggested_per_person:number;allergens:string;
  image_url:string;active:boolean;sort_order:number;
};
function makeDraft(item?:MenuItem):Draft {
  return {
    title:item?.title||'',description:item?.description||'',
    category:item?.category||'kalla_meze',unit_label:item?.unit_label||'styck',
    unitPrice:item?String(item.unit_price_ore/100):'',
    suggested_per_person:item?.suggested_per_person||0,
    allergens:item?.allergens.join(', ')||'',image_url:item?.image_url||'',
    active:item?.active??false,sort_order:item?.sort_order??100
  };
}
export function AdminItems({initialItems}:{initialItems:MenuItem[]}) {
  const [items,setItems]=useState(initialItems);
  const [editing,setEditing]=useState<string|null>(null);
  const [draft,setDraft]=useState<Draft>(makeDraft());
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);

  function edit(item?:MenuItem) {
    if(busy)return;
    setDraft(makeDraft(item));setEditing(item?.id||'new');setError('');
  }
  function field<K extends keyof Draft>(key:K,value:Draft[K]){
    setDraft(old=>({...old,[key]:value}));
  }
  async function save(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy)return;setError('');setBusy(true);
    try {
      const amount=Number(draft.unitPrice.replace(',','.'));
      if(!Number.isFinite(amount)||amount<0||amount>10000)throw new Error('Ange ett styckpris mellan 0 och 10 000 kr.');
      if(draft.active && amount<=0)throw new Error('Ange ett godkänt pris större än 0 kr innan rätten publiceras.');
      const payload={
        title:draft.title,description:draft.description,category:draft.category,
        unit_label:draft.unit_label,unit_price_ore:Math.round(amount*100),
        suggested_per_person:draft.suggested_per_person,
        allergens:draft.allergens.split(',').map(x=>x.trim()).filter(Boolean),
        image_url:draft.image_url||null,active:draft.active,sort_order:draft.sort_order
      };
      const newItem=editing==='new';
      const response=await fetch(newItem?'/api/admin/items':`/api/admin/items/${editing}`,{
        method:newItem?'POST':'PATCH',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Kunde inte spara maträtt.');
      const saved=result.item as MenuItem;
      setItems(old=>[...old.filter(x=>x.id!==saved.id),saved].sort((a,b)=>a.sort_order-b.sort_order));
      setEditing(null);
    }catch(reason){setError(reason instanceof Error?reason.message:'Ett fel inträffade.');}
    finally{setBusy(false);}
  }
  async function upload(file:File|undefined) {
    if(!file || busy)return;
    setBusy(true);setError('');
    try {const url=await uploadAdminFile(file);field('image_url',url);}
    catch(e){setError(e instanceof Error?e.message:'Bild kunde inte laddas upp.');}
    finally{setBusy(false);}
  }

  return <div className="admin-panel">
    <div className="admin-top"><div><h2>Maträtter och styckpriser</h2>
      <p className="admin-note">Ägaren bestämmer alla priser och portionsförslag. Inga exempelpriser ska aktiveras av misstag.</p></div>
      <button type="button" disabled={busy} className="btn btn-primary" onClick={()=>edit()}>Ny maträtt</button>
    </div>
    <div className="admin-list">
      {items.map(item=><div key={item.id} className="admin-row">
        <div><strong>{item.title}</strong><small>{categoryLabels[item.category]} · {formatSek(item.unit_price_ore)} / {item.unit_label} · {item.active?'Publicerad':'Dold'}</small></div>
        <button type="button" disabled={busy} className="btn" onClick={()=>edit(item)}>Ändra</button>
      </div>)}
      {!items.length&&<p>Lägg till dina första libanesiska maträtter.</p>}
    </div>
    {editing&&<form onSubmit={save} className="admin-panel" style={{marginTop:24}}>
      <h3>{editing==='new'?'Ny rätt':'Ändra rätt'}</h3>
      <fieldset className="plain-fieldset" disabled={busy}>
      <div className="field"><label htmlFor="itemTitle">Namn</label>
        <input id="itemTitle" required minLength={2} maxLength={90} value={draft.title} onChange={e=>field('title',e.target.value)}/></div>
      <div className="field"><label htmlFor="itemDescription">Kort beskrivning</label>
        <textarea id="itemDescription" maxLength={350} value={draft.description} onChange={e=>field('description',e.target.value)}/></div>
      <div className="field-grid">
        <div className="field"><label htmlFor="itemCategory">Kategori</label>
          <select id="itemCategory" value={draft.category} onChange={e=>field('category',e.target.value as ItemCategory)}>
            {Object.entries(categoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select></div>
        <div className="field"><label htmlFor="unitLabel">Prisenhet, t.ex. styck eller fat</label>
          <input id="unitLabel" required maxLength={35} value={draft.unit_label} onChange={e=>field('unit_label',e.target.value)}/></div>
      </div>
      <div className="field-grid">
        <div className="field"><label htmlFor="itemPrice">Pris per enhet i kronor</label>
          <input id="itemPrice" inputMode="decimal" required value={draft.unitPrice} onChange={e=>field('unitPrice',e.target.value)}/></div>
        <div className="field"><label htmlFor="suggestion">Rekommenderat antal per gäst</label>
          <input id="suggestion" type="number" min="0" max="20" step="0.01" value={draft.suggested_per_person}
            onChange={e=>field('suggested_per_person',Number(e.target.value))}/></div>
      </div>
      <div className="field"><label htmlFor="allergens">Allergener (separera med komma)</label>
        <input id="allergens" value={draft.allergens} onChange={e=>field('allergens',e.target.value)}/></div>
      <div className="field"><label htmlFor="dishImage">Bild från ägaren/fotografen</label>
        <input id="dishImage" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
          onChange={e=>upload(e.target.files?.[0])}/>
        <input aria-label="Bildadress" value={draft.image_url} onChange={e=>field('image_url',e.target.value)} placeholder="https://..."/></div>
      <div className="field"><label htmlFor="itemSort">Sorteringsnummer</label>
        <input id="itemSort" type="number" min="0" max="500" value={draft.sort_order}
          onChange={e=>field('sort_order',Number(e.target.value))}/></div>
      <label className="checkbox-label"><input type="checkbox" checked={draft.active} onChange={e=>field('active',e.target.checked)}/>
        Visa maträtten i beställningssystemet</label>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="btn btn-primary" disabled={busy} type="submit">Spara maträtt</button>
        <button className="btn" type="button" onClick={()=>setEditing(null)}>Avbryt</button></div>
    </fieldset></form>}
    {busy&&<p role="status">Arbetar… Vänta tills åtgärden är klar.</p>}
  </div>;
}
