import type { Metadata } from 'next';
import { getCatalog } from '@/lib/data';
import { MenuCatalog } from '@/components/MenuCatalog';

export const metadata: Metadata = {
  title: 'Cateringmenyer & bygg egen meny i Västerås', alternates: { canonical: '/menyer' },
  description: 'Beställ libanesisk catering för vänner hemma, fest och företag. Välj ostrullar, hummus, grill och mer. Se pris per rätt och person.'
};

export default async function MenusPage({ searchParams }: { searchParams: Promise<{ val?: string }> }) {
  const [catalog, params] = await Promise.all([getCatalog(), searchParams]);
  return <section className="shell section inner-page">
    <span className="eyebrow">LIBANESISKA SMAKER</span><h1>Menyer som passar just er.</h1>
    <p className="intro">Välj ett färdigt paket eller bygg din egen catering. Du bestämmer antal och ser priset direkt – även för ett mindre sällskap hemma.</p>
    <MenuCatalog menus={catalog.menus} dishes={catalog.dishes} initialTab={params.val}
      minPeople={catalog.settings.custom_min_people} preview={catalog.demo}/>
  </section>;
}
