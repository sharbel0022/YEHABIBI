'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Minus, Plus } from 'lucide-react';
import type { Menu } from '@/types/domain';
import { formatSek } from '@/lib/domain';
import './customer.css';

export function MenuCard({ menu: originalMenu, variants = [], preview = false, testMode = false }: { menu: Menu; variants?: Menu[]; preview?: boolean; testMode?: boolean }) {
  const [size, setSize] = useState(originalMenu.id);
  const menu = variants.find(item => item.id === size) || originalMenu;
  const [quantity, setQuantity] = useState(1);
  const direct = menu.direct_order_enabled === true;
  const displayPrice = direct ? menu.price_ore : menu.catering_price_ore ?? menu.price_ore;
  const portions = menu.package_portions || 1;
  return <article className="menu-card">
    <div className="menu-image-wrap"><img loading="lazy" src={menu.image_url || '/images/mezze.webp'} alt={menu.image_url ? menu.title : 'Inspirationsbild – paketbild saknas'}/></div>
    <div className="menu-card-body">
      {(!menu.image_url || preview || testMode) && <p className="field-hint">Inspirationsbild – {testMode ? 'syntetiskt testpaket, ingen godkänd produktbild.' : 'den exakta paketbilden behöver bekräftas av köket.'}</p>}
      <div className="menu-card-heading"><h3>{menu.title}</h3><span>{displayPrice > 0
        ? `${formatSek(displayPrice)} / ${direct ? 'paket' : 'person'}` : 'Pris på förfrågan'}</span></div>
      <p>{menu.description}</p><p className="field-hint">Innehåller: {menu.included.join(', ')}.<br/>Allergener: {menu.allergens.join(', ') || 'Kontakta oss'}.</p>
      {direct ? <>
        {variants.length > 1 && <label className="package-size">Välj paketstorlek<select value={menu.id} onChange={event => setSize(event.target.value)}>{variants.map(item => <option key={item.id} value={item.id}>{item.size_label || `${item.package_portions || 1} portioner`} · {formatSek(item.price_ore)} / paket</option>)}</select></label>}
        <div className="package-facts"><span>{portions} {portions === 1 ? 'portion' : 'portioner'} / paket</span><span>Förberedelse från {menu.preparation_minutes ?? 30} min</span></div>
        <p className="field-hint">{preview ? 'Förhandsvisning. Beställningarna är stängda.' : menu.availability_state === 'sold_out' ? 'Slutsålt' : menu.availability_state === 'paused' ? 'Pausat' : 'Lediga tider och kapacitet kontrolleras i nästa steg.'}</p>
        <div className="package-order"><div className="quantity-stepper" aria-label={`Antal paket ${menu.title}`}>
          <button type="button" aria-label={`Färre ${menu.title}`} disabled={quantity <= 1} onClick={() => setQuantity(value => value - 1)}><Minus size={16}/></button>
          <output aria-live="polite">{quantity}</output>
          <button type="button" aria-label={`Fler ${menu.title}`} disabled={quantity >= 100} onClick={() => setQuantity(value => value + 1)}><Plus size={16}/></button>
        </div>{menu.availability_state && menu.availability_state !== 'available' ? <button type="button" className="btn" disabled>{menu.availability_state === 'sold_out' ? 'Slutsålt' : 'Pausat'}</button> : <Link className="btn btn-primary" href={`/bestall-nu?meny=${encodeURIComponent(menu.id)}&antal=${quantity}`} aria-label={`Beställ nu: ${menu.title}`}>Beställ nu →</Link>}</div>
      </> : <p className="field-hint">Catering från {menu.min_people} personer · bokas i förväg</p>}
      {menu.catering_enabled !== false && <p className="package-catering"><Link className="text-link" href={preview ? '/kontakt' : `/bestall?meny=${encodeURIComponent(menu.id)}`}>Boka catering {direct && menu.catering_price_ore ? `· ${formatSek(menu.catering_price_ore)} / person` : ''} →</Link></p>}
    </div>
  </article>;
}
