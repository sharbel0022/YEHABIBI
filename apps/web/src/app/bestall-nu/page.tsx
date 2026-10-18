import Link from 'next/link';
import type { Metadata } from 'next';
import { getCatalog } from '@/lib/data';
import { DirectOrderForm } from '@/components/DirectOrderForm';

export const metadata: Metadata = {
  title: 'Beställ nu · färdiga libanesiska paket', alternates: { canonical: '/bestall-nu' },
  description: 'Välj ett färdigt libanesiskt matpaket och en ledig tid för hämtning eller hemleverans.'
};

export default async function DirectOrderPage({ searchParams }: { searchParams: Promise<{ meny?: string; antal?: string }> }) {
  const [catalog, params] = await Promise.all([getCatalog(), searchParams]);
  return <section className="shell section inner-page form-shell">
    <span className="eyebrow">MAT FÖR IDAG OCH SNART</span><h1>Beställ nu.</h1>
    <p className="intro">Välj paket, hämtning eller hemleverans och en ledig tid. Köket räknar på aktuell tid och kapacitet.</p>
    <p><Link className="text-link" href="/bestall">Planerar ni ett större sällskap? Boka catering →</Link></p>
    <DirectOrderForm initialCatalog={catalog} initialMenu={params.meny} initialQuantity={params.antal}/>
  </section>;
}
