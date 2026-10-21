import { redirect } from 'next/navigation';
import { paymentRuntimeInfo } from '@/lib/payments';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getCatalog } from '@/lib/data';
import { OrderForm } from '@/components/OrderForm';

export const metadata: Metadata = {
  title: 'Beställ libanesisk catering hemma eller till fest', alternates: { canonical: '/bestall' },
  description: 'Bygg egen libanesisk catering med pris per maträtt, hemleverans eller hämtning. Skicka förfrågan för hemma, fest och företag.'
};

export default async function OrderPage({ searchParams }: {
  searchParams: Promise<{ meny?: string; typ?: string; val?: string; varor?: string; personer?: string; kampanj?: string }>
}) {
  // Den äldre kundvyn finns bara i den verifierade, isolerade testmiljön.
  if (!(await paymentRuntimeInfo()).isSimulation) redirect('/catering/forfragan');
  const [catalog, params] = await Promise.all([getCatalog(), searchParams]);
  return <section className="shell section inner-page form-shell">
    <span className="eyebrow">BOKA CATERING I FÖRVÄG</span><h1>Libanesisk catering på ditt sätt.</h1>
    <p className="intro">En kväll med vänner eller en stor fest – välj maten, se priset och skicka en förfrågan. Vi bekräftar innan betalning.</p>
    <p><Link className="text-link" href="/bestall-nu">Vill du beställa ett färdigt paket? Beställ nu →</Link></p>
    {catalog.menus.length || catalog.dishes.length ? <OrderForm
      initialCatalog={catalog}
      initialMenu={params.meny} initialOccasion={params.typ} initialMode={params.val}
      initialItems={params.varor} initialGuests={params.personer} initialCampaign={params.kampanj}
    /> : <p className="empty-state">Ägaren har inte publicerat några cateringmenyer ännu.</p>}
  </section>;
}
