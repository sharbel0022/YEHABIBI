'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './admin.css';

const links = [['/admin/innehall', 'Catering & Fest'], ['/admin/orders', 'Historiska beställningar'], ['/admin/menus', 'Äldre menyhantering'],
  ['/admin/tider', 'Intern kapacitet'], ['/admin/settings', 'Äldre inställningar']];

export function AdminNav() {
  const path = usePathname();
  return <nav className="admin-tabs" aria-label="Administration">{links.map(([href, label]) =>
    <Link key={href} href={href} aria-current={path === href || href === '/admin/menus' && ['/admin/catalog','/admin/ratter'].includes(path) ? 'page' : undefined}>{label}</Link>)}</nav>;
}
