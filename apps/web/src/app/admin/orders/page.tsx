import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { statusLabels, paymentStatusLabels } from '@/lib/domain';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminOrders } from '@/components/admin/AdminOrders';
import type { CateringOrder } from '@/types/domain';

export const dynamic = 'force-dynamic';
type Filters = { search?: string; status?: string; payment?: string; order_type?: string; page?: string };

export default async function OrderAdmin({ searchParams }: { searchParams: Promise<Filters> }) {
  const user = await requireAdmin();
  if (!user) return <AdminLogin/>;
  const params = await searchParams;
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.page)) || 1));
  const search = (params.search || '').replace(/[^\p{L}\p{N}@+\- .]/gu, '').slice(0, 100);
  const status = params.status && Object.hasOwn(statusLabels, params.status) ? params.status : '';
  const payment = params.payment && Object.hasOwn(paymentStatusLabels, params.payment) ? params.payment : '';
  const orderType = params.order_type === 'direct' || params.order_type === 'catering' ? params.order_type : '';
  let query = adminDb().from('orders').select('*,order_items(dish_id,item_id,menu_id,title,quantity,unit_label,unit_price_ore,total_ore)', { count: 'exact' })
    .order('created_at', { ascending: false }).range((page - 1) * 100, page * 100 - 1);
  if (status) query = query.eq('status', status);
  if (payment) query = query.eq('payment_status', payment);
  if (orderType) query = query.eq('order_type', orderType);
  if (search) query = query.or(['code', 'full_name', 'email', 'phone', 'menu_title'].map(field => `${field}.ilike.%${search}%`).join(','));
  const { data, count, error } = await query;
  function pageLink(value: number) {
    return `/admin/orders?${new URLSearchParams({ search, status, payment, order_type: orderType, page: String(value) })}`;
  }
  return <section className="shell admin-wrap"><div className="admin-top"><h1>Beställningar</h1></div><AdminNav/>
    {error ? <p className="form-error">Beställningarna kunde inte läsas. Uppdatera sidan och försök igen.</p>
      : <AdminOrders key={`${page}-${search}-${status}-${payment}-${orderType}`} initialOrders={(data || []) as CateringOrder[]} totalCount={count || 0} filters={{ search, status, payment, order_type: orderType }}/>}
    <div className="form-actions">{page > 1 && <Link className="btn" href={pageLink(page - 1)}>← Föregående</Link>}
      <span className="admin-note">Sida {page} av {Math.max(1, Math.ceil((count || 0) / 100))}</span>
      {page * 100 < (count || 0) && <Link className="btn" href={pageLink(page + 1)}>Nästa →</Link>}</div>
  </section>;
}
