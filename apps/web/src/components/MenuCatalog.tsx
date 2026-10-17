'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Dish, Menu } from '@/types/domain';
import { MenuCard } from '@/components/MenuCard';
import { ItemPicker } from '@/components/ItemPicker';
import { calcDishTotal, formatSek } from '@/lib/domain';

type Props = { menus: Menu[]; dishes: Dish[]; initialTab?: string; preview: boolean; minPeople: number };

export function MenuCatalog({ menus, dishes, initialTab, preview, minPeople }: Props) {
  const [tab, setTab] = useState<'paket' | 'bygg'>(initialTab === 'bygg' ? 'bygg' : 'paket');
  const [guests, setGuests] = useState(Math.max(minPeople, 6));
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const selected = dishes.filter(dish => quantities[dish.id] > 0);
  const items = selected.map(dish => ({ dish_id: dish.id, quantity: quantities[dish.id] }));
  let total: ReturnType<typeof calcDishTotal> | null = null;
  let error = '';
  try {
    if (items.length) total = calcDishTotal(items, dishes, guests, 'pickup', 0);
  } catch { error = 'Beställningen överstiger beloppsgränsen. Minska antal eller kontakta oss för en offert.'; }
  const params = new URLSearchParams({ val: 'bygg', personer: String(guests),
    varor: selected.map(dish => `${dish.id}:${quantities[dish.id]}`).join(',') });

  return <div>
    <div className="catalog-tabs" role="group" aria-label="Välj menyläge">
      <button type="button" className={tab === 'paket' ? 'active' : ''} aria-pressed={tab === 'paket'}
        onClick={() => setTab('paket')}>Färdiga paket</button>
      <button type="button" className={tab === 'bygg' ? 'active' : ''} aria-pressed={tab === 'bygg'}
        onClick={() => setTab('bygg')}>Bygg din egen meny</button>
    </div>
    {preview && <p className="preview-note">Förhandsvisning. Köket behöver publicera och godkänna priser, portionsstorlekar och allergener innan beställningarna öppnar.</p>}
    {tab === 'paket' ? <div className="menu-grid">
      {menus.map(menu => <MenuCard key={menu.id} menu={menu} preview={preview}/>)}
      {!menus.length && <p>Inga färdiga paket finns ännu.</p>}
    </div> : <>
      <div className="builder-intro">
        <div><h2>Välj exakt vad ni vill äta.</h2><p>Även för en liten kväll hemma. Alla priser visas per styck och totalt.</p></div>
        <label className="field">Antal personer
          <input type="number" min={minPeople} max={1000} value={guests}
            onChange={event => setGuests(Math.max(minPeople, Math.min(1000, Number(event.target.value) || minPeople)))}/>
        </label>
      </div>
      <ItemPicker dishes={dishes} guests={guests} quantities={quantities}
        onQuantityChange={(id, quantity) => setQuantities(old => ({ ...old, [id]: quantity }))}/>
      <div className="builder-summary" aria-live="polite">
        {selected.map(dish => <div className="builder-line" key={dish.id}>
          <span>{quantities[dish.id]} × {dish.title} ({formatSek(dish.price_ore)})</span>
          <strong>{formatSek(quantities[dish.id] * dish.price_ore)}</strong>
        </div>)}
        <div><span>Mat totalt (utan leverans)</span><strong>{total ? formatSek(total.subtotal_ore) : 'Välj maträtter'}</strong></div>
        <div><span>Pris per person / {guests} gäster</span><strong>{total ? formatSek(total.price_per_person_ore) : '–'}</strong></div>
        <p>Leveransavgift visas innan du skickar förfrågan. Det är en gemensam beställning.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {total && !error ? <Link className="btn btn-primary" href={`/bestall?${params.toString()}`}>Fortsätt till beställning →</Link>
          : <button type="button" className="btn btn-primary" disabled>Välj maträtter för att fortsätta</button>}
      </div>
    </>}
  </div>;
}
