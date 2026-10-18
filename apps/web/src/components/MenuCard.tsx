'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Minus, Plus } from 'lucide-react';
import type { Menu } from '@/types/domain';
import { formatSek } from '@/lib/domain';

export function MenuCard({ menu, preview = false }: { menu: Menu; preview?: boolean }) {
  const [quantity, setQuantity] = useState(1);
  const direct = menu.direct_order_enabled === true;
  const portions = menu.package_portions || 1;
  return <article className="menu-card">
    <div className="menu-image-wrap"><img loading="lazy" src={menu.image_url || '/images/mezze.webp'} alt={menu.title}/></div>
    <div className="menu-card-body">
      <div className="menu-card-heading"><h3>{menu.title}</h3><span>{menu.price_ore > 0
        ? `${formatSek(menu.price_ore)} / ${direct ? 'paket' : 'person'}` : 'Pris på förfrågan'}</span></div>
      <p>{menu.description}</p><p className="field-hint">Innehåller: {menu.included.join(', ')}.<br/>Allergener: {menu.allergens.join(', ') || 'Kontakta oss'}.</p>
      {direct ? <>
        <div className="package-facts"><span>{portions} {portions === 1 ? 'portion' : 'portioner'} / paket</span><span>Förberedelse från {menu.preparation_minutes ?? 30} min</span></div>
        <p className="field-hint">{preview ? 'Förhandsvisning. Beställningarna är stängda.' : 'Lediga tider och kapacitet kontrolleras i nästa steg.'}</p>
        <div className="package-order"><div className="quantity-stepper" aria-label={`Antal paket ${menu.title}`}>
          <button type="button" aria-label={`Färre ${menu.title}`} disabled={quantity <= 1} onClick={() => setQuantity(value => value - 1)}><Minus size={16}/></button>
          <output aria-live="polite">{quantity}</output>
          <button type="button" aria-label={`Fler ${menu.title}`} disabled={quantity >= 100} onClick={() => setQuantity(value => value + 1)}><Plus size={16}/></button>
        </div><Link className="btn btn-primary" href={`/bestall-nu?meny=${encodeURIComponent(menu.id)}&antal=${quantity}`} aria-label={`Beställ nu: ${menu.title}`}>Beställ nu →</Link></div>
      </> : <p className="field-hint">Catering från {menu.min_people} personer · bokas i förväg</p>}
      {menu.catering_enabled !== false && <p className="package-catering"><Link className="text-link" href={preview ? '/kontakt' : `/bestall?meny=${encodeURIComponent(menu.id)}`}>Boka catering →</Link></p>}
    </div>
  </article>;
}
