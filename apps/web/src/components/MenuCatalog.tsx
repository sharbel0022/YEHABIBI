'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Dish, Menu } from '@/types/domain';
import { MenuCard } from '@/components/MenuCard';
import { ItemPicker } from '@/components/ItemPicker';
import { useMenuDraft } from '@/components/order-draft';
import { calcDishTotal, formatSek } from '@/lib/domain';

type Props = { menus: Menu[]; dishes: Dish[]; initialTab?: string; initialDish?: string; preview: boolean; minPeople: number };

export function MenuCatalog({ menus, dishes, initialTab, initialDish, preview, minPeople }: Props) {
  const [tab, setTab] = useState<'paket' | 'bygg'>(initialTab === 'bygg' ? 'bygg' : 'paket');
  const chosen = dishes.find(dish => dish.id === initialDish && dish.price_ore > 0);
  const { draft, setDraft } = useMenuDraft(chosen ? { quantities: { [chosen.id]: 1 } } : {}, dishes, minPeople);
  const { guests, quantities } = draft;
  const selected = dishes.filter(dish => quantities[dish.id] > 0);
  const items = selected.map(dish => ({ dish_id: dish.id, quantity: quantities[dish.id] }));
  let total: ReturnType<typeof calcDishTotal> | null = null;
  let error = '';
  try {
    if (!Number.isSafeInteger(guests) || guests < minPeople || guests > 1000) error = `Välj mellan ${minPeople} och 1 000 personer.`;
    else if (items.length) total = calcDishTotal(items, dishes, guests, 'pickup', 0);
  } catch { error = 'Beställningen överstiger beloppsgränsen. Minska antal eller kontakta oss för en offert.'; }
  const params = new URLSearchParams({ val: 'bygg', personer: String(guests),
    varor: selected.map(dish => `${dish.id}:${quantities[dish.id]}`).join(',') });
  const summary = <div className="builder-summary" aria-live="polite">
    <div className="builder-summary-title"><strong>{selected.length ? `${selected.length} valda rätter` : 'Välj dina favoriter'}</strong><span>{guests} personer</span></div>
    <div className="builder-checkout"><div><span>Mat totalt</span><strong>{total ? formatSek(total.subtotal_ore) : 'Välj maträtter'}</strong>
      <small>{total ? `${formatSek(total.price_per_person_ore)} / person` : 'Priset visas när du väljer'}</small></div>
      {total && !error ? <Link className="btn btn-primary" href={`/bestall?${params.toString()}`}>Fortsätt till beställning →</Link>
        : <button type="button" className="btn btn-primary" disabled>Välj maträtter för att fortsätta</button>}</div>
    {selected.length > 0 && <details className="builder-details"><summary>Visa dina val och styckpriser</summary>{selected.map(dish => <div className="builder-line" key={dish.id}>
      <span>{quantities[dish.id]} × {dish.title} ({formatSek(dish.price_ore)} / {dish.portion_label})</span><strong>{formatSek(quantities[dish.id] * dish.price_ore)}</strong>
    </div>)}</details>}
    <p>Leverans väljer du i nästa steg. Pris per person är en jämförelse. Dina matval sparas i den här fliken.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;

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
        <div><span className="eyebrow">ER MENY, ERA FAVORITER</span><h2>Lite av allt. Precis som ni vill.</h2><p>Börja med antal gäster. Välj sedan rätter och mängder i lugn och ro.</p></div>
        <label className="field">Antal personer
          <input type="number" min={minPeople} max={1000} value={guests || ''}
            onChange={event => setDraft(old => ({ ...old, guests: Number(event.target.value) }))}/>
        </label>
      </div>
      <ItemPicker dishes={dishes} guests={guests} quantities={quantities}
        summary={summary} onQuantityChange={(id, quantity) => setDraft(old => ({ ...old, quantities: { ...old.quantities, [id]: quantity }, mode: 'bygg' }))}/>
    </>}
  </div>;
}
