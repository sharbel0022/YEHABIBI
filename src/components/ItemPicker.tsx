'use client';

import {useState} from 'react';
import type {ItemCategory, MenuItem} from '@/types/domain';
import {formatSek} from '@/lib/domain';

/** One reusable quantity selector for both Menyer and the order form. */
const categories: Array<{value:ItemCategory | 'alla'; label:string}> = [
  {value:'alla',label:'Alla rätter'},
  {value:'kalla_meze',label:'Kalla meze'},
  {value:'varma_meze',label:'Varma meze'},
  {value:'grill',label:'Grill'},
  {value:'vegetariskt',label:'Vegetariskt'},
  {value:'brod_saser',label:'Bröd & såser'},
  {value:'dessert',label:'Dessert'}
];

type Props = {
  items:MenuItem[];
  guests:number;
  quantities:Record<string,number>;
  onQuantityChange:(itemId:string,quantity:number)=>void;
};

export function ItemPicker({items,guests,quantities,onQuantityChange}:Props) {
  const [filter,setFilter] = useState<ItemCategory | 'alla'>('alla');
  const visible = filter === 'alla' ? items : items.filter(item => item.category === filter);
  return <div>
    <div className="dish-filter" aria-label="Filtrera rätter">
      {categories.map(category => <button
        key={category.value} type="button"
        className={filter === category.value ? 'dish-filter-active' : ''}
        aria-pressed={filter === category.value}
        onClick={()=>setFilter(category.value)}
      >{category.label}</button>)}
    </div>
    {items.length===0 && <p>Ägaren har ännu inte publicerat några rätter.</p>}
    <div className="dish-grid">
      {visible.map(item => {
        const quantity=quantities[item.id]||0;
        const suggestion=Math.ceil(guests*item.suggested_per_person);
        return <article key={item.id} className="dish-card">
          {item.image_url && <img src={item.image_url} alt={item.title} loading="lazy"/>}
          <div className="dish-body">
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <strong>{formatSek(item.unit_price_ore)} / {item.unit_label}</strong>
            <small>Allergener: {item.allergens.join(', ')||'Fråga oss före beställning'}</small>
            {suggestion>0&&<button type="button" className="dish-suggestion"
              onClick={()=>onQuantityChange(item.id,Math.min(100,suggestion))}>
              Förslag för {guests} personer: {suggestion} {item.unit_label}
            </button>}
            <div className="dish-controls">
              <button type="button" aria-label={`Ta bort en ${item.title}`}
                disabled={quantity===0} onClick={()=>onQuantityChange(item.id,Math.max(0,quantity-1))}>−</button>
              <output aria-live="polite" aria-label={`${quantity} ${item.unit_label}`}>{quantity}</output>
              <button type="button" aria-label={`Lägg till en ${item.title}`}
                disabled={quantity>=100} onClick={()=>onQuantityChange(item.id,Math.min(100,quantity+1))}>+</button>
              <span>{quantity>0?formatSek(quantity*item.unit_price_ore):'Välj antal'}</span>
            </div>
          </div>
        </article>;
      })}
    </div>
  </div>;
}
