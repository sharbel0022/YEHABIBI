import type {Metadata} from 'next';
import {getMenus,getMenuItems,getSettings} from '@/lib/data';
import {MenuCatalog} from '@/components/MenuCatalog';
import {isSupabaseReady} from '@/lib/config';

export const metadata:Metadata = {
  title:'Cateringmenyer & bygg egen meny i Västerås',
  description:'Beställ libanesisk catering för 5–10 vänner hemma, fest och företag. Välj ostrullar, hummus, grill och mer. Se pris per person.'
};

export default async function MenusPage({searchParams}:{
  searchParams:Promise<{val?:string}>
}) {
  const [menus,items,settings,params]=await Promise.all([
    getMenus(),getMenuItems(),getSettings(),searchParams
  ]);
  return <section className="shell section inner-page">
    <span className="eyebrow">LIBANESISKA SMAKER</span>
    <h1>Menyer som passar just er.</h1>
    <p className="intro">Välj ett färdigt paket eller bygg din egen catering. Du bestämmer antal och ser priset direkt – även för ett mindre sällskap hemma.</p>
    <MenuCatalog menus={menus} items={items} initialTab={params.val}
      minPeople={settings.custom_min_people} preview={!isSupabaseReady()}/>
  </section>;
}
