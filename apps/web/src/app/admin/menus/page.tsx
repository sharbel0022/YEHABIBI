import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminMenus } from '@/components/admin/AdminMenus';
import { AdminCatalog } from '@/components/admin/AdminCatalog';
import type { Campaign, Dish, Menu } from '@/types/domain';
export const dynamic='force-dynamic';
export default async function MenuAdmin() {
  if(!await requireAdmin()) return <AdminLogin/>;
  const db=adminDb();
  const [menus,dishes,campaigns]=await Promise.all([
    db.from('menus').select('*').order('sort_order'), db.from('dishes').select('*').order('sort_order'),
    db.from('campaigns').select('*').order('starts_at')
  ]);
  return <section className="shell admin-wrap"><h1>Meny och paket</h1><AdminNav/>
    {[menus,dishes,campaigns].some(result=>result.error) ? <p className="form-error">Katalogen kunde inte läsas. Kontrollera migrationerna och försök igen.</p> : <>
      <AdminMenus initialMenus={menus.data as Menu[]} dishes={dishes.data as Dish[]}/>
      <AdminCatalog initialDishes={dishes.data as Dish[]} initialCampaigns={campaigns.data as Campaign[]} initialZones={[]} menus={menus.data as Menu[]} allowedKinds={['dishes','campaigns']}/>
    </>}
  </section>;
}
