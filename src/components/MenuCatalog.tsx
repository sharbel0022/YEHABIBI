'use client';

import {useMemo,useState} from 'react';
import Link from 'next/link';
import type {Menu,MenuItem} from '@/types/domain';
import {MenuCard} from '@/components/MenuCard';
import {ItemPicker} from '@/components/ItemPicker';
import {calcItemsTotal,formatSek} from '@/lib/domain';

export function MenuCatalog({menus,items,initialTab,preview,minPeople}:{
  menus:Menu[];items:MenuItem[];initialTab?:string;preview:boolean;minPeople:number;
}) {
  const [tab,setTab]=useState<'paket'|'bygg'>(initialTab==='bygg'?'bygg':'paket');
  const [guests,setGuests]=useState(Math.max(minPeople,6));
  const [quantities,setQuantities]=useState<Record<string,number>>({});
  const selected=useMemo(()=>items.filter(item=>(quantities[item.id]||0)>0)
    .map(item=>({...item,quantity:quantities[item.id]})),[items,quantities]);
  const total=selected.length ? calcItemsTotal(selected.map(item=>({
    unit_price_ore:item.unit_price_ore,quantity:item.quantity
  })),guests,'pickup',0) : null;
  const urlParams=new URLSearchParams({val:'bygg',personer:String(guests),
    varor:selected.map(item=>`${item.id}:${item.quantity}`).join(',')});

  function changeQuantity(id:string,amount:number) {
    setQuantities(old=>({...old,[id]:amount}));
  }

  return <div>
    <div className="catalog-tabs" role="group" aria-label="Välj menyläge">
      <button type="button" className={tab==='paket'?'active':''} aria-pressed={tab==='paket'} onClick={()=>setTab('paket')}>Färdiga paket</button>
      <button type="button" className={tab==='bygg'?'active':''} aria-pressed={tab==='bygg'} onClick={()=>setTab('bygg')}>Bygg din egen meny</button>
    </div>
    {preview&&<p className="preview-note">Designexempel: alla styckpriser och portionsförslag måste godkännas av köket innan beställningar aktiveras.</p>}
    {tab==='paket'?<div className="menu-grid">
      {menus.map(menu=><MenuCard key={menu.id} menu={menu} preview={preview}/>)}
      {!menus.length&&<p>Inga färdiga paket finns ännu.</p>}
    </div>:<>
      <div className="builder-intro">
        <div><h2>Välj exakt vad ni vill äta.</h2><p>Även för en liten kväll hemma. Alla priser visas per styck och totalt.</p></div>
        <label className="field">Antal personer
          <input type="number" min={minPeople} max={1000} value={guests}
            onChange={e=>setGuests(Math.max(minPeople,Math.min(1000,Number(e.target.value)||minPeople)))} />
        </label>
      </div>
      <ItemPicker items={items} guests={guests} quantities={quantities} onQuantityChange={changeQuantity}/>
      <div className="builder-summary" aria-live="polite">
        <div><span>Mat totalt (utan leverans)</span><strong>{total?formatSek(total.subtotal_ore):'0 kr'}</strong></div>
        <div><span>Pris per person / {guests} gäster</span><strong>{total?formatSek(total.per_person_ore):'0 kr'}</strong></div>
        <p>Leveransavgift visas innan du skickar förfrågan. Det är en gemensam beställning.</p>
        <Link className="btn btn-primary" href={`/bestall?${urlParams.toString()}`}>
          Fortsätt till beställning →
        </Link>
      </div>
    </>}
  </div>;
}
