'use client';

import { useState } from 'react';
import type { Dish, Menu } from '@/types/domain';
import { formatSek, menuSchema } from '@yehabibi/shared';
import { uploadAdminFile } from '@/lib/browser-upload';

type Draft = { title: string; description: string; included: string; allergens: string; price: string; min_people: number; image_url: string; active: boolean; sort_order: number;
  direct_order_enabled: boolean; catering_enabled: boolean; package_portions: number; preparation_minutes: number; extra_preparation_minutes: number; extra_preparation_every: number;
  catering_price:string;package_group:string;size_label:string;availability_state:'available'|'paused'|'sold_out';kitchen_units:number;allowed_addon_ids:string[] };
function toDraft(menu?: Menu): Draft {
  return { title: menu?.title || '', description: menu?.description || '', included: menu?.included.join(', ') || '',
    allergens: menu?.allergens.join(', ') || '', price: menu ? String(menu.price_ore / 100) : '', min_people: menu?.min_people || 10,
    image_url: menu?.image_url || '', active: menu?.active ?? false, sort_order: menu?.sort_order ?? 10,
    direct_order_enabled: menu?.direct_order_enabled === true, catering_enabled: menu?.catering_enabled !== false,
    package_portions: menu?.package_portions ?? 1, preparation_minutes: menu?.preparation_minutes ?? 30,
    extra_preparation_minutes: menu?.extra_preparation_minutes ?? 0, extra_preparation_every: menu?.extra_preparation_every ?? 5,
    catering_price:menu?.catering_price_ore!=null?String(menu.catering_price_ore/100):'',package_group:menu?.package_group||'',size_label:menu?.size_label||'',availability_state:menu?.availability_state||'available',kitchen_units:menu?.kitchen_units??1,allowed_addon_ids:menu?.allowed_addon_ids||[] };
}
const list = (value: string) => value.split(',').map(part => part.trim()).filter(Boolean);

export function AdminMenus({ initialMenus,dishes=[] }: { initialMenus: Menu[];dishes?:Dish[] }) {
  const [menus, setMenus] = useState(initialMenus);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(toDraft());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  function field<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(old => ({ ...old, [key]: value })); }
  function start(menu?: Menu) { if (busy) return; setEditing(menu?.id || 'new'); setDraft(toDraft(menu)); setError(''); setMessage(''); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setError(''); setMessage('');
    const amount = Number(draft.price.replace(',', '.'));
    if (!draft.price.trim() || !Number.isFinite(amount) || amount < 0 || (draft.active && amount <= 0)) return setError('Ange ett godkänt pris större än 0 kr innan menyn publiceras.');
    const cateringAmount=draft.catering_price.trim()?Number(draft.catering_price.replace(',','.')):null;
    if(draft.catering_enabled&&(cateringAmount===null||!Number.isFinite(cateringAmount)||cateringAmount<=0))return setError('Ange ett separat godkänt cateringpris per person, eller avaktivera catering för detta paket.');
    const parsed = menuSchema.safeParse({ ...draft, included: list(draft.included), allergens: list(draft.allergens), price_ore: Math.round(amount * 100),catering_price_ore:cateringAmount===null?0:Math.round(cateringAmount*100), image_url: draft.image_url || null });
    if (!parsed.success) return setError('Kontrollera namn, pris, minsta antal, bildadress och sortering.');
    setBusy(true);
    try {
      const isNew = editing === 'new';
      const response = await fetch(isNew ? '/api/admin/menus' : `/api/admin/menus/${editing}`, { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Kunde inte spara menyn.');
      setMenus(old => [...old.filter(menu => menu.id !== data.menu.id), data.menu].sort((a, b) => a.sort_order - b.sort_order));
      setEditing(null); setMessage('Menyn är sparad.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ett fel inträffade. Försök igen.'); }
    finally { setBusy(false); }
  }
  async function uploadPhoto(file?: File) {
    if (!file || busy) return; setBusy(true); setError(''); setMessage('Laddar upp bilden…');
    try { field('image_url', await uploadAdminFile(file)); setMessage('Bilden är uppladdad. Spara menyn för att publicera.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Uppladdningen misslyckades.'); setMessage(''); }
    finally { setBusy(false); }
  }
  async function availability(menu:Menu,state:Draft['availability_state']) {
    if(busy)return;setBusy(true);setError('');setMessage('');
    try {
      const response=await fetch(`/api/admin/menus/${menu.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'availability',availability_state:state})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Tillgängligheten kunde inte sparas.');
      setMenus(old=>old.map(item=>item.id===menu.id?data.menu:item));setMessage('Tillgängligheten är sparad. Befintliga beställningar är kvar.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Åtgärden misslyckades.');}finally{setBusy(false);}
  }
  return <div className="admin-panel"><div className="admin-top"><h2>Menyer och priser</h2><button type="button" disabled={busy} className="btn btn-primary" onClick={() => start()}>Ny meny</button></div>
    {!menus.length ? <p className="empty-state">Inga matpaket ännu. Skapa en meny och publicera när pris och innehåll är godkända.</p> : <table className="admin-table"><thead><tr><th>Meny</th><th>Pris</th><th>Beställningsläge</th><th>Tillgänglighet</th><th>Åtgärd</th></tr></thead><tbody>{menus.map(menu => <tr key={menu.id}><td>{menu.title}<br/><small>{menu.size_label}</small></td><td>{formatSek(menu.price_ore)} / paket{menu.catering_enabled!==false&&<><br/>{formatSek(menu.catering_price_ore??menu.price_ore)} / person</>}</td><td>{menu.direct_order_enabled ? 'Direktbeställning' : ''}{menu.direct_order_enabled && menu.catering_enabled !== false ? ' + ' : ''}{menu.catering_enabled !== false ? 'Catering' : ''}</td><td>{menu.active ? ({available:'Tillgänglig',paused:'Pausad',sold_out:'Slutsåld'}[menu.availability_state||'available']) : 'Avpublicerad'}</td><td><button type="button" disabled={busy} className="btn" onClick={() => start(menu)}>Ändra</button><button type="button" disabled={busy} className="btn" onClick={()=>availability(menu,menu.availability_state==='sold_out'?'available':'sold_out')}>{menu.availability_state==='sold_out'?'Gör tillgänglig':'Markera slutsåld'}</button></td></tr>)}</tbody></table>}
    {editing && <form onSubmit={save} className="admin-panel"><h3>{editing === 'new' ? 'Ny meny' : 'Ändra meny'}</h3><fieldset className="plain-fieldset" disabled={busy}>
      <div className="field"><label htmlFor="menu-title">Namn</label><input id="menu-title" required minLength={2} maxLength={100} value={draft.title} onChange={event => field('title', event.target.value)}/></div>
      <div className="field"><label htmlFor="menu-description">Beskrivning</label><textarea id="menu-description" maxLength={350} value={draft.description} onChange={event => field('description', event.target.value)}/></div>
      <div className="field-grid"><div className="field"><label htmlFor="menu-price">Direktpris i kr per paket</label><input id="menu-price" required inputMode="decimal" value={draft.price} onChange={event => field('price', event.target.value)}/></div>
        <div className="field"><label htmlFor="menu-minimum">Minsta antal personer</label><input id="menu-minimum" type="number" min={1} max={1000} required value={draft.min_people} onChange={event => field('min_people', Number(event.target.value))}/></div></div>
      <div className="field"><label htmlFor="menu-included">Innehåll (separera med komma)</label><textarea id="menu-included" value={draft.included} onChange={event => field('included', event.target.value)}/></div>
      <div className="field"><label htmlFor="menu-allergens">Allergener (separera med komma)</label><input id="menu-allergens" value={draft.allergens} onChange={event => field('allergens', event.target.value)}/></div>
      <h3>Beställningslägen och förberedelse</h3>
      <label className="checkbox-label"><input type="checkbox" checked={draft.direct_order_enabled} onChange={event => field('direct_order_enabled', event.target.checked)}/>Tillgänglig för Beställ nu</label>
      <label className="checkbox-label"><input type="checkbox" checked={draft.catering_enabled} onChange={event => field('catering_enabled', event.target.checked)}/>Tillgänglig för Boka catering</label>
      <div className="field"><label htmlFor="menu-catering-price">Separat cateringpris i kr per person</label><input id="menu-catering-price" inputMode="decimal" required={draft.catering_enabled} value={draft.catering_price} onChange={event=>field('catering_price',event.target.value)}/></div>
      <div className="field-grid"><div className="field"><label htmlFor="menu-group">Paketgrupp (samma för storleksvarianter)</label><input id="menu-group" maxLength={80} value={draft.package_group} onChange={event=>field('package_group',event.target.value)}/></div><div className="field"><label htmlFor="menu-size">Storlek, exempelvis 5 personer</label><input id="menu-size" maxLength={60} value={draft.size_label} onChange={event=>field('size_label',event.target.value)}/></div></div>
      <div className="field"><label htmlFor="menu-state">Tillgänglighet för nya beställningar</label><select id="menu-state" value={draft.availability_state} onChange={event=>field('availability_state',event.target.value as Draft['availability_state'])}><option value="available">Tillgänglig</option><option value="paused">Pausad</option><option value="sold_out">Slutsåld</option></select></div>
      <div className="field"><label htmlFor="menu-units">Kökets kapacitetsenheter per paket</label><input id="menu-units" type="number" min={1} max={1000} value={draft.kitchen_units} onChange={event=>field('kitchen_units',Number(event.target.value))}/></div>
      <fieldset><legend>Tillåtna tillbehör till paketet</legend>{dishes.filter(dish=>dish.direct_addon_enabled).map(dish=><label className="checkbox-label" key={dish.id}><input type="checkbox" checked={draft.allowed_addon_ids.includes(dish.id)} onChange={event=>field('allowed_addon_ids',event.target.checked?[...draft.allowed_addon_ids,dish.id]:draft.allowed_addon_ids.filter(id=>id!==dish.id))}/>{dish.title} · {formatSek(dish.price_ore)} / {dish.portion_label}</label>)}<p className="field-hint">Aktivera rätten som tillbehör i katalogen nedan. Paketets ordinarie innehåll byts inte automatiskt.</p></fieldset>
      <div className="field-grid">{([
        ['package_portions', 'Portioner per paket', 1, 10], ['preparation_minutes', 'Förberedelsetid (minuter)', 1, 1440],
        ['extra_preparation_every', 'Extra tid efter varje grupp om antal paket', 1, 100], ['extra_preparation_minutes', 'Extra minuter per ytterligare grupp', 0, 1440]
      ] as const).map(([key, label, min, max]) => <div className="field" key={key}><label htmlFor={`menu-${key}`}>{label}</label><input id={`menu-${key}`} required type="number" min={min} max={max} value={draft[key]} onChange={event => field(key, Number(event.target.value))}/></div>)}</div>
      <p className="field-hint">Exempel: gruppstorlek 5 ger extra tid vid 6, 11, 16 paket. Öppettider, buffert och kapacitet styrs under Tider och kapacitet.</p>
      <div className="field"><label htmlFor="menu-upload">Ladda upp menybild</label><input id="menu-upload" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => uploadPhoto(event.target.files?.[0])}/></div>
      <div className="field"><label htmlFor="menu-image">Bildadress</label><input id="menu-image" value={draft.image_url} onChange={event => field('image_url', event.target.value)}/></div>
      <label className="checkbox-label"><input type="checkbox" checked={draft.active} onChange={event => field('active', event.target.checked)}/>Publicera godkänd meny</label>
      <div className="field"><label htmlFor="menu-sort">Sortering</label><input id="menu-sort" type="number" min={0} max={500} value={draft.sort_order} onChange={event => field('sort_order', Number(event.target.value))}/></div>
      <div className="form-actions"><button type="submit" className="btn btn-primary">Spara</button><button type="button" className="btn" onClick={() => setEditing(null)}>Avbryt</button></div>
    </fieldset></form>}
    {busy && <p role="status">Arbetar… Vänta tills åtgärden är klar.</p>}{error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status" className="preview-note">{message}</p>}
  </div>;
}

