import { redirect } from 'next/navigation';
import { paymentRuntimeInfo } from '@/lib/payments';
import type { Metadata } from 'next';
import { getCatalog } from '@/lib/data';
import { MenuCatalog } from '@/components/MenuCatalog';

export const metadata: Metadata = {
  title: 'Cateringmenyer & bygg egen meny i Västerås', alternates: { canonical: '/menyer' },
  description: 'Beställ libanesisk catering för vänner hemma, fest och företag. Välj ostrullar, hummus, grill och mer. Se pris per rätt och person.'
};

export default async function MenusPage({ searchParams }: { searchParams: Promise<{ val?: string; ratt?: string }> }) {
  // Den äldre kundvyn finns bara i den verifierade, isolerade testmiljön.
  if (!(await paymentRuntimeInfo()).isSimulation) redirect('/catering');
  const [catalog, params] = await Promise.all([getCatalog(), searchParams]);
  return <section className="shell section inner-page">
    <span className="eyebrow">SMÅ RÄTTER. STORA UPPLEVELSER.</span><h1>Våra menyer.</h1>
    <p className="intro">Mezze, grill och något sött. Välj en färdig meny eller samla era egna favoriter – vi hjälper er med resten.</p>
    <MenuCatalog initialCatalog={catalog} initialTab={params.val} initialDish={params.ratt}/>
  </section>;
}
