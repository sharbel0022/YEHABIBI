import { AdminHospitality } from '@/components/admin/AdminHospitality';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import { requireAdmin } from '@/lib/auth';
import { getAdminHospitalityCatalog } from '@/lib/hospitality';

export const dynamic = 'force-dynamic';
export default async function ContentAdmin() {
  if (!await requireAdmin()) return <AdminLogin/>;
  try {
    const { catalog, revision } = await getAdminHospitalityCatalog();
    return <section className="shell admin-wrap"><h1>Catering & Fest – innehåll</h1><AdminNav/><AdminHospitality initialCatalog={catalog} initialRevision={revision}/></section>;
  } catch {
    return <section className="shell admin-wrap"><h1>Catering & Fest – innehåll</h1><AdminNav/><p className="form-error" role="alert">Innehållskatalogen kunde inte läsas. Kontrollera databasanslutningen och Catering & Fest-migrationen.</p></section>;
  }
}
