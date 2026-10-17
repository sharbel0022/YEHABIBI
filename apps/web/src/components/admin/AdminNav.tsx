'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [['/admin', 'Översikt'], ['/admin/orders', 'Beställningar'], ['/admin/menus', 'Menyer'],
  ['/admin/ratter', 'Maträtter'], ['/admin/catalog', 'Kampanjer & leverans'], ['/admin/settings', 'Inställningar']];

export function AdminNav() {
  const path = usePathname();
  return <nav className="admin-tabs" aria-label="Administration">{links.map(([href, label]) =>
    <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>{label}</Link>)}</nav>;
}
