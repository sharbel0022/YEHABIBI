import Link from 'next/link';
export function AdminNav(){return <nav className="admin-tabs" aria-label="Administration"><Link href="/admin">Översikt</Link><Link href="/admin/orders">Beställningar</Link><Link href="/admin/menus">Menyer</Link><Link href="/admin/catalog">Maträtter, kampanjer och zoner</Link><Link href="/admin/settings">Inställningar</Link></nav>}
