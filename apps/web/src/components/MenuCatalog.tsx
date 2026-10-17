'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Catalog } from '@/types/domain';
import { MenuCard } from '@/components/MenuCard';
import { ItemPicker } from '@/components/ItemPicker';
import { useMenuDraft } from '@/components/order-draft';
import { formatSek } from '@/lib/domain';
import { orderLimits, quoteSelection, reconcileSelection } from '@yehabibi/shared';
import { useCatalog } from '@/components/use-catalog';
import { CatalogRefresh } from '@/components/CatalogRefresh';

type Props = { initialCatalog: Catalog; initialTab?: string; initialDish?: string };

export function MenuCatalog({ initialCatalog, initialTab, initialDish }: Props) {
  const { catalog, ...refreshState } = useCatalog(initialCatalog);
  const { menus, dishes, demo: preview } = catalog;
  const minPeople = catalog.settings.custom_min_people;
  const [tab, setTab] = useState<'paket' | 'bygg'>(initialTab === 'bygg' ? 'bygg' : 'paket');
  const chosen = dishes.find(dish => dish.id === initialDish && dish.price_ore > 0);
  const { draft, setDraft, notice } = useMenuDraft(chosen ? { quantities: { [chosen.id]: 1 } } : {}, catalog);
  const { guests } = draft;
  const selection = reconcileSelection(catalog, { menuId: null, quantities: draft.quantities, guests, occasion: 'hemma' });
  const { quantities } = selection;
  const selected = dishes.filter(dish => quantities[dish.id] > 0);
  const total = quoteSelection(catalog, selection);
  const error = !Number.isSafeInteger(guests) || guests < minPeople || guests > orderLimits.maxGuests ? `Välj mellan ${minPeople} och ${orderLimits.maxGuests.toLocaleString('sv-SE')} personer.`
    : selected.length && !total ? 'Kontrollera mängder och aktuella priser eller kontakta oss för en offert.' : '';
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
    <CatalogRefresh {...refreshState}/>
    {notice && <p className="preview-note" role="status">{notice}</p>}
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
          <input type="number" min={minPeople} max={orderLimits.maxGuests} value={guests || ''}
            onChange={event => setDraft(old => ({ ...old, guests: Number(event.target.value) }))}/>
        </label>
      </div>
      <ItemPicker dishes={dishes} guests={guests} quantities={quantities}
        summary={summary} onQuantityChange={(id, quantity) => setDraft(old => ({ ...old, quantities: { ...old.quantities, [id]: quantity }, mode: 'bygg' }))}/>
    </>}
  </div>;
}
