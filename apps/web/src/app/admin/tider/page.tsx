import { requireAdmin } from '@/lib/auth';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminScheduling } from '@/components/admin/AdminScheduling';

export const dynamic = 'force-dynamic';
export default async function SchedulingAdmin() {
  if (!await requireAdmin()) return <AdminLogin/>;
  return <section className="shell admin-wrap"><h1>Tider och kapacitet</h1><AdminNav/><AdminScheduling/></section>;
}
