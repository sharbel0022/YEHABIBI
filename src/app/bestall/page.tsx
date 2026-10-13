import type { Metadata } from 'next';
import { getMenus, getSettings } from '@/lib/data';
import { OrderForm } from '@/components/OrderForm';
import { isSupabaseReady } from '@/lib/config';

export const metadata: Metadata = { title:'Beställ libanesisk catering', description:'Välj libanesisk cateringmeny, antal gäster, datum och plats. Vi godkänner din förfrågan innan betalning.' };
export default async function OrderPage({searchParams}: {searchParams: Promise<{meny?: string; typ?: string}>}) {
  const [menus, settings, params] = await Promise.all([getMenus(),getSettings(),searchParams]);
  const canOrder = isSupabaseReady() && process.env.ORDERS_ENABLED === 'true' && menus.some(menu=>menu.price_ore>0) && !!settings.contact_email;
  return <section className="shell section inner-page form-shell"><span className="eyebrow">ENKELT ATT BESTÄLLA</span><h1>Beställ catering</h1><p className="intro">Välj en meny, ett datum och din plats. Vi återkommer med en bekräftelse innan du betalar.</p>
    {menus.length ? <OrderForm menus={menus} settings={settings} initialMenu={params.meny} initialOccasion={params.typ} enabled={canOrder} swishEnabled={process.env.STRIPE_SWISH_ENABLED === 'true'} /> : <p className="empty-state">Ägaren har inte publicerat några cateringmenyer ännu.</p>}
  </section>;
}
