import type {Metadata} from 'next';
import {getMenus,getMenuItems,getSettings} from '@/lib/data';
import {OrderForm} from '@/components/OrderForm';
import {isSupabaseReady} from '@/lib/config';

export const metadata:Metadata={
  title:'Beställ libanesisk catering hemma eller till fest',
  description:'Bygg egen libanesisk catering med pris per maträtt, hemleverans eller hämtning. Skicka förfrågan för hemma, fest och företag.'
};

export default async function OrderPage({searchParams}:{
  searchParams:Promise<{meny?:string;typ?:string;val?:string;varor?:string;personer?:string}>
}) {
  const [menus,items,settings,params]=await Promise.all([
    getMenus(),getMenuItems(),getSettings(),searchParams
  ]);
  const anyPriced=menus.some(m=>m.price_ore>0)||items.some(item=>item.unit_price_ore>0);
  const enabled=isSupabaseReady()&&process.env.ORDERS_ENABLED==='true'&&
    anyPriced&&!!settings.contact_email;
  return <section className="shell section inner-page form-shell">
    <span className="eyebrow">ENKELT ATT BESTÄLLA</span>
    <h1>Libanesisk catering på ditt sätt.</h1>
    <p className="intro">En kväll med vänner eller en stor fest – välj maten, se priset och skicka en förfrågan. Vi bekräftar innan betalning.</p>
    {menus.length||items.length?<OrderForm
      menus={menus} items={items} settings={settings} enabled={enabled}
      swishEnabled={process.env.STRIPE_SWISH_ENABLED==='true'}
      initialMenu={params.meny} initialOccasion={params.typ} initialMode={params.val}
      initialItems={params.varor} initialGuests={params.personer}
    />:<p>Ägaren har inte publicerat några cateringmenyer ännu.</p>}
  </section>;
}
