import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminSettings } from '@/components/admin/AdminSettings';
import type { Settings } from '@/types/domain';
export const dynamic='force-dynamic';
export default async function SettingsAdmin(){const user=await requireAdmin();if(!user)return <AdminLogin/>;const {data}=await adminDb().from('business_settings').select('*').eq('id',1).single();if(!data)throw new Error('Inställningar saknas. Kör databasens migration.');return <section className="shell admin-wrap"><h1>Inställningar</h1><AdminNav/><AdminSettings initialSettings={data as Settings}/></section>}
