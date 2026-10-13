import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import type {Menu} from '@/types/domain';
import {formatSek} from '@/lib/domain';
export function MenuCard({menu,preview=false}:{menu:Menu;preview?:boolean}){
  return <article className="menu-card"><div className="menu-image-wrap"><img loading="lazy" src={menu.image_url||'/images/mezze.webp'} alt={`Illustration till ${menu.title}`}/></div>
    <div className="menu-card-body"><div className="menu-card-heading"><h3>{menu.title}</h3><span>{menu.price_ore>0?`${formatSek(menu.price_ore)} / person`:'Pris på förfrågan'}</span></div>
    <p>{menu.description}</p><div className="menu-card-footer"><small>Från {menu.min_people} personer</small><Link href={preview?'/kontakt':`/bestall?meny=${encodeURIComponent(menu.id)}`} aria-label={`Beställ ${menu.title}`}><ArrowUpRight size={20}/></Link></div></div></article>;
}
