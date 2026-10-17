import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminCatalog } from '@/components/admin/AdminCatalog';
import type { Campaign, DeliveryZone, Dish, Menu } from '@/types/domain';

export const dynamic = 'force-dynamic';
export default async function CatalogAdmin() {
  if(!await requireAdmin()) return <AdminLogin/>;
  const db = adminDb();
  const [dishes,campaigns,zones,menus] = await Promise.all([
    db.from('dishes').select('*').order('sort_order'),db.from('campaigns').select('*').order('starts_at'),
    db.from('delivery_zones').select('*').order('name'),db.from('menus').select('id,title').order('sort_order')
  ]);
  return <section className="shell admin-wrap"><h1>Katalog och leverans</h1><AdminNav/>
    {[dishes,campaigns,zones,menus].some(result=>result.error) ? <p className="form-error">Katalogen kunde inte läsas. Kontrollera V3-migrationen.</p> : <AdminCatalog initialDishes={dishes.data as Dish[]} initialCampaigns={campaigns.data as Campaign[]} initialZones={zones.data as DeliveryZone[]} menus={menus.data as Pick<Menu,'id'|'title'>[]}/>}
  </section>;
}
