'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Menu,X,ArrowUpRight} from 'lucide-react';
import {useState} from 'react';
import {Brand} from '@/components/Brand';

const links=[
  ['/', 'Hem'],
  ['/menyer', 'Menyer'],
  ['/bestall', 'Boka catering'],
  ['/#sa-funkar-det', 'Så fungerar det'],
  ['/kontakt', 'Kontakt']
];

export function Header(){
  const [open,setOpen]=useState(false);
  const path=usePathname();
  return <header className="header"><div className="header-inner">
    <Brand/>
    <nav id="primary-navigation" className={`primary-nav ${open?'open':''}`} aria-label="Huvudmeny">
      {links.map(([href,label])=><Link key={href} href={href}
        aria-current={path===href?'page':undefined} onClick={()=>setOpen(false)}>{label}</Link>)}
      <Link href="/bestall-nu" className="nav-mobile-cta" onClick={()=>setOpen(false)}>Beställ nu</Link>
    </nav>
    <Link href="/bestall-nu" className="btn btn-primary header-cta">Beställ nu <ArrowUpRight size={16}/></Link>
    <button type="button" className="nav-toggle" aria-controls="primary-navigation" aria-label={open?'Stäng meny':'Öppna meny'} aria-expanded={open} onClick={()=>setOpen(!open)}>
      {open?<X/>:<Menu/>}
    </button>
  </div></header>;
}
