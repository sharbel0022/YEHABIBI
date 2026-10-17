import type { Metadata } from 'next';
import { getCatalog } from '@/lib/data';
import { OrderForm } from '@/components/OrderForm';

export const metadata: Metadata = {
  title: 'Beställ libanesisk catering hemma eller till fest', alternates: { canonical: '/bestall' },
  description: 'Bygg egen libanesisk catering med pris per maträtt, hemleverans eller hämtning. Skicka förfrågan för hemma, fest och företag.'
};

export default async function OrderPage({ searchParams }: {
  searchParams: Promise<{ meny?: string; typ?: string; val?: string; varor?: string; personer?: string }>
}) {
  const [catalog, params] = await Promise.all([getCatalog(), searchParams]);
  return <section className="shell section inner-page form-shell">
    <span className="eyebrow">ENKELT ATT BESTÄLLA</span><h1>Libanesisk catering på ditt sätt.</h1>
    <p className="intro">En kväll med vänner eller en stor fest – välj maten, se priset och skicka en förfrågan. Vi bekräftar innan betalning.</p>
    {catalog.menus.length || catalog.dishes.length ? <OrderForm
      menus={catalog.menus} dishes={catalog.dishes} zones={catalog.delivery_zones} settings={catalog.settings}
      enabled={catalog.orders_enabled} paymentMethods={catalog.payment_methods}
      initialMenu={params.meny} initialOccasion={params.typ} initialMode={params.val}
      initialItems={params.varor} initialGuests={params.personer}
    /> : <p className="empty-state">Ägaren har inte publicerat några cateringmenyer ännu.</p>}
  </section>;
}
