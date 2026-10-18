import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminScheduling } from '@/components/admin/AdminScheduling';
import { AdminCapacity } from '@/components/admin/AdminCapacity';
import { AdminCatalog } from '@/components/admin/AdminCatalog';
import type { DeliveryZone } from '@/types/domain';
export const dynamic='force-dynamic';
export default async function SchedulingAdmin() {
  if (!await requireAdmin()) return <AdminLogin/>;
  const {data,error}=await adminDb().from('delivery_zones').select('*').order('name');
  return <section className="shell admin-wrap"><h1>Tider och kapacitet</h1><AdminNav/><AdminScheduling/><AdminCapacity/>
    {error ? <p className="form-error">Leveranszonerna kunde inte läsas.</p> : <AdminCatalog initialDishes={[]} initialCampaigns={[]} initialZones={(data||[]) as DeliveryZone[]} menus={[]} allowedKinds={['delivery_zones']}/>}
  </section>;
}
