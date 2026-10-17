import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminMenus } from '@/components/admin/AdminMenus';
import type { Menu } from '@/types/domain';
export const dynamic='force-dynamic';
export default async function MenuAdmin(){const user=await requireAdmin();if(!user)return <AdminLogin/>;const {data}=await adminDb().from('menus').select('*').order('sort_order');return <section className="shell admin-wrap"><h1>Menyer</h1><AdminNav/><AdminMenus initialMenus={(data||[]) as Menu[]}/></section>}
