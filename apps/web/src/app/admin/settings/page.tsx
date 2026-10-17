import { requireAdmin } from '@/lib/auth';
import { getSettings } from '@/lib/data';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminSettings } from '@/components/admin/AdminSettings';
export const dynamic='force-dynamic';
export default async function SettingsAdmin(){const user=await requireAdmin();if(!user)return <AdminLogin/>;const settings=await getSettings();return <section className="shell admin-wrap"><h1>Inställningar</h1><AdminNav/><AdminSettings initialSettings={settings}/></section>}
