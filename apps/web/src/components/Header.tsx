'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import {useState} from 'react';
import {Brand} from '@/components/Brand';
const links=[['/','Hem'],['/menyer','Menyer'],['/festcatering-vasteras','För fest'],['/foretagscatering-vasteras','För företag'],['/om-oss','Om oss'],['/kontakt','Kontakt']];
export function Header(){
  const [open,setOpen]=useState(false);
  const path=usePathname();
  return <header className="header"><div className="header-inner"><Brand/>
    <nav className={`primary-nav ${open?'open':''}`} aria-label="Huvudmeny">
      {links.map(([href,label])=><Link key={href} aria-current={path===href?'page':undefined} onClick={()=>setOpen(false)} href={href}>{label}</Link>)}
      <Link className="nav-mobile-cta" href="/bestall" onClick={()=>setOpen(false)}>Beställ catering</Link>
    </nav>
    <Link href="/bestall" className="btn btn-primary header-cta">Beställ catering <ArrowUpRight size={15}/></Link>
    <button className="nav-toggle" aria-label={open?'Stäng meny':'Öppna meny'} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button>
  </div></header>;
}
