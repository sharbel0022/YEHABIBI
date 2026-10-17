'use client';

import { useState, type ReactNode } from 'react';
import type { Dish, ItemCategory } from '@/types/domain';
import { categoryLabels, formatSek, orderLimits, suggestedQuantity } from '@/lib/domain';

const categories: Array<{ value: ItemCategory | 'alla'; label: string }> = [
  { value: 'alla', label: 'Alla rätter' },
  ...Object.entries(categoryLabels).map(([value, label]) => ({ value: value as ItemCategory, label }))
];

type Props = {
  dishes: Dish[];
  guests: number;
  quantities: Record<string, number>;
  onQuantityChange: (dishId: string, quantity: number) => void;
  summary?: ReactNode;
};

/** Samma rättväljare används i menykatalogen och beställningsformuläret. */
export function ItemPicker({ dishes, guests, quantities, onQuantityChange, summary }: Props) {
  const [filter, setFilter] = useState<ItemCategory | 'alla'>('alla');
  const available = dishes.filter(dish => dish.active);
  const visible = filter === 'alla' ? available : available.filter(dish => (dish.category || 'kalla_meze') === filter);

  return <div>
    <div className="dish-filter" role="group" aria-label="Filtrera rätter">
      {categories.map(category => <button key={category.value} type="button"
        className={filter === category.value ? 'dish-filter-active' : ''}
        aria-pressed={filter === category.value} onClick={() => setFilter(category.value)}>
        {category.label}
      </button>)}
    </div>
    {!available.length && <p>Ägaren har ännu inte publicerat några rätter.</p>}
    {available.length > 0 && !visible.length && <p>Inga rätter finns i den här kategorin ännu.</p>}
    {summary}
    <div className="dish-grid">
      {visible.map(dish => {
        const quantity = quantities[dish.id] || 0;
        const suggestion = suggestedQuantity(guests, dish.suggested_per_person);
        const priced = Number.isSafeInteger(dish.price_ore) && dish.price_ore > 0;
        const photo = dish.image_url || (dish.category === 'grill' ? '/images/grill.webp' : '/images/mezze.webp');
        return <article key={dish.id} className={`dish-card ${quantity ? 'dish-selected' : ''}`}>
          <img src={photo} alt={dish.image_url ? dish.title : 'Libanesisk catering – inspirationsbild'} loading="lazy" width={320} height={320}/>
          <div className="dish-body">
            <h3>{dish.title}</h3><p>{dish.description}</p>
            <strong>{priced ? `${formatSek(dish.price_ore)} / ${dish.portion_label}` : 'Pris fastställs av ägaren'}</strong>
            <small>{dish.suggested_per_person ? `Kökets riktmärke: ${dish.suggested_per_person} ${dish.portion_label} per person` : 'Köket anger rekommenderad mängd.'}</small>
            <small>Allergener: {dish.allergens.join(', ') || 'Fråga oss före beställning'}</small>
            {priced && suggestion > 0 && suggestion <= orderLimits.maxQuantity && <button type="button" className="dish-suggestion"
              onClick={() => onQuantityChange(dish.id, suggestion)}>
              Förslag för {guests} personer: {suggestion} {dish.portion_label}
            </button>}
            <div className="dish-controls">
              <button type="button" aria-label={`Ta bort en ${dish.title}`} disabled={quantity === 0}
                onClick={() => onQuantityChange(dish.id, Math.max(0, quantity - 1))}>−</button>
              <input type="number" aria-label={`Antal ${dish.title}`} value={quantity} min={0} max={orderLimits.maxQuantity} disabled={!priced}
                onChange={event => onQuantityChange(dish.id, Math.max(0, Math.min(orderLimits.maxQuantity, Math.floor(Number(event.target.value) || 0))))}/>
              <button type="button" aria-label={`Lägg till en ${dish.title}`} disabled={!priced || quantity >= orderLimits.maxQuantity}
                onClick={() => onQuantityChange(dish.id, Math.min(orderLimits.maxQuantity, quantity + 1))}>+</button>
              <span aria-live="polite">{priced && quantity > 0 ? `${quantity} × ${formatSek(dish.price_ore)} = ${formatSek(quantity * dish.price_ore)}` : 'Välj antal'}</span>
            </div>
          </div>
        </article>;
      })}
    </div>
  </div>;
}
