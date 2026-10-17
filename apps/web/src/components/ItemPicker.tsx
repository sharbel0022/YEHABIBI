'use client';

import { useState } from 'react';
import type { Dish, ItemCategory } from '@/types/domain';
import { formatSek } from '@/lib/domain';

const categories: Array<{ value: ItemCategory | 'alla'; label: string }> = [
  { value: 'alla', label: 'Alla rätter' },
  { value: 'kalla_meze', label: 'Kalla meze' },
  { value: 'varma_meze', label: 'Varma meze' },
  { value: 'grill', label: 'Grill' },
  { value: 'vegetariskt', label: 'Vegetariskt' },
  { value: 'brod_saser', label: 'Bröd & såser' },
  { value: 'dessert', label: 'Dessert' }
];

type Props = {
  dishes: Dish[];
  guests: number;
  quantities: Record<string, number>;
  onQuantityChange: (dishId: string, quantity: number) => void;
};

/** Samma rättväljare används i menykatalogen och beställningsformuläret. */
export function ItemPicker({ dishes, guests, quantities, onQuantityChange }: Props) {
  const [filter, setFilter] = useState<ItemCategory | 'alla'>('alla');
  const visible = filter === 'alla' ? dishes : dishes.filter(dish => (dish.category || 'kalla_meze') === filter);

  return <div>
    <div className="dish-filter" role="group" aria-label="Filtrera rätter">
      {categories.map(category => <button key={category.value} type="button"
        className={filter === category.value ? 'dish-filter-active' : ''}
        aria-pressed={filter === category.value} onClick={() => setFilter(category.value)}>
        {category.label}
      </button>)}
    </div>
    {!dishes.length && <p>Ägaren har ännu inte publicerat några rätter.</p>}
    {dishes.length > 0 && !visible.length && <p>Inga rätter finns i den här kategorin ännu.</p>}
    <div className="dish-grid">
      {visible.map(dish => {
        const quantity = quantities[dish.id] || 0;
        const suggestion = Math.ceil(guests * (dish.suggested_per_person || 0));
        const priced = Number.isSafeInteger(dish.price_ore) && dish.price_ore > 0;
        const photo = dish.image_url || (dish.category === 'grill' ? '/images/grill.webp' : '/images/mezze.webp');
        return <article key={dish.id} className={`dish-card ${quantity ? 'dish-selected' : ''}`}>
          <img src={photo} alt={dish.image_url ? dish.title : 'Libanesisk catering – inspirationsbild'} loading="lazy" width={320} height={320}/>
          <div className="dish-body">
            <h3>{dish.title}</h3><p>{dish.description}</p>
            <strong>{priced ? `${formatSek(dish.price_ore)} / ${dish.portion_label}` : 'Pris fastställs av ägaren'}</strong>
            {dish.suggested_per_person ? <small>Kökets riktmärke: {dish.suggested_per_person} {dish.portion_label} per person</small> : null}
            <small>Allergener: {dish.allergens.join(', ') || 'Fråga oss före beställning'}</small>
            {priced && suggestion > 0 && suggestion <= 1000 && <button type="button" className="dish-suggestion"
              onClick={() => onQuantityChange(dish.id, suggestion)}>
              Förslag för {guests} personer: {suggestion} {dish.portion_label}
            </button>}
            <div className="dish-controls">
              <button type="button" aria-label={`Ta bort en ${dish.title}`} disabled={quantity === 0}
                onClick={() => onQuantityChange(dish.id, Math.max(0, quantity - 1))}>−</button>
              <input type="number" aria-label={`Antal ${dish.title}`} value={quantity} min={0} max={1000} disabled={!priced}
                onChange={event => onQuantityChange(dish.id, Math.max(0, Math.min(1000, Math.floor(Number(event.target.value) || 0))))}/>
              <button type="button" aria-label={`Lägg till en ${dish.title}`} disabled={!priced || quantity >= 1000}
                onClick={() => onQuantityChange(dish.id, Math.min(1000, quantity + 1))}>+</button>
              <span aria-live="polite">{priced && quantity > 0 ? `${quantity} × ${formatSek(dish.price_ore)} = ${formatSek(quantity * dish.price_ore)}` : 'Välj antal'}</span>
            </div>
          </div>
        </article>;
      })}
    </div>
  </div>;
}
