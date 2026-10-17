import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import type { CateringOrder } from '@/types/domain';
export const dynamic='force-dynamic';
export default async function AdminHome(){const user=await requireAdmin();if(!user)return <AdminLogin/>;
 const {data}=await adminDb().from('orders').select('*').order('created_at',{ascending:false}).limit(250);
 const orders=(data||[]) as CateringOrder[];
 const newCount=orders.filter(o=>o.status==='new').length;const approved=orders.filter(o=>o.status==='approved'||o.status==='ready').length;const paidOrders=orders.filter(o=>o.payment_status==='paid');const paid=paidOrders.length;const revenue=paidOrders.reduce((sum,o)=>sum+o.total_ore,0);
 return <section className="shell admin-wrap"><div className="admin-top"><div><span className="eyebrow">CEDAR MEZZE</span><h1>Ägarens översikt</h1></div><span className="admin-note">{user.email}</span></div><AdminNav/><div className="stat-row"><div><span>Nya förfrågningar</span><strong>{newCount}</strong></div><div><span>Godkända / pågående</span><strong>{approved}</strong></div><div><span>Betalda ordrar</span><strong>{paid}</strong><small>{(revenue/100).toLocaleString('sv-SE')} kr</small></div></div><div className="admin-panel" style={{marginTop:25}}><h2>Vad vill du göra?</h2><p>Du kan granska ordrar, lägga in godkända priser och byta ut bilder och video.</p><Link href="/admin/orders" className="btn btn-primary">Hantera beställningar →</Link></div></section>}
