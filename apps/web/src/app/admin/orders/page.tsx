import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminOrders } from '@/components/admin/AdminOrders';
import type { CateringOrder } from '@/types/domain';
export const dynamic='force-dynamic';
export default async function OrderAdmin(){const user=await requireAdmin();if(!user)return <AdminLogin/>;const {data}=await adminDb().from('orders').select('*,order_items(dish_id,item_id,menu_id,title,quantity,unit_label,unit_price_ore,total_ore)').order('created_at',{ascending:false}).limit(100);return <section className="shell admin-wrap"><div className="admin-top"><h1>Beställningar</h1></div><AdminNav/><AdminOrders initialOrders={(data||[]) as CateringOrder[]}/></section>}
