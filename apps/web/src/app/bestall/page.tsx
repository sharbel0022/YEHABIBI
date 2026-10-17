import type { Metadata } from 'next';
import { getCatalog } from '@/lib/data';
import { OrderForm } from '@/components/OrderForm';

export const metadata: Metadata = { title:'Beställ libanesisk catering', alternates: { canonical: '/bestall' }, description:'Välj libanesisk cateringmeny, antal gäster, datum och plats. Vi godkänner din förfrågan innan betalning.' };
export default async function OrderPage({searchParams}: {searchParams: Promise<{meny?: string; typ?: string}>}) {
  const [catalog, params] = await Promise.all([getCatalog(),searchParams]);
  const { menus, dishes, delivery_zones, settings, payment_methods } = catalog;
  return <section className="shell section inner-page form-shell"><span className="eyebrow">ENKELT ATT BESTÄLLA</span><h1>Beställ catering</h1><p className="intro">Välj en meny, ett datum och din plats. Vi återkommer med en bekräftelse innan du betalar.</p>
    {menus.length || dishes.length ? <OrderForm menus={menus} dishes={dishes} zones={delivery_zones} settings={settings} initialMenu={params.meny} initialOccasion={params.typ} enabled={catalog.orders_enabled} paymentMethods={payment_methods} /> : <p className="empty-state">Ägaren har inte publicerat några cateringmenyer ännu.</p>}
  </section>;
}
