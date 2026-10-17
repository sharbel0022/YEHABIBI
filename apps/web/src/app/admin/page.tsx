import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { formatSek } from '@/lib/domain';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import type { CateringOrder } from '@/types/domain';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const user = await requireAdmin();
  if (!user) return <AdminLogin/>;
  const { data, error } = await adminDb().from('orders').select('status,payment_status,total_ore').order('created_at', { ascending: false }).limit(250);
  const orders = (data || []) as Pick<CateringOrder, 'status' | 'payment_status' | 'total_ore'>[];
  const waiting = orders.filter(order => ['new', 'reviewing', 'changes_requested'].includes(order.status)).length;
  const ongoing = orders.filter(order => ['approved', 'preparing', 'ready', 'dispatched'].includes(order.status)).length;
  const paid = orders.filter(order => order.payment_status === 'paid');
  const revenue = paid.reduce((sum, order) => sum + order.total_ore, 0);
  return <section className="shell admin-wrap"><div className="admin-top"><div><span className="eyebrow">YEHABIBI · CEDAR MEZZE</span><h1>Kökets översikt</h1></div><span className="admin-note">{user.email}</span></div><AdminNav/>
    {error ? <p className="form-error">Översikten kunde inte läsas. Uppdatera sidan och försök igen.</p> : <>
      <p className="admin-note">Översikt över de senaste {orders.length} beställningarna (högst 250). Alla beställningar finns under Beställningar.</p>
      <div className="stat-row"><div><span>Behöver granskas</span><strong>{waiting}</strong></div><div><span>Godkända & pågående</span><strong>{ongoing}</strong></div>
        <div><span>Verifierat betalda</span><strong>{paid.length}</strong><small>{formatSek(revenue)}</small></div></div>
    </>}
    <div className="admin-panel"><h2>Redo för nästa förfrågan?</h2><p>Se kundens meny, kontrollera datum och pris, och ge ett tydligt besked.</p><Link href="/admin/orders" className="btn btn-primary">Hantera beställningar →</Link></div>
  </section>;
}
