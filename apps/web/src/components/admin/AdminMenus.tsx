'use client';

import { useState } from 'react';
import type { Menu } from '@/types/domain';
import { formatSek, menuSchema } from '@yehabibi/shared';
import { uploadAdminFile } from '@/lib/browser-upload';

type Draft = { title: string; description: string; included: string; allergens: string; price: string; min_people: number; image_url: string; active: boolean; sort_order: number };
function toDraft(menu?: Menu): Draft {
  return { title: menu?.title || '', description: menu?.description || '', included: menu?.included.join(', ') || '',
    allergens: menu?.allergens.join(', ') || '', price: menu ? String(menu.price_ore / 100) : '', min_people: menu?.min_people || 10,
    image_url: menu?.image_url || '', active: menu?.active ?? false, sort_order: menu?.sort_order ?? 10 };
}
const list = (value: string) => value.split(',').map(part => part.trim()).filter(Boolean);

export function AdminMenus({ initialMenus }: { initialMenus: Menu[] }) {
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
    const parsed = menuSchema.safeParse({ ...draft, included: list(draft.included), allergens: list(draft.allergens), price_ore: Math.round(amount * 100), image_url: draft.image_url || null });
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
  return <div className="admin-panel"><div className="admin-top"><h2>Menyer och priser</h2><button type="button" disabled={busy} className="btn btn-primary" onClick={() => start()}>Ny meny</button></div>
    {!menus.length ? <p className="empty-state">Inga cateringpaket ännu. Skapa en meny och publicera när pris och innehåll är godkända.</p> : <table className="admin-table"><thead><tr><th>Meny</th><th>Pris per person</th><th>Min. personer</th><th>Synlig?</th><th>Åtgärd</th></tr></thead><tbody>{menus.map(menu => <tr key={menu.id}><td>{menu.title}</td><td>{menu.price_ore > 0 ? formatSek(menu.price_ore) : 'Pris saknas'}</td><td>{menu.min_people}</td><td>{menu.active ? 'Ja' : 'Nej'}</td><td><button type="button" disabled={busy} className="btn" onClick={() => start(menu)}>Ändra</button></td></tr>)}</tbody></table>}
    {editing && <form onSubmit={save} className="admin-panel"><h3>{editing === 'new' ? 'Ny meny' : 'Ändra meny'}</h3><fieldset className="plain-fieldset" disabled={busy}>
      <div className="field"><label htmlFor="menu-title">Namn</label><input id="menu-title" required minLength={2} maxLength={100} value={draft.title} onChange={event => field('title', event.target.value)}/></div>
      <div className="field"><label htmlFor="menu-description">Beskrivning</label><textarea id="menu-description" maxLength={350} value={draft.description} onChange={event => field('description', event.target.value)}/></div>
      <div className="field-grid"><div className="field"><label htmlFor="menu-price">Pris i kr/person</label><input id="menu-price" required inputMode="decimal" value={draft.price} onChange={event => field('price', event.target.value)}/></div>
        <div className="field"><label htmlFor="menu-minimum">Minsta antal personer</label><input id="menu-minimum" type="number" min={1} max={1000} required value={draft.min_people} onChange={event => field('min_people', Number(event.target.value))}/></div></div>
      <div className="field"><label htmlFor="menu-included">Innehåll (separera med komma)</label><textarea id="menu-included" value={draft.included} onChange={event => field('included', event.target.value)}/></div>
      <div className="field"><label htmlFor="menu-allergens">Allergener (separera med komma)</label><input id="menu-allergens" value={draft.allergens} onChange={event => field('allergens', event.target.value)}/></div>
      <div className="field"><label htmlFor="menu-upload">Ladda upp menybild</label><input id="menu-upload" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => uploadPhoto(event.target.files?.[0])}/></div>
      <div className="field"><label htmlFor="menu-image">Bildadress</label><input id="menu-image" value={draft.image_url} onChange={event => field('image_url', event.target.value)}/></div>
      <label className="checkbox-label"><input type="checkbox" checked={draft.active} onChange={event => field('active', event.target.checked)}/>Publicera godkänd meny</label>
      <div className="field"><label htmlFor="menu-sort">Sortering</label><input id="menu-sort" type="number" min={0} max={500} value={draft.sort_order} onChange={event => field('sort_order', Number(event.target.value))}/></div>
      <div className="form-actions"><button type="submit" className="btn btn-primary">Spara</button><button type="button" className="btn" onClick={() => setEditing(null)}>Avbryt</button></div>
    </fieldset></form>}
    {busy && <p role="status">Arbetar… Vänta tills åtgärden är klar.</p>}{error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status" className="preview-note">{message}</p>}
  </div>;
}
