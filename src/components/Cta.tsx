import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
export function Cta({ href, children, light = false }: { href: string; children: React.ReactNode; light?: boolean }) {
  return <Link className={`btn ${light ? 'btn-outline-light' : 'btn-primary'}`} href={href}>{children} <ArrowUpRight size={18}/></Link>;
}
