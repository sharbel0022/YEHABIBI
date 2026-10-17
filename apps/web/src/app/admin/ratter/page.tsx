import {requireAdmin} from '@/lib/auth';
import {adminDb} from '@/lib/supabase';
import {AdminLogin} from '@/components/admin/AdminLogin';
import {AdminNav} from '@/components/admin/AdminNav';
import {AdminItems} from '@/components/admin/AdminItems';
import type {MenuItem} from '@/types/domain';

export const dynamic='force-dynamic';
export default async function DishAdminPage(){
  const user=await requireAdmin();
  if(!user)return <AdminLogin/>;
  const {data,error}=await adminDb().from('menu_items').select('*').order('sort_order');
  return <section className="shell admin-wrap">
    <h1>Maträtter</h1><AdminNav/>
    {error?<p className="form-error">Kunde inte läsa rätter. Kontrollera att migration 0002 har körts.</p>
      :<AdminItems initialItems={(data||[]) as MenuItem[]}/>}
  </section>;
}
