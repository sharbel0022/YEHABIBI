import type { Metadata } from 'next';
import { getMenus } from '@/lib/data';
import { MenuCard } from '@/components/MenuCard';
import { isSupabaseReady } from '@/lib/config';
export const metadata: Metadata = { title: 'Cateringmenyer i Västerås', description: 'Se våra libanesiska cateringmenyer: mezze, grill och bufféer för fest, hem och företag.' };
export default async function Menus() {
  const menus = await getMenus();
  return <section className="shell section inner-page"><span className="eyebrow">LIBANESISKA SMAKER</span><h1>Våra cateringmenyer</h1><p className="intro">Upptäck våra favoriter för små och stora sällskap. Alla priser och allergener bekräftas före beställning.</p>
    {!isSupabaseReady() && <p className="preview-note">Detta är en förhandsvisning. Ägaren behöver lägga in verkliga priser.</p>}
    <div className="menu-grid">{menus.map(menu => <MenuCard key={menu.id} menu={menu} preview={!isSupabaseReady()} />)}</div>
    {!menus.length && <p>Menyer publiceras här så snart ägaren har godkänt dem.</p>}
  </section>;
}
